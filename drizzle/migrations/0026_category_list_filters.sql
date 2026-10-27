-- Área: Filtro de tipo aplicado antes da paginação de categorias; mantém RLS e funções publicadas.
CREATE FUNCTION public.list_paged_categories(
  _page integer DEFAULT 1, _page_size integer DEFAULT 5,
  _filters jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid := auth.uid();
  search_value text := lower(btrim(coalesce(_filters->>'search','')));
  status_value text := coalesce(_filters->>'status','all');
  sort_value text := coalesce(_filters->>'sort','name_asc');
  type_value text := coalesce(_filters->>'type','all');
  result jsonb;
BEGIN
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND status='active')
    OR NOT public.has_module(actor,'categories') THEN
    RAISE EXCEPTION 'Seu acesso não permite consultar categorias.' USING ERRCODE='42501';
  END IF;
  IF _page IS NULL OR _page<1 OR _page>1000000 OR _page_size IS NULL OR _page_size<>5
    OR _filters IS NULL OR jsonb_typeof(_filters)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_each(_filters) e WHERE e.key NOT IN
      ('search','status','sort','type')
      OR jsonb_typeof(e.value) NOT IN ('string','null'))
    OR length(coalesce(_filters->>'search',''))>300
    OR status_value NOT IN ('all','active','inactive')
    OR sort_value NOT IN ('name_asc','name_desc')
    OR type_value NOT IN ('all','category','subcategory') THEN
    RAISE EXCEPTION 'Filtros de categorias inválidos.' USING ERRCODE='22023';
  END IF;
  WITH scoped AS MATERIALIZED (
    SELECT c.id,c.name,c.status
    FROM public.ticket_categories c
    WHERE (type_value='all' OR (type_value='category' AND c.parent_id IS NULL)
      OR (type_value='subcategory' AND c.parent_id IS NOT NULL))
      AND (search_value='' OR strpos(lower(c.name),search_value)>0)
  ), selected AS MATERIALIZED (
    SELECT * FROM scoped WHERE status_value='all' OR status::text=status_value
  ), stats AS (SELECT count(*) AS total FROM selected),
  bounds AS (SELECT greatest(1,least(_page,ceil(total::numeric/_page_size)::integer)) AS page FROM stats),
  page_rows AS (
    SELECT s.*,row_number() OVER (ORDER BY
      CASE WHEN sort_value='name_asc' THEN s.name END COLLATE public.iga_list_pt_natural ASC,
      CASE WHEN sort_value='name_desc' THEN s.name END COLLATE public.iga_list_pt_natural DESC,s.id) AS position
    FROM selected s ORDER BY position
    LIMIT _page_size OFFSET (SELECT (page-1)*_page_size FROM bounds)
  )
  SELECT jsonb_build_object(
    'page',(SELECT page FROM bounds),'pageSize',_page_size,'total',(SELECT total FROM stats),
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY p.position)
      FROM page_rows p JOIN public.ticket_categories c ON c.id=p.id),'[]'::jsonb),
    'counts',(SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE status='active'),
      'inactive',count(*) FILTER(WHERE status='inactive')) FROM scoped),
    'summary',(SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE status='active'),
      'inactive',count(*) FILTER(WHERE status='inactive')) FROM public.ticket_categories),
    'queues','{}'::jsonb) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_paged_categories(integer,integer,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_paged_categories(integer,integer,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
