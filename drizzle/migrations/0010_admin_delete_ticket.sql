-- Allow a controlled, audited hard delete of a ticket (admin only).
-- The timeline stays immutable for everyone; only this privileged path may purge
-- the events that belong to the ticket being deleted.
CREATE OR REPLACE FUNCTION public.prevent_timeline_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('iga.allow_timeline_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'A timeline é imutável';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_ticket(_ticket_id uuid, _actor_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _number text;
  _company text;
  _subject text;
BEGIN
  IF NOT public.has_role(_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir chamados';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Informe o motivo da exclusão';
  END IF;

  SELECT t.number, c.trade_name, t.subject INTO _number, _company, _subject
  FROM public.tickets t
  LEFT JOIN public.companies c ON c.id = t.company_id
  WHERE t.id = _ticket_id;

  IF _number IS NULL THEN
    RAISE EXCEPTION 'Chamado não encontrado';
  END IF;

  -- detach conversations/messages: history of the conversation is preserved
  UPDATE public.conversations
     SET ticket_id = NULL,
         status = CASE WHEN status = 'linked' THEN 'triage'::conversation_status ELSE status END
   WHERE ticket_id = _ticket_id;

  DELETE FROM public.notifications WHERE ticket_id = _ticket_id;
  DELETE FROM public.ticket_schedules WHERE ticket_id = _ticket_id;
  DELETE FROM public.ticket_attachments WHERE ticket_id = _ticket_id;

  PERFORM set_config('iga.allow_timeline_purge', 'on', true);
  DELETE FROM public.ticket_events WHERE ticket_id = _ticket_id;
  PERFORM set_config('iga.allow_timeline_purge', 'off', true);

  DELETE FROM public.tickets WHERE id = _ticket_id;

  INSERT INTO public.admin_audit_logs (actor_id, entity, entity_id, action, reason, old_value, new_value)
  VALUES (_actor_id, 'tickets', _ticket_id, 'ticket_deleted', btrim(_reason),
          jsonb_build_object('number', _number, 'company', _company, 'subject', _subject), NULL);

  RETURN jsonb_build_object('number', _number, 'company', _company, 'subject', _subject);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_ticket(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_ticket(uuid, uuid, text) TO service_role;
