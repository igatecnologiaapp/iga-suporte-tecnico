-- === Perfis: telefone e status ===
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status public.record_status NOT NULL DEFAULT 'active';
GRANT UPDATE (phone) ON public.profiles TO authenticated;

-- === Chamados: agendamento, transferencia e ultima atividade ===
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS scheduled_note text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS transfer_reason text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
GRANT UPDATE (scheduled_at, scheduled_note, transfer_reason) ON public.tickets TO authenticated;

-- === Historico de agendamentos ===
CREATE TABLE IF NOT EXISTS public.ticket_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  technician_id uuid REFERENCES public.technicians(id),
  note text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ticket_schedules TO authenticated;
GRANT ALL ON public.ticket_schedules TO service_role;
ALTER TABLE public.ticket_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read schedules" ON public.ticket_schedules FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS ticket_schedules_ticket_idx ON public.ticket_schedules(ticket_id, created_at DESC);

-- === Notificacoes internas ===
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users mark own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_sla_unique ON public.notifications(user_id, ticket_id, event_type) WHERE event_type IN ('sla_warning','sla_breached');

-- === Auditoria administrativa ===
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id),
  target_user_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read admin audit" ON public.admin_audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- === Impedir auto-elevacao de perfil ===
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND new.user_id = auth.uid() AND (TG_OP = 'INSERT' OR new.role IS DISTINCT FROM old.role) THEN
    RAISE EXCEPTION 'Um usuário não pode alterar o próprio perfil de acesso';
  END IF;
  RETURN new;
END; $$;
DROP TRIGGER IF EXISTS user_roles_no_self_escalation ON public.user_roles;
CREATE TRIGGER user_roles_no_self_escalation BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

-- === Ultima atividade a partir da timeline ===
CREATE OR REPLACE FUNCTION public.touch_ticket_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.tickets SET last_activity_at = new.created_at WHERE id = new.ticket_id;
  RETURN new;
END; $$;
DROP TRIGGER IF EXISTS ticket_events_touch_activity ON public.ticket_events;
CREATE TRIGGER ticket_events_touch_activity AFTER INSERT ON public.ticket_events
FOR EACH ROW EXECUTE FUNCTION public.touch_ticket_activity();

-- === Notificacoes internas por evento do chamado ===
CREATE OR REPLACE FUNCTION public.notify_ticket_users()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  tech_user uuid;
  prev_tech_user uuid;
  ticket_label text := new.number || ' — ' || new.subject;
BEGIN
  SELECT user_id INTO tech_user FROM public.technicians WHERE id = new.assigned_technician_id;
  IF TG_OP = 'UPDATE' AND old.assigned_technician_id IS DISTINCT FROM new.assigned_technician_id THEN
    SELECT user_id INTO prev_tech_user FROM public.technicians WHERE id = old.assigned_technician_id;
    IF tech_user IS NOT NULL AND tech_user IS DISTINCT FROM actor THEN
      INSERT INTO public.notifications(user_id, ticket_id, event_type, title, body)
      VALUES (tech_user, new.id, CASE WHEN old.assigned_technician_id IS NULL THEN 'assigned' ELSE 'transferred' END,
        CASE WHEN old.assigned_technician_id IS NULL THEN 'Chamado atribuído a você' ELSE 'Chamado transferido para você' END,
        ticket_label || COALESCE(' · Motivo: ' || NULLIF(btrim(COALESCE(new.transfer_reason,'')), ''), ''));
    END IF;
    IF prev_tech_user IS NOT NULL AND prev_tech_user IS DISTINCT FROM actor THEN
      INSERT INTO public.notifications(user_id, ticket_id, event_type, title, body)
      VALUES (prev_tech_user, new.id, 'transferred_away', 'Chamado transferido para outro técnico', ticket_label);
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND old.status IS DISTINCT FROM new.status AND new.status = 'reopened' AND tech_user IS NOT NULL AND tech_user IS DISTINCT FROM actor THEN
    INSERT INTO public.notifications(user_id, ticket_id, event_type, title, body)
    VALUES (tech_user, new.id, 'reopened', 'Chamado reaberto', ticket_label);
  END IF;
  IF TG_OP = 'UPDATE' AND old.scheduled_at IS DISTINCT FROM new.scheduled_at AND new.scheduled_at IS NOT NULL AND tech_user IS NOT NULL AND tech_user IS DISTINCT FROM actor THEN
    INSERT INTO public.notifications(user_id, ticket_id, event_type, title, body)
    VALUES (tech_user, new.id, CASE WHEN old.scheduled_at IS NULL THEN 'scheduled' ELSE 'rescheduled' END,
      CASE WHEN old.scheduled_at IS NULL THEN 'Chamado agendado' ELSE 'Chamado reagendado' END, ticket_label);
  END IF;
  RETURN new;
