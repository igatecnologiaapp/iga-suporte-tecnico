ALTER TABLE public.companies ADD COLUMN domain text;
COMMENT ON COLUMN public.companies.domain IS 'Domínio do site da empresa (normalizado, sem protocolo), opcional.';