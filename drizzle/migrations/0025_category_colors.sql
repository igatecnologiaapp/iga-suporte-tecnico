-- Cor individual de categoria/subcategoria. Preserva nomes, vínculos e políticas existentes.
ALTER TABLE public.ticket_categories
  ADD COLUMN color text NOT NULL DEFAULT '#0ea5e9';
ALTER TABLE public.ticket_categories
  ADD CONSTRAINT ticket_categories_color_palette
  CHECK (color IN ('#0ea5e9','#eab308','#ec4899','#8b5cf6','#10b981','#f97316','#ef4444'));
COMMENT ON COLUMN public.ticket_categories.color IS 'Cor predefinida da etiqueta, compartilhada entre Categorias e Empresas / Clientes.';
NOTIFY pgrst, 'reload schema';