END; $$;
DROP TRIGGER IF EXISTS tickets_notify ON public.tickets;
CREATE TRIGGER tickets_notify AFTER UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_users();

-- === Timeline: transferencia e agendamento ===
CREATE OR REPLACE FUNCTION public.audit_ticket_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE actor uuid := auth.uid(); old_tech text; new_tech text;
BEGIN
  IF actor IS NULL THEN actor := COALESCE(new.created_by, old.created_by); END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ticket_events(ticket_id, actor_id, event_type, new_value, note) VALUES(new.id, actor, 'created', jsonb_build_object('number',new.number,'status',new.status,'priority',new.priority), 'Chamado criado');
    RETURN new;
  END IF;
  IF old.acknowledged_by_user_id IS DISTINCT FROM new.acknowledged_by_user_id AND new.acknowledged_by_user_id IS NOT NULL THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'acknowledged',to_jsonb(old.acknowledged_by_user_id),to_jsonb(new.acknowledged_by_user_id),'Chamado acolhido'); END IF;
  IF old.assigned_technician_id IS DISTINCT FROM new.assigned_technician_id THEN
    SELECT name INTO old_tech FROM public.technicians WHERE id = old.assigned_technician_id;
    SELECT name INTO new_tech FROM public.technicians WHERE id = new.assigned_technician_id;
    INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note)
    VALUES(new.id,actor,
      CASE WHEN old.assigned_technician_id IS NOT NULL AND new.assigned_technician_id IS NOT NULL THEN 'transferred' ELSE 'assignment_changed' END,
      jsonb_build_object('technician_id',old.assigned_technician_id,'technician_name',old_tech),
      jsonb_build_object('technician_id',new.assigned_technician_id,'technician_name',new_tech,'reason',NULLIF(btrim(COALESCE(new.transfer_reason,'')),'')),
      CASE WHEN old.assigned_technician_id IS NOT NULL AND new.assigned_technician_id IS NOT NULL
        THEN 'Transferência de ' || COALESCE(old_tech,'—') || ' para ' || COALESCE(new_tech,'—') || COALESCE(' · Motivo: ' || NULLIF(btrim(COALESCE(new.transfer_reason,'')),''), '')
        ELSE 'Técnico responsável alterado para ' || COALESCE(new_tech,'não atribuído') END);
  END IF;
  IF old.scheduled_at IS DISTINCT FROM new.scheduled_at AND new.scheduled_at IS NOT NULL THEN
    INSERT INTO public.ticket_schedules(ticket_id, scheduled_at, technician_id, note, created_by)
    VALUES(new.id, new.scheduled_at, new.assigned_technician_id, new.scheduled_note, actor);
    INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note)
    VALUES(new.id,actor,CASE WHEN old.scheduled_at IS NULL THEN 'scheduled' ELSE 'rescheduled' END,
      jsonb_build_object('scheduled_at',old.scheduled_at,'note',old.scheduled_note),
      jsonb_build_object('scheduled_at',new.scheduled_at,'note',new.scheduled_note),
      CASE WHEN old.scheduled_at IS NULL THEN 'Atendimento agendado' ELSE 'Atendimento reagendado' END);
  END IF;
  IF old.priority IS DISTINCT FROM new.priority THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'priority_changed',to_jsonb(old.priority),to_jsonb(new.priority),'Prioridade alterada'); END IF;
  IF old.status IS DISTINCT FROM new.status THEN
    INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,CASE WHEN new.status='resolved' THEN 'resolved' WHEN new.status='closed' THEN 'closed' WHEN new.status='reopened' THEN 'reopened' ELSE 'status_changed' END,jsonb_build_object('status',old.status,'solution',old.solution,'resolved_at',old.resolved_at,'closed_at',old.closed_at),jsonb_build_object('status',new.status,'solution',CASE WHEN new.status='resolved' THEN new.solution ELSE NULL END,'resolved_at',new.resolved_at,'closed_at',new.closed_at,'reopened_at',new.reopened_at,'reopen_count',new.reopen_count),CASE WHEN new.status='resolved' THEN 'Chamado resolvido' WHEN new.status='closed' THEN 'Chamado encerrado' WHEN new.status='reopened' THEN 'Chamado reaberto' ELSE 'Status alterado' END);
  END IF;
  IF old.internal_notes IS DISTINCT FROM new.internal_notes AND new.internal_notes IS NOT NULL THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'internal_note',NULL,NULL,new.internal_notes); END IF;
  IF old.solution IS DISTINCT FROM new.solution AND new.solution IS NOT NULL AND new.status <> 'resolved' THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'solution',to_jsonb(old.solution),to_jsonb(new.solution),'Solução registrada'); END IF;
  RETURN new;
END;
$function$;

-- === Agendamento exige data quando status agendado ===
CREATE OR REPLACE FUNCTION public.prepare_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  new.requester_phone_normalized = public.normalize_phone(new.requester_phone);
  IF TG_OP = 'UPDATE' AND new.number IS DISTINCT FROM old.number THEN
    RAISE EXCEPTION 'O número do chamado é gerado pelo sistema e não pode ser alterado';
  END IF;
  IF new.contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = new.contact_id AND c.company_id = new.company_id) THEN
    RAISE EXCEPTION 'O contato deve pertencer à empresa selecionada';
  END IF;
  IF new.subcategory_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ticket_categories c WHERE c.id = new.subcategory_id AND c.parent_id = new.category_id) THEN
    RAISE EXCEPTION 'A subcategoria deve pertencer à categoria selecionada';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF old.status IS DISTINCT FROM new.status THEN
      IF NOT (CASE old.status
        WHEN 'new' THEN new.status IN ('triage', 'in_progress', 'cancelled')
        WHEN 'triage' THEN new.status IN ('in_progress', 'waiting_customer', 'cancelled')
        WHEN 'in_progress' THEN new.status IN ('waiting_customer', 'waiting_third_party', 'scheduled', 'resolved')
        WHEN 'waiting_customer' THEN new.status IN ('in_progress', 'resolved')
        WHEN 'waiting_third_party' THEN new.status IN ('in_progress', 'resolved')
        WHEN 'scheduled' THEN new.status IN ('in_progress', 'resolved')
        WHEN 'resolved' THEN new.status IN ('closed', 'reopened')
        WHEN 'closed' THEN new.status = 'reopened'
        WHEN 'reopened' THEN new.status = 'in_progress'
        ELSE false
      END) THEN
        RAISE EXCEPTION 'Transição de status inválida: % para %', old.status, new.status;
      END IF;
      IF new.status = 'scheduled' AND new.scheduled_at IS NULL THEN
        RAISE EXCEPTION 'Informe a data e hora do agendamento';
      END IF;
      IF new.status = 'resolved' THEN
        IF NULLIF(btrim(new.solution), '') IS NULL THEN RAISE EXCEPTION 'Informe a solução antes de resolver o chamado'; END IF;
        new.resolved_at = now();
      END IF;
      IF new.status = 'closed' THEN new.closed_at = now(); END IF;
      IF new.status = 'reopened' THEN
        new.reopened_at = now();
        new.reopen_count = old.reopen_count + 1;
        new.solution = NULL;
        new.resolved_at = NULL;
        new.closed_at = NULL;
      END IF;
    END IF;
    IF old.acknowledged_at IS NULL AND new.acknowledged_by_user_id IS NOT NULL THEN new.acknowledged_at = now(); END IF;
    IF old.first_response_at IS NULL AND new.status = 'in_progress' THEN new.first_response_at = now(); END IF;
  END IF;
  RETURN new;
END;
$function$;
