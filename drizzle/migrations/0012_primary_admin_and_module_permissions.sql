CREATE TABLE public.primary_admin (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.primary_admin TO service_role;
ALTER TABLE public.primary_admin ENABLE ROW LEVEL SECURITY;

INSERT INTO public.primary_admin (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'icorrea.informatica@gmail.com' LIMIT 1;

CREATE TABLE public.user_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  module text NOT NULL CHECK (module IN ('inbox','tickets','companies','contacts','categories','sla','technicians','users','integrations','settings')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);
GRANT SELECT, INSERT, DELETE ON public.user_modules TO authenticated;
GRANT ALL ON public.user_modules TO service_role;
ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_primary_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.primary_admin WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.has_module(_user_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_primary_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_modules m JOIN public.profiles p ON p.id = m.user_id
    WHERE m.user_id = _user_id AND m.module = _module AND p.status = 'active')
$$;

CREATE OR REPLACE FUNCTION public.my_modules()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'is_primary', public.is_primary_admin(auth.uid()),
    'modules', CASE WHEN public.is_primary_admin(auth.uid())
      THEN '["inbox","tickets","companies","contacts","categories","sla","technicians","users","integrations","settings"]'::jsonb
      ELSE COALESCE((SELECT jsonb_agg(module) FROM public.user_modules WHERE user_id = auth.uid()), '[]'::jsonb) END)
$$;
REVOKE EXECUTE ON FUNCTION public.my_modules() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.my_modules() TO authenticated;

CREATE POLICY "Own modules or primary admin read" ON public.user_modules FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_primary_admin(auth.uid()));
CREATE POLICY "Primary admin manages modules" ON public.user_modules FOR ALL TO authenticated
  USING (public.is_primary_admin(auth.uid())) WITH CHECK (public.is_primary_admin(auth.uid()));

INSERT INTO public.user_modules (user_id, module)
SELECT r.user_id, m FROM public.user_roles r
CROSS JOIN LATERAL unnest(CASE r.role
  WHEN 'admin' THEN ARRAY['inbox','tickets','companies','contacts','categories','sla','technicians','users','integrations','settings']
  WHEN 'supervisor' THEN ARRAY['inbox','tickets','companies','contacts','categories','sla','technicians','settings']
  WHEN 'technician' THEN ARRAY['inbox','tickets','companies','contacts','settings']
  ELSE ARRAY['tickets','companies','contacts','settings'] END) AS m
ON CONFLICT DO NOTHING;

CREATE POLICY "Only primary admin writes roles (insert)" ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_primary_admin(auth.uid()));
CREATE POLICY "Only primary admin writes roles (update)" ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_primary_admin(auth.uid())) WITH CHECK (public.is_primary_admin(auth.uid()));
CREATE POLICY "Only primary admin writes roles (delete)" ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_primary_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_primary_admin()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'user_roles' THEN
    IF public.is_primary_admin(old.user_id) AND (TG_OP = 'DELETE' OR new.role <> 'admin' OR new.user_id <> old.user_id) THEN
      RAISE EXCEPTION 'O papel do Administrador Principal não pode ser alterado';
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    IF public.is_primary_admin(old.id) AND new.status <> 'active' THEN
      RAISE EXCEPTION 'O Administrador Principal não pode ser desativado';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN old; END IF;
  RETURN new;
END; $$;
CREATE TRIGGER protect_primary_admin_roles BEFORE UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.protect_primary_admin();
CREATE TRIGGER protect_primary_admin_profile BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_primary_admin();

CREATE POLICY "Module tickets" ON public.tickets AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_module(auth.uid(),'tickets')) WITH CHECK (public.has_module(auth.uid(),'tickets'));
CREATE POLICY "Module tickets" ON public.ticket_events AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_module(auth.uid(),'tickets')) WITH CHECK (public.has_module(auth.uid(),'tickets'));
CREATE POLICY "Module tickets" ON public.ticket_attachments AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_module(auth.uid(),'tickets')) WITH CHECK (public.has_module(auth.uid(),'tickets'));
CREATE POLICY "Module tickets" ON public.ticket_schedules AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_module(auth.uid(),'tickets')) WITH CHECK (public.has_module(auth.uid(),'tickets'));
CREATE POLICY "Module inbox" ON public.conversations AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_module(auth.uid(),'inbox')) WITH CHECK (public.has_module(auth.uid(),'inbox'));
CREATE POLICY "Module inbox" ON public.messages AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_module(auth.uid(),'inbox')) WITH CHECK (public.has_module(auth.uid(),'inbox'));
CREATE POLICY "Module integrations" ON public.integration_events AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_module(auth.uid(),'integrations'));
CREATE POLICY "Module companies insert" ON public.companies AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module(auth.uid(),'companies'));
CREATE POLICY "Module companies update" ON public.companies AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module(auth.uid(),'companies'));
CREATE POLICY "Module companies delete" ON public.companies AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module(auth.uid(),'companies'));
CREATE POLICY "Module contacts insert" ON public.contacts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module(auth.uid(),'contacts'));
CREATE POLICY "Module contacts update" ON public.contacts AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module(auth.uid(),'contacts'));
CREATE POLICY "Module contacts delete" ON public.contacts AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module(auth.uid(),'contacts'));
CREATE POLICY "Module categories insert" ON public.ticket_categories AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module(auth.uid(),'categories'));
CREATE POLICY "Module categories update" ON public.ticket_categories AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module(auth.uid(),'categories'));
CREATE POLICY "Module categories delete" ON public.ticket_categories AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module(auth.uid(),'categories'));
CREATE POLICY "Module sla insert" ON public.sla_policies AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module(auth.uid(),'sla'));
CREATE POLICY "Module sla update" ON public.sla_policies AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module(auth.uid(),'sla'));
CREATE POLICY "Module technicians insert" ON public.technicians AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_module(auth.uid(),'technicians'));
CREATE POLICY "Module technicians update" ON public.technicians AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_module(auth.uid(),'technicians'));
CREATE POLICY "Module technicians delete" ON public.technicians AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_module(auth.uid(),'technicians'));