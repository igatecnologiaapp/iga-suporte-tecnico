-- ===== Fase 3A: conversas e mensagens =====
DO $$ BEGIN CREATE TYPE public.conversation_status AS ENUM ('new','triage','linked','finished'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_direction AS ENUM ('inbound','outbound'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_kind AS ENUM ('text','image','document','audio','video','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_state AS ENUM ('pending','sent','delivered','read','received','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel public.ticket_channel NOT NULL DEFAULT 'whatsapp',
  phone text NOT NULL,
  phone_normalized text,
  display_name text,
  contact_id uuid REFERENCES public.contacts(id),
  company_id uuid REFERENCES public.companies(id),
  ticket_id uuid REFERENCES public.tickets(id),
  status public.conversation_status NOT NULL DEFAULT 'new',
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.conversations TO authenticated;
GRANT UPDATE (contact_id, company_id, ticket_id, status, unread_count, display_name, updated_at) ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read conversations" ON public.conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operations update conversations" ON public.conversations FOR UPDATE TO authenticated
  USING (public.can_manage_operations(auth.uid())) WITH CHECK (public.can_manage_operations(auth.uid()));
CREATE INDEX IF NOT EXISTS conversations_activity_idx ON public.conversations(last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_open_phone_unique ON public.conversations(channel, phone_normalized) WHERE status <> 'finished';

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction public.message_direction NOT NULL,
  channel public.ticket_channel NOT NULL DEFAULT 'whatsapp',
  phone text,
  content text,
  message_type public.message_kind NOT NULL DEFAULT 'text',
  status public.message_state NOT NULL DEFAULT 'received',
  external_id text,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read messages" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages(conversation_id, sent_at);
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_unique ON public.messages(channel, external_id) WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prepare_conversation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  new.phone_normalized = public.normalize_phone(new.phone);
  new.updated_at = now();
  IF new.ticket_id IS NOT NULL AND (TG_OP = 'INSERT' OR old.ticket_id IS DISTINCT FROM new.ticket_id) AND new.status IN ('new','triage') THEN
    new.status = 'linked';
  END IF;
  RETURN new;
END; $$;
DROP TRIGGER IF EXISTS conversations_prepare ON public.conversations;
CREATE TRIGGER conversations_prepare BEFORE INSERT OR UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.prepare_conversation();

CREATE OR REPLACE FUNCTION public.touch_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_at = new.sent_at,
         last_message_preview = left(COALESCE(new.content, '[' || new.message_type::text || ']'), 180),
         unread_count = CASE WHEN new.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
         updated_at = now()
   WHERE id = new.conversation_id;
  RETURN new;
END; $$;
DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();

-- ===== Chamados abertos a partir de conversa (canal WhatsApp) =====
DROP POLICY IF EXISTS "Operations insert tickets" ON public.tickets;
CREATE POLICY "Operations insert tickets" ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_operations(auth.uid()) AND created_by = auth.uid() AND channel IN ('manual','whatsapp'));

-- ===== Edicao e cancelamento de chamados =====
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS cancel_reason text;
GRANT UPDATE (company_id, contact_id, requester_phone, category_id, subcategory_id, subject, description, cancel_reason) ON public.tickets TO authenticated;

-- ===== Auditoria administrativa: entidades genericas =====
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS entity text;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS reason text;

-- ===== Regras do chamado: cancelamento com motivo e edicao registrada =====
CREATE OR REPLACE FUNCTION public.prepare_ticket()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
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
      IF new.status = 'cancelled' THEN
        IF old.status = 'cancelled' THEN RAISE EXCEPTION 'O chamado já está cancelado'; END IF;
        IF NULLIF(btrim(COALESCE(new.cancel_reason,'')), '') IS NULL THEN
          RAISE EXCEPTION 'Informe o motivo do cancelamento/arquivamento do chamado';
        END IF;
      ELSIF NOT (CASE old.status
        WHEN 'new' THEN new.status IN ('triage', 'in_progress')
        WHEN 'triage' THEN new.status IN ('in_progress', 'waiting_customer')
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

CREATE OR REPLACE FUNCTION public.audit_ticket_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := COALESCE(auth.uid(), new.created_by);
BEGIN
  IF old.subject IS DISTINCT FROM new.subject THEN
    INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note)
    VALUES(new.id,actor,'field_changed',jsonb_build_object('field','subject','value',old.subject),jsonb_build_object('field','subject','value',new.subject),'Assunto alterado');
  END IF;
  IF old.description IS DISTINCT FROM new.description THEN
    INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note)
    VALUES(new.id,actor,'field_changed',jsonb_build_object('field','description','value',old.description),jsonb_build_object('field','description','value',new.description),'Descrição alterada');
  END IF;
  IF old.company_id IS DISTINCT FROM new.company_id OR old.contact_id IS DISTINCT FROM new.contact_id THEN
    INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note)
    VALUES(new.id,actor,'field_changed',jsonb_build_object('company_id',old.company_id,'contact_id',old.contact_id),jsonb_build_object('company_id',new.company_id,'contact_id',new.contact_id),'Empresa/contato alterado');
  END IF;
  IF old.category_id IS DISTINCT FROM new.category_id OR old.subcategory_id IS DISTINCT FROM new.subcategory_id THEN
    INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note)
    VALUES(new.id,actor,'field_changed',jsonb_build_object('category_id',old.category_id,'subcategory_id',old.subcategory_id),jsonb_build_object('category_id',new.category_id,'subcategory_id',new.subcategory_id),'Categoria alterada');
  END IF;
  IF old.status IS DISTINCT FROM new.status AND new.status = 'cancelled' THEN
    INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,old_value,new_value,note)
    VALUES(new.id,actor,'cancelled',jsonb_build_object('status',old.status),jsonb_build_object('status',new.status,'reason',new.cancel_reason),'Chamado cancelado/arquivado · Motivo: ' || COALESCE(new.cancel_reason,'—'));
  END IF;
  RETURN new;
END; $$;
DROP TRIGGER IF EXISTS tickets_audit_fields ON public.tickets;
CREATE TRIGGER tickets_audit_fields AFTER UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.audit_ticket_fields();
