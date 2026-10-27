-- Contact-specific read model. Existing shared pagination and RLS are unchanged.
CREATE FUNCTION public.list_paged_contacts(
  _page integer DEFAULT 1, _page_size integer DEFAULT 5,
  _filters jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid := auth.uid();
  search_value text := lower(btrim(coalesce(_filters->>'search','')));
  status_value text := coalesce(_filters->>'status','active');
  sort_value text := coalesce(_filters->>'sort','name_asc');
  company_value uuid;
  result jsonb;
BEGIN
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND status='active')
    OR NOT public.has_module(actor,'contacts') THEN
    RAISE EXCEPTION 'Seu acesso não permite consultar contatos.' USING ERRCODE='42501';
  END IF;
  IF _page IS NULL OR _page<1 OR _page>1000000 OR _page_size IS NULL OR _page_size<>5
    OR _filters IS NULL OR jsonb_typeof(_filters)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_each(_filters) e WHERE e.key NOT IN
      ('search','status','sort','companyId')
      OR jsonb_typeof(e.value) NOT IN ('string','null'))
    OR length(coalesce(_filters->>'search',''))>300
    OR status_value NOT IN ('all','active','inactive')
    OR sort_value NOT IN ('name_asc','name_desc') THEN
    RAISE EXCEPTION 'Filtros de contatos inválidos.' USING ERRCODE='22023';
  END IF;
  company_value := nullif(_filters->>'companyId','')::uuid;
  WITH scoped AS MATERIALIZED (
    SELECT c.id,c.name,c.status
    FROM public.contacts c
    WHERE (company_value IS NULL OR c.company_id=company_value)
      AND (search_value='' OR strpos(lower(concat_ws(' ',c.name,c.email,c.phone,c.whatsapp,c.phone_normalized,c.whatsapp_normalized,c.job_title)),search_value)>0)
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
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('companies',
      CASE WHEN co.id IS NULL THEN NULL ELSE jsonb_build_object('trade_name',co.trade_name,'status',co.status) END)
      ORDER BY p.position)
      FROM page_rows p JOIN public.contacts c ON c.id=p.id
      LEFT JOIN public.companies co ON co.id=c.company_id),'[]'::jsonb),
    'counts',(SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE status='active'),
      'inactive',count(*) FILTER(WHERE status='inactive')) FROM scoped),
    'summary',(SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE status='active'),
      'inactive',count(*) FILTER(WHERE status='inactive')) FROM public.contacts),
    'queues','{}'::jsonb) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_paged_contacts(integer,integer,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_paged_contacts(integer,integer,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
