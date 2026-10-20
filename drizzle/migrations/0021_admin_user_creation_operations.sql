-- Auth and email are external operations. Persist identity and delivery state;
-- only the database provision step is atomic. No historical migration changes.
CREATE TABLE public.admin_user_creation_operations (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  user_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  stage text NOT NULL DEFAULT 'reserved' CHECK (stage IN ('reserved','provisioned')),
  delivery_state text NOT NULL DEFAULT 'not_requested'
    CHECK (delivery_state IN ('not_requested','sending','accepted','failed','unknown','activated')),
  delivery_token uuid,
  delivery_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_user_creation_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_user_creation_operations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.admin_user_creation_operations TO service_role;

CREATE FUNCTION public.assert_creation_primary() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.primary_admin a JOIN public.profiles p ON p.id=a.user_id
    JOIN public.user_roles r ON r.user_id=p.id
    WHERE a.user_id=auth.uid() AND p.status='active' AND r.role='admin'
  ) OR NOT public.has_module(auth.uid(),'users') THEN
    RAISE EXCEPTION 'Somente o Administrador Principal ativo pode realizar esta ação.' USING ERRCODE='42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_creation_primary() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.normalize_creation_payload(_p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE k text; mods jsonb; tech uuid;
BEGIN
  IF jsonb_typeof(_p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Cadastro inválido.' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(_p) LOOP
    IF k NOT IN ('fullName','email','phone','role','status','technicianId','createTechnician','modules') THEN
      RAISE EXCEPTION 'Campo inválido no cadastro.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['fullName','email','role','status'] LOOP
    IF jsonb_typeof(_p->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Campo obrigatório inválido.' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF length(btrim(_p->>'fullName')) NOT BETWEEN 1 AND 160 OR length(_p->>'email')>254
    OR btrim(_p->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR _p->>'role' NOT IN ('admin','supervisor','technician','viewer')
    OR _p->>'status' NOT IN ('active','inactive') THEN RAISE EXCEPTION 'Dados de cadastro inválidos.' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['phone','technicianId'] LOOP
    IF _p ? k AND jsonb_typeof(_p->k) NOT IN ('string','null') THEN RAISE EXCEPTION 'Vínculo ou telefone inválido.' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF length(btrim(_p->>'phone'))>40 THEN RAISE EXCEPTION 'Telefone inválido.' USING ERRCODE='22023'; END IF;
  tech := (_p->>'technicianId')::uuid;
  IF _p ? 'createTechnician' AND jsonb_typeof(_p->'createTechnician') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Modo de técnico inválido.' USING ERRCODE='22023'; END IF;
  IF (tech IS NOT NULL AND COALESCE((_p->>'createTechnician')::boolean,false))
    OR (_p->>'role'<>'technician' AND (tech IS NOT NULL OR COALESCE((_p->>'createTechnician')::boolean,false))) THEN
    RAISE EXCEPTION 'Combinação de técnico inválida.' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(_p->'modules') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Módulos inválidos.' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(_p->'modules') NOT BETWEEN 1 AND 10 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(_p->'modules') v WHERE jsonb_typeof(v)<>'string'
      OR (v #>> '{}') NOT IN ('inbox','tickets','companies','contacts','categories','sla','technicians','users','integrations','settings')
  ) THEN RAISE EXCEPTION 'Módulos inválidos.' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(v ORDER BY v) INTO mods FROM (SELECT DISTINCT jsonb_array_elements_text(_p->'modules') v) q;
  RETURN jsonb_build_object('fullName',btrim(_p->>'fullName'),'email',lower(btrim(_p->>'email')),
    'phone',NULLIF(btrim(_p->>'phone'),''),'role',_p->>'role','status',_p->>'status',
    'technicianId',tech,'createTechnician',COALESCE((_p->>'createTechnician')::boolean,false),'modules',mods);
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_creation_payload(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.creation_operation_state(_op public.admin_user_creation_operations) RETURNS jsonb
LANGUAGE sql SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object('operationId',_op.id,'userId',_op.user_id,'payload',_op.payload,
    'stage',_op.stage,'deliveryState',_op.delivery_state)
$$;
REVOKE ALL ON FUNCTION public.creation_operation_state(public.admin_user_creation_operations) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.reserve_admin_user_creation(_operation_id uuid, _payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE op public.admin_user_creation_operations; p jsonb; tech public.technicians;
BEGIN
  LOCK TABLE public.profiles, public.user_roles, public.user_modules, public.technicians, public.primary_admin IN SHARE ROW EXCLUSIVE MODE;
  PERFORM public.assert_creation_primary();
  IF _operation_id IS NULL THEN RAISE EXCEPTION 'Identificador obrigatório.' USING ERRCODE='22023'; END IF;
  p := public.normalize_creation_payload(_payload);
  SELECT * INTO op FROM public.admin_user_creation_operations WHERE id=_operation_id FOR UPDATE;
  IF FOUND THEN
    IF op.actor_id<>auth.uid() OR op.payload<>p THEN RAISE EXCEPTION 'Pedido já reservado com outros dados. Retome o cadastro pendente.' USING ERRCODE='22023'; END IF;
    RETURN public.creation_operation_state(op);
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email)=p->>'email')
    OR EXISTS (SELECT 1 FROM public.admin_user_creation_operations WHERE email=p->>'email') THEN
    RAISE EXCEPTION 'E-mail já cadastrado ou com operação pendente.' USING ERRCODE='22023';
  END IF;
  IF p->>'technicianId' IS NOT NULL THEN
    SELECT * INTO tech FROM public.technicians WHERE id=(p->>'technicianId')::uuid;
    IF NOT FOUND OR tech.user_id IS NOT NULL THEN RAISE EXCEPTION 'Técnico indisponível para vínculo.' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.admin_user_creation_operations(id,actor_id,email,payload)
    VALUES(_operation_id,auth.uid(),p->>'email',p) RETURNING * INTO op;
  INSERT INTO public.admin_audit_logs(actor_id,action,new_value)
    VALUES(auth.uid(),'user_creation_reserved',jsonb_build_object('operation_id',op.id));
  RETURN public.creation_operation_state(op);
END;
$$;

-- Trigger guards keep identities inert across an Auth/SQL failure boundary.
CREATE FUNCTION public.guard_pending_admin_creation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_NAME='profiles' THEN target:=NEW.id; ELSE target:=NEW.user_id; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_user_creation_operations WHERE user_id=target AND stage='reserved') THEN
    IF TG_TABLE_NAME='profiles' THEN NEW.status:='inactive';
    ELSIF TG_TABLE_NAME='user_roles' THEN
      IF NEW.role<>'viewer' THEN RAISE EXCEPTION 'Cadastro ainda pendente.' USING ERRCODE='42501'; END IF;
    ELSE RAISE EXCEPTION 'Cadastro ainda pendente.' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_pending_admin_creation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER pending_creation_profile BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_pending_admin_creation();
CREATE TRIGGER pending_creation_role BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_pending_admin_creation();
CREATE TRIGGER pending_creation_module BEFORE INSERT OR UPDATE ON public.user_modules FOR EACH ROW EXECUTE FUNCTION public.guard_pending_admin_creation();
CREATE TRIGGER pending_creation_technician BEFORE INSERT OR UPDATE ON public.technicians FOR EACH ROW EXECUTE FUNCTION public.guard_pending_admin_creation();

-- Invite API resolves by email. Freeze identity while a reservation or send is
-- pending, closing the gap between our identity check and Auth's email lookup.
CREATE FUNCTION public.guard_admin_creation_auth_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE op public.admin_user_creation_operations;
BEGIN
  SELECT * INTO op FROM public.admin_user_creation_operations WHERE user_id=OLD.id;
  IF FOUND AND (op.stage='reserved' OR op.delivery_state='sending') THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Identidade com operação pendente.' USING ERRCODE='42501'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR lower(NEW.email) IS DISTINCT FROM op.email
      OR NEW.raw_app_meta_data->>'admin_creation_operation' IS DISTINCT FROM op.id::text THEN
      RAISE EXCEPTION 'Identidade com operação pendente.' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admin_creation_auth_identity() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER pending_creation_auth_identity BEFORE UPDATE OR DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.guard_admin_creation_auth_identity();

CREATE FUNCTION public.provision_admin_user_creation(_operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE op public.admin_user_creation_operations; tech public.technicians; linked uuid; identity_ok boolean;
BEGIN
  LOCK TABLE public.profiles, public.user_roles, public.user_modules, public.technicians, public.primary_admin IN SHARE ROW EXCLUSIVE MODE;
  PERFORM public.assert_creation_primary();
  SELECT * INTO op FROM public.admin_user_creation_operations WHERE id=_operation_id AND actor_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação não encontrada.' USING ERRCODE='P0002'; END IF;
  IF op.stage='provisioned' THEN RETURN public.creation_operation_state(op); END IF;
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id=op.user_id AND lower(email)=op.email
    AND raw_app_meta_data->>'admin_creation_operation'=op.id::text AND email_confirmed_at IS NULL) INTO identity_ok;
  IF NOT identity_ok OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=op.user_id AND status='inactive')
    OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=op.user_id AND role='viewer')
    OR EXISTS (SELECT 1 FROM public.user_modules WHERE user_id=op.user_id)
    OR EXISTS (SELECT 1 FROM public.primary_admin WHERE user_id=op.user_id) THEN
    RAISE EXCEPTION 'Identidade pendente não corresponde à operação.' USING ERRCODE='22023';
  END IF;
  linked := (op.payload->>'technicianId')::uuid;
  IF linked IS NOT NULL THEN
    SELECT * INTO tech FROM public.technicians WHERE id=linked;
    IF NOT FOUND OR tech.user_id IS NOT NULL THEN RAISE EXCEPTION 'Técnico indisponível para vínculo.' USING ERRCODE='22023'; END IF;
  END IF;
  -- State and all business changes commit or roll back together.
  UPDATE public.admin_user_creation_operations SET stage='provisioned',updated_at=now() WHERE id=op.id;
  UPDATE public.profiles SET full_name=op.payload->>'fullName',phone=op.payload->>'phone',status=(op.payload->>'status')::public.record_status WHERE id=op.user_id;
  UPDATE public.user_roles SET role=(op.payload->>'role')::public.app_role WHERE user_id=op.user_id;
  INSERT INTO public.user_modules(user_id,module) SELECT op.user_id,jsonb_array_elements_text(op.payload->'modules');
  IF linked IS NOT NULL THEN UPDATE public.technicians SET user_id=op.user_id WHERE id=linked;
  ELSIF (op.payload->>'createTechnician')::boolean THEN
    INSERT INTO public.technicians(user_id,name,email,phone,status)
      VALUES(op.user_id,op.payload->>'fullName',op.email,op.payload->>'phone','active') RETURNING id INTO linked;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,target_user_id,action,new_value)
    VALUES(auth.uid(),op.user_id,'user_created',op.payload || jsonb_build_object('operation_id',op.id,'technician_id',linked));
  SELECT * INTO op FROM public.admin_user_creation_operations WHERE id=op.id;
  RETURN public.creation_operation_state(op);
END;
$$;

CREATE FUNCTION public.claim_admin_user_invitation(_operation_id uuid, _delivery_token uuid, _resend boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE op public.admin_user_creation_operations;
BEGIN
  LOCK TABLE public.profiles, public.user_roles, public.user_modules, public.technicians, public.primary_admin IN SHARE ROW EXCLUSIVE MODE;
  PERFORM public.assert_creation_primary();
  SELECT * INTO op FROM public.admin_user_creation_operations WHERE id=_operation_id AND actor_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR op.stage<>'provisioned' THEN RAISE EXCEPTION 'Cadastro ainda não concluído.' USING ERRCODE='22023'; END IF;
  IF _delivery_token IS NULL OR _resend IS NULL THEN RAISE EXCEPTION 'Tentativa inválida.' USING ERRCODE='22023'; END IF;
  IF op.delivery_state='activated' OR (NOT _resend AND op.delivery_state<>'not_requested') THEN
    RETURN jsonb_build_object('claimed',false,'state',public.creation_operation_state(op));
  END IF;
  -- Never run concurrent deliveries. Unknown outcomes require an explicit resend.
  IF op.delivery_state='sending' AND op.delivery_started_at>now()-interval '5 minutes'
    OR op.delivery_started_at>now()-interval '60 seconds' THEN
    RETURN jsonb_build_object('claimed',false,'state',public.creation_operation_state(op));
  END IF;
  UPDATE public.admin_user_creation_operations SET delivery_state='sending',delivery_token=_delivery_token,
    delivery_started_at=now(),updated_at=now() WHERE id=op.id RETURNING * INTO op;
  INSERT INTO public.admin_audit_logs(actor_id,target_user_id,action,new_value)
    VALUES(auth.uid(),op.user_id,'user_invitation_requested',jsonb_build_object('operation_id',op.id,'attempt_id',_delivery_token,'resend',_resend));
  RETURN jsonb_build_object('claimed',true,'state',public.creation_operation_state(op));
END;
$$;

CREATE FUNCTION public.record_admin_user_invitation(_operation_id uuid, _delivery_token uuid, _outcome text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE op public.admin_user_creation_operations;
BEGIN
  LOCK TABLE public.profiles, public.user_roles, public.user_modules, public.technicians, public.primary_admin IN SHARE ROW EXCLUSIVE MODE;
  PERFORM public.assert_creation_primary();
  IF _outcome NOT IN ('accepted','failed','unknown','activated') OR _outcome IS NULL THEN RAISE EXCEPTION 'Resultado inválido.' USING ERRCODE='22023'; END IF;
  SELECT * INTO op FROM public.admin_user_creation_operations WHERE id=_operation_id AND actor_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação não encontrada.' USING ERRCODE='P0002'; END IF;
  IF op.delivery_token IS DISTINCT FROM _delivery_token OR op.delivery_state<>'sending' THEN
    RAISE EXCEPTION 'Tentativa já concluída ou substituída.' USING ERRCODE='22023';
  END IF;
  UPDATE public.admin_user_creation_operations SET delivery_state=_outcome,updated_at=now() WHERE id=op.id RETURNING * INTO op;
  INSERT INTO public.admin_audit_logs(actor_id,target_user_id,action,new_value)
    VALUES(auth.uid(),op.user_id,'user_invitation_'||_outcome,jsonb_build_object('operation_id',op.id,'attempt_id',_delivery_token));
  RETURN public.creation_operation_state(op);
END;
$$;

CREATE FUNCTION public.list_admin_user_creations() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.assert_creation_primary();
  RETURN COALESCE((SELECT jsonb_agg(public.creation_operation_state(o) ORDER BY o.created_at DESC)
    FROM public.admin_user_creation_operations o WHERE o.actor_id=auth.uid()),'[]'::jsonb);
END;
$$;

CREATE FUNCTION public.get_admin_user_creation(_operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE op public.admin_user_creation_operations;
BEGIN
  PERFORM public.assert_creation_primary();
  SELECT * INTO op FROM public.admin_user_creation_operations WHERE id=_operation_id AND actor_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação não encontrada.' USING ERRCODE='P0002'; END IF;
  RETURN public.creation_operation_state(op);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_admin_user_creation(uuid,jsonb), public.provision_admin_user_creation(uuid),
 public.claim_admin_user_invitation(uuid,uuid,boolean), public.record_admin_user_invitation(uuid,uuid,text),
 public.list_admin_user_creations(), public.get_admin_user_creation(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_admin_user_creation(uuid,jsonb), public.provision_admin_user_creation(uuid),
 public.claim_admin_user_invitation(uuid,uuid,boolean), public.record_admin_user_invitation(uuid,uuid,text),
 public.list_admin_user_creations(), public.get_admin_user_creation(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
