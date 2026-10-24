-- GoTrue creates auth.users with provider metadata, updates the Auth role, then
-- applies custom app_metadata in the same transaction. Permit only that initial
-- missing-marker interval for a reserved identity. Provisioning still requires
-- the correct server-owned marker and keeps the account inactive beforehand.
CREATE OR REPLACE FUNCTION public.guard_admin_creation_auth_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  op public.admin_user_creation_operations;
  old_marker text;
  new_marker text;
  initializing boolean;
BEGIN
  SELECT * INTO op FROM public.admin_user_creation_operations WHERE user_id=OLD.id;
  IF FOUND AND (op.stage='reserved' OR op.delivery_state='sending') THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Identidade com operação pendente.' USING ERRCODE='42501'; END IF;
    old_marker := OLD.raw_app_meta_data->>'admin_creation_operation';
    new_marker := NEW.raw_app_meta_data->>'admin_creation_operation';
    initializing := op.stage='reserved' AND old_marker IS NULL AND new_marker IS NULL;
    IF NEW.id IS DISTINCT FROM OLD.id OR lower(NEW.email) IS DISTINCT FROM op.email
      OR (NOT initializing AND new_marker IS DISTINCT FROM op.id::text) THEN
      RAISE EXCEPTION 'Identidade com operação pendente.' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admin_creation_auth_identity() FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
