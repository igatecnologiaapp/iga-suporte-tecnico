ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_one_role_per_user UNIQUE (user_id);
DROP POLICY "Operations insert events" ON public.ticket_events;
REVOKE INSERT ON public.ticket_events FROM authenticated;
REVOKE UPDATE ON public.tickets FROM authenticated;
GRANT UPDATE (assigned_technician_id, acknowledged_by_id, priority, status, solution, internal_notes) ON public.tickets TO authenticated;
CREATE OR REPLACE FUNCTION public.audit_ticket_attachment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.ticket_events(ticket_id, actor_id, event_type, note)
  VALUES(new.ticket_id, new.uploaded_by, 'attachment', 'Arquivo anexado: ' || new.file_name);
  RETURN new;
END; $$;
REVOKE EXECUTE ON FUNCTION public.audit_ticket_attachment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_ticket_attachment() TO service_role;
CREATE TRIGGER ticket_attachment_audit AFTER INSERT ON public.ticket_attachments FOR EACH ROW EXECUTE FUNCTION public.audit_ticket_attachment();