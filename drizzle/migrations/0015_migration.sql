-- B2: profiles — only minimal columns readable by others
REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT (id, full_name, avatar_url, status, created_at, updated_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.my_profile()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_profile() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_profile() TO authenticated;

-- B3: technicians — rows only for operational need; contact columns only via gated function
REVOKE SELECT ON public.technicians FROM authenticated, anon;
GRANT SELECT (id, name, user_id, specialty, status, created_at, updated_at) ON public.technicians TO authenticated;

CREATE POLICY "Module technicians read" ON public.technicians AS RESTRICTIVE FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_module(auth.uid(), 'technicians') OR has_module(auth.uid(), 'tickets'));

CREATE OR REPLACE FUNCTION public.technician_contacts()
RETURNS TABLE(id uuid, phone text, email text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.phone, t.email FROM public.technicians t
  WHERE has_module(auth.uid(), 'technicians')
     OR t.user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.technician_contacts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.technician_contacts() TO authenticated;