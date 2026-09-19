ALTER TABLE public.tickets
  ADD COLUMN acknowledged_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN reopened_at timestamptz,
  ADD COLUMN reopen_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_number_format CHECK (number ~ '^CH-[0-9]{6,}$'),
  ADD CONSTRAINT tickets_solution_required CHECK (status NOT IN ('resolved', 'closed') OR NULLIF(btrim(solution), '') IS NOT NULL);

REVOKE INSERT ON public.tickets FROM authenticated;
GRANT INSERT (opened_at, company_id, contact_id, requester_phone, channel, category_id, subcategory_id, subject, description, priority, status, assigned_technician_id, acknowledged_by_id, acknowledged_by_user_id, acknowledged_at, first_response_at, resolved_at, closed_at, solution, internal_notes, created_by, updated_at) ON public.tickets TO authenticated;
REVOKE UPDATE ON public.tickets FROM authenticated;
GRANT UPDATE (assigned_technician_id, acknowledged_by_id, acknowledged_by_user_id, priority, status, solution, internal_notes) ON public.tickets TO authenticated;

REVOKE UPDATE ON public.companies FROM authenticated;
GRANT UPDATE (legal_name, trade_name, tax_id, phone, whatsapp, email, postal_code, address, address_number, complement, district, city, state, status, notes) ON public.companies TO authenticated;

REVOKE UPDATE ON public.contacts FROM authenticated;
GRANT UPDATE (company_id, name, job_title, phone, whatsapp, email, is_primary, status) ON public.contacts TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_ticket()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.audit_ticket_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN actor := COALESCE(new.created_by, old.created_by); END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ticket_events(ticket_id, actor_id, event_type, new_value, note) VALUES(new.id, actor, 'created', jsonb_build_object('number',new.number,'status',new.status,'priority',new.priority), 'Chamado criado');
    RETURN new;
  END IF;
  IF old.acknowledged_by_user_id IS DISTINCT FROM new.acknowledged_by_user_id AND new.acknowledged_by_user_id IS NOT NULL THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'acknowledged',to_jsonb(old.acknowledged_by_user_id),to_jsonb(new.acknowledged_by_user_id),'Chamado acolhido'); END IF;
  IF old.assigned_technician_id IS DISTINCT FROM new.assigned_technician_id THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'assignment_changed',to_jsonb(old.assigned_technician_id),to_jsonb(new.assigned_technician_id),'Técnico responsável alterado'); END IF;
  IF old.priority IS DISTINCT FROM new.priority THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'priority_changed',to_jsonb(old.priority),to_jsonb(new.priority),'Prioridade alterada'); END IF;
  IF old.status IS DISTINCT FROM new.status THEN
    INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,CASE WHEN new.status='resolved' THEN 'resolved' WHEN new.status='closed' THEN 'closed' WHEN new.status='reopened' THEN 'reopened' ELSE 'status_changed' END,jsonb_build_object('status',old.status,'solution',old.solution,'resolved_at',old.resolved_at,'closed_at',old.closed_at),jsonb_build_object('status',new.status,'solution',CASE WHEN new.status='resolved' THEN new.solution ELSE NULL END,'resolved_at',new.resolved_at,'closed_at',new.closed_at,'reopened_at',new.reopened_at,'reopen_count',new.reopen_count),CASE WHEN new.status='resolved' THEN 'Chamado resolvido' WHEN new.status='closed' THEN 'Chamado encerrado' WHEN new.status='reopened' THEN 'Chamado reaberto' ELSE 'Status alterado' END);
  END IF;
  IF old.internal_notes IS DISTINCT FROM new.internal_notes AND new.internal_notes IS NOT NULL THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'internal_note',NULL,NULL,new.internal_notes); END IF;
  IF old.solution IS DISTINCT FROM new.solution AND new.solution IS NOT NULL AND new.status <> 'resolved' THEN INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note) VALUES(new.id,actor,'solution',to_jsonb(old.solution),to_jsonb(new.solution),'Solução registrada'); END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER sla_policies_updated_at BEFORE UPDATE ON public.sla_policies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();