CREATE OR REPLACE FUNCTION public.validate_company_ticket_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.ticket_categories WHERE id = NEW.category_id AND status = 'active') THEN
      RAISE EXCEPTION 'Somente categorias ativas podem ser associadas à empresa.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ticket_categories WHERE id = NEW.category_id AND parent_id IS NOT NULL) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.company_ticket_categories ctc
        JOIN public.ticket_categories tc ON tc.id = ctc.category_id
        WHERE ctc.company_id = NEW.company_id
          AND tc.id = (SELECT parent_id FROM public.ticket_categories WHERE id = NEW.category_id)
      ) THEN
        RAISE EXCEPTION 'A categoria principal precisa estar associada à empresa antes da subcategoria.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;