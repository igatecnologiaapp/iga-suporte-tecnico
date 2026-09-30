CREATE TABLE public.company_ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.ticket_categories(id) ON DELETE RESTRICT,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, category_id)
);
CREATE UNIQUE INDEX company_ticket_categories_one_default ON public.company_ticket_categories(company_id) WHERE is_default;
CREATE INDEX company_ticket_categories_category_idx ON public.company_ticket_categories(category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_ticket_categories TO authenticated;
GRANT ALL ON public.company_ticket_categories TO service_role;
ALTER TABLE public.company_ticket_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read company categories" ON public.company_ticket_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers insert company categories" ON public.company_ticket_categories FOR INSERT TO authenticated WITH CHECK (public.can_manage_operations(auth.uid()) AND public.has_module(auth.uid(),'companies'));
CREATE POLICY "Managers update company categories" ON public.company_ticket_categories FOR UPDATE TO authenticated USING (public.can_manage_operations(auth.uid()) AND public.has_module(auth.uid(),'companies')) WITH CHECK (public.can_manage_operations(auth.uid()) AND public.has_module(auth.uid(),'companies'));
CREATE POLICY "Managers delete company categories" ON public.company_ticket_categories FOR DELETE TO authenticated USING (public.can_manage_operations(auth.uid()) AND public.has_module(auth.uid(),'companies'));

CREATE OR REPLACE FUNCTION public.validate_company_ticket_category()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.ticket_categories WHERE id = NEW.category_id AND parent_id IS NULL AND status = 'active') THEN
      RAISE EXCEPTION 'Somente categorias principais ativas podem ser associadas à empresa.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_company_ticket_category BEFORE INSERT OR UPDATE ON public.company_ticket_categories
FOR EACH ROW EXECUTE FUNCTION public.validate_company_ticket_category();