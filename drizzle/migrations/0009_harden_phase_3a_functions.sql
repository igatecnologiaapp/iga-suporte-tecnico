REVOKE ALL ON FUNCTION public.touch_conversation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_ticket_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_conversation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_conversation() TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_ticket_fields() TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_conversation() TO service_role;
