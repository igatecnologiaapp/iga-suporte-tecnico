-- Administrative updates are one PostgreSQL statement/transaction, including audit.
-- No actor parameter: PostgREST supplies the verified caller through auth.uid().
CREATE FUNCTION public.update_admin_user_atomic(_target_id uuid, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid := auth.uid();
  principal uuid;
  actor_primary boolean;
  previous public.profiles%ROWTYPE;
  previous_role public.app_role;
  next_role public.app_role;
  previous_modules text[];
  next_modules text[];
  previous_technician uuid;
  next_technician uuid;
  selected_technician public.technicians%ROWTYPE;
  key text;
  allowed_modules constant text[] := ARRAY[
    'inbox','tickets','companies','contacts','categories','sla',
    'technicians','users','integrations','settings'
  ];
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;
  IF _target_id IS NULL OR jsonb_typeof(_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Dados de atualização inválidos.' USING ERRCODE = '22023';
  END IF;
  FOR key IN SELECT jsonb_object_keys(_patch) LOOP
    IF key NOT IN ('fullName','phone','role','status','technicianId','modules') THEN
      RAISE EXCEPTION 'Campo de atualização inválido: %', key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['fullName','role','status'] LOOP
    IF _patch ? key AND jsonb_typeof(_patch -> key) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Tipo de campo inválido: %', key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['phone','technicianId'] LOOP
    IF _patch ? key AND jsonb_typeof(_patch -> key) NOT IN ('string','null') THEN
      RAISE EXCEPTION 'Tipo de campo inválido: %', key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF _patch ? 'role' AND _patch ->> 'role' NOT IN ('admin','supervisor','technician','viewer') THEN
    RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE = '22023';
  END IF;
  IF _patch ? 'status' AND _patch ->> 'status' NOT IN ('active','inactive') THEN
    RAISE EXCEPTION 'Status inválido.' USING ERRCODE = '22023';
  END IF;
  IF _patch ? 'modules' THEN
    IF jsonb_typeof(_patch -> 'modules') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Módulos inválidos.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_patch -> 'modules') value
      WHERE jsonb_typeof(value) <> 'string' OR NOT (value #>> '{}') = ANY(allowed_modules)) THEN
      RAISE EXCEPTION 'Módulo inválido.' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT value ORDER BY value), ARRAY[]::text[])
      INTO next_modules FROM jsonb_array_elements_text(_patch -> 'modules') value;
  END IF;
  IF _patch ? 'technicianId' THEN
    next_technician := (_patch ->> 'technicianId')::uuid;
  END IF;

  -- Short, infrequent administrative transactions serialize with each other and
  -- direct writes to these tables. Authorization cannot become stale mid-update.
  -- No network operations take place while these locks are held.
  LOCK TABLE public.profiles, public.user_roles, public.user_modules,
    public.technicians, public.primary_admin IN SHARE ROW EXCLUSIVE MODE;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor AND status = 'active')
    OR NOT public.has_role(actor, 'admin') OR NOT public.has_module(actor, 'users') THEN
    RAISE EXCEPTION 'Apenas administradores podem gerenciar usuários.' USING ERRCODE = '42501';
  END IF;
  SELECT user_id INTO principal FROM public.primary_admin WHERE singleton;
  actor_primary := actor = principal;
  SELECT * INTO previous FROM public.profiles WHERE id = _target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  SELECT role INTO previous_role FROM public.user_roles WHERE user_id = _target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil de acesso não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  next_role := COALESCE((_patch ->> 'role')::public.app_role, previous_role);
  SELECT COALESCE(array_agg(module ORDER BY module), ARRAY[]::text[])
    INTO previous_modules FROM public.user_modules WHERE user_id = _target_id;
  SELECT id INTO previous_technician FROM public.technicians WHERE user_id = _target_id;

  IF _target_id = principal THEN
    IF actor IS DISTINCT FROM principal THEN
      RAISE EXCEPTION 'O Administrador Principal só pode ser alterado por ele mesmo.' USING ERRCODE = '42501';
    END IF;
    IF _patch ? 'status' AND _patch ->> 'status' <> 'active' THEN
      RAISE EXCEPTION 'O Administrador Principal não pode ser desativado.';
    END IF;
    IF next_role <> 'admin' THEN
      RAISE EXCEPTION 'O papel do Administrador Principal não pode ser reduzido.';
    END IF;
    -- Preserve the principal's fixed full access, as in the existing handler.
    _patch := _patch - 'modules';
  END IF;
  IF next_role <> previous_role THEN
    IF actor_primary IS NOT TRUE THEN
      RAISE EXCEPTION 'Somente o Administrador Principal pode realizar esta ação.' USING ERRCODE = '42501';
    END IF;
    IF actor = _target_id THEN
      RAISE EXCEPTION 'Não é possível alterar o próprio perfil de acesso.';
    END IF;
  END IF;
  IF _patch ? 'modules' AND next_modules IS DISTINCT FROM previous_modules
    AND actor_primary IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente o Administrador Principal pode realizar esta ação.' USING ERRCODE = '42501';
  END IF;
  IF previous_role = 'admin' AND (next_role <> 'admin'
    OR (_patch ? 'status' AND _patch ->> 'status' <> 'active')) THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
      WHERE r.role = 'admin' AND p.status = 'active' AND p.id <> _target_id) THEN
      RAISE EXCEPTION 'É necessário manter pelo menos um Administrador ativo no sistema.';
    END IF;
  END IF;
  IF _patch ? 'technicianId' AND next_technician IS DISTINCT FROM previous_technician
    AND next_technician IS NOT NULL THEN
    SELECT * INTO selected_technician FROM public.technicians WHERE id = next_technician;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Técnico não encontrado.' USING ERRCODE = 'P0002';
    END IF;
    IF selected_technician.user_id IS NOT NULL AND selected_technician.user_id <> _target_id THEN
      RAISE EXCEPTION 'Técnico já vinculado a outro usuário.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- All validation above; every mutation below rolls back if any step fails.
  IF _patch ?| ARRAY['fullName','phone','status'] THEN
    UPDATE public.profiles SET
      full_name = CASE WHEN _patch ? 'fullName' THEN btrim(_patch ->> 'fullName') ELSE full_name END,
      phone = CASE WHEN _patch ? 'phone' THEN NULLIF(btrim(_patch ->> 'phone'), '') ELSE phone END,
      status = CASE WHEN _patch ? 'status' THEN (_patch ->> 'status')::public.record_status ELSE status END
    WHERE id = _target_id;
    INSERT INTO public.admin_audit_logs(actor_id,target_user_id,action,old_value,new_value)
    VALUES(actor,_target_id,
      CASE WHEN _patch ? 'status' AND _patch ->> 'status' <> previous.status::text
        THEN CASE WHEN _patch ->> 'status' = 'active' THEN 'user_activated' ELSE 'user_deactivated' END
        ELSE 'user_updated' END,
      jsonb_build_object('full_name',previous.full_name,'phone',previous.phone,'status',previous.status),
      (CASE WHEN _patch ? 'fullName' THEN jsonb_build_object('full_name',btrim(_patch ->> 'fullName')) ELSE '{}'::jsonb END)
      || (CASE WHEN _patch ? 'phone' THEN jsonb_build_object('phone',NULLIF(btrim(_patch ->> 'phone'),'')) ELSE '{}'::jsonb END)
      || (CASE WHEN _patch ? 'status' THEN jsonb_build_object('status',_patch ->> 'status') ELSE '{}'::jsonb END));
  END IF;
  IF next_role <> previous_role THEN
    UPDATE public.user_roles SET role = next_role WHERE user_id = _target_id;
    INSERT INTO public.admin_audit_logs(actor_id,target_user_id,action,old_value,new_value)
    VALUES(actor,_target_id,'role_changed',jsonb_build_object('role',previous_role),jsonb_build_object('role',next_role));
  END IF;
  IF _patch ? 'technicianId' AND next_technician IS DISTINCT FROM previous_technician THEN
    IF previous_technician IS NOT NULL THEN
      UPDATE public.technicians SET user_id = NULL WHERE id = previous_technician;
    END IF;
    IF next_technician IS NOT NULL THEN
      UPDATE public.technicians SET user_id = _target_id WHERE id = next_technician;
    END IF;
    INSERT INTO public.admin_audit_logs(actor_id,target_user_id,action,old_value,new_value)
    VALUES(actor,_target_id,CASE WHEN next_technician IS NULL THEN 'technician_unlinked' ELSE 'technician_linked' END,
      jsonb_build_object('technician_id',previous_technician),jsonb_build_object('technician_id',next_technician));
  END IF;
  IF _patch ? 'modules' AND next_modules IS DISTINCT FROM previous_modules THEN
    DELETE FROM public.user_modules WHERE user_id = _target_id AND NOT (module = ANY(next_modules));
    INSERT INTO public.user_modules(user_id,module)
      SELECT _target_id, value FROM unnest(next_modules) value
      WHERE NOT (value = ANY(previous_modules));
    INSERT INTO public.admin_audit_logs(actor_id,target_user_id,action,old_value,new_value)
    VALUES(actor,_target_id,'modules_changed',jsonb_build_object('modules',previous_modules),jsonb_build_object('modules',next_modules));
  END IF;
  RETURN jsonb_build_object('ok',true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_admin_user_atomic(uuid,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_admin_user_atomic(uuid,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
