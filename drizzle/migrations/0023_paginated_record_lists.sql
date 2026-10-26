-- Read-only, caller-scoped pages. Existing RLS and grants remain authoritative.
CREATE COLLATION IF NOT EXISTS public.iga_list_pt_natural
  (provider = icu, locale = 'pt-u-kn-true-ks-level1', deterministic = false);

CREATE FUNCTION public.list_paged_records(
  _entity text, _page integer DEFAULT 1, _page_size integer DEFAULT 5,
  _filters jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  source_sql text;
  query_sql text;
  result jsonb;
  actor uuid := auth.uid();
  search_value text := coalesce(_filters->>'search','');
  status_value text := coalesce(nullif(_filters->>'status',''),CASE WHEN _entity='tickets' THEN 'all' ELSE 'active' END);
  sort_value text := coalesce(_filters->>'sort',CASE WHEN _entity='tickets' THEN 'newest' ELSE 'name_asc' END);
  domain_value text := coalesce(_filters->>'domain','all');
  queue_value text := coalesce(_filters->>'queue','all');
  category_value uuid;
  company_value uuid;
  technician_value uuid;
  my_technician uuid;
  priority_value text := coalesce(_filters->>'priority','');
BEGIN
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND status='active')
    OR NOT public.has_module(actor,_entity) THEN
    RAISE EXCEPTION 'Seu acesso não permite consultar esta lista.' USING ERRCODE='42501';
  END IF;
  IF _entity NOT IN ('companies','contacts','technicians','categories','tickets')
    OR _page IS NULL OR _page<1 OR _page>1000000
    OR _page_size IS NULL OR _page_size NOT IN (5,10,20,50)
    OR _filters IS NULL OR jsonb_typeof(_filters)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_each(_filters) e WHERE e.key NOT IN
       ('search','status','sort','domain','categoryId','priority','companyId','technicianId','queue')
       OR jsonb_typeof(e.value) NOT IN ('string','null'))
    OR length(search_value)>300
    OR sort_value NOT IN ('name_asc','name_desc','newest','oldest')
    OR domain_value NOT IN ('all','present','missing')
    OR queue_value NOT IN ('all','unassigned','mine','intake','in_progress','waiting_customer','waiting_third_party','scheduled','resolved')
    OR (_entity<>'tickets' AND status_value NOT IN ('all','active','inactive'))
    OR (_entity='tickets' AND status_value NOT IN ('all','new','triage','in_progress','reopened','waiting_customer','waiting_third_party','scheduled','resolved','closed','cancelled','duplicate'))
    OR priority_value NOT IN ('','low','normal','high','urgent') THEN
    RAISE EXCEPTION 'Filtros de listagem inválidos.' USING ERRCODE='22023';
  END IF;
  category_value := nullif(_filters->>'categoryId','')::uuid;
  company_value := nullif(_filters->>'companyId','')::uuid;
  technician_value := nullif(_filters->>'technicianId','')::uuid;
  search_value := lower(btrim(search_value));
  IF _entity='companies' THEN
    source_sql := 'SELECT c.id,c.trade_name AS name,c.status::text AS status,c.created_at,c.domain AS domain_value,NULL::text AS priority,NULL::uuid AS company_id,NULL::uuid AS assigned_id,to_jsonb(c) AS item FROM public.companies c';
  ELSIF _entity='contacts' THEN
    source_sql := 'SELECT c.id,c.name,c.status::text AS status,c.created_at,NULL::text AS domain_value,NULL::text AS priority,c.company_id,NULL::uuid AS assigned_id,to_jsonb(c) AS item FROM public.contacts c';
  ELSIF _entity='categories' THEN
    source_sql := 'SELECT c.id,c.name,c.status::text AS status,c.created_at,NULL::text AS domain_value,NULL::text AS priority,NULL::uuid AS company_id,NULL::uuid AS assigned_id,to_jsonb(c) AS item FROM public.ticket_categories c';
  ELSIF _entity='technicians' THEN
    -- Do not select columns that callers cannot read directly. The existing
    -- contact RPC still controls access to telephone/e-mail.
    source_sql := 'SELECT t.id,t.name,t.status::text AS status,t.created_at,NULL::text AS domain_value,NULL::text AS priority,NULL::uuid AS company_id,NULL::uuid AS assigned_id,
      jsonb_build_object(''id'',t.id,''name'',t.name,''user_id'',t.user_id,
       ''specialty'',t.specialty,''status'',t.status,''created_at'',t.created_at,
       ''updated_at'',t.updated_at,''phone'',c.phone,''email'',c.email) AS item
      FROM public.technicians t LEFT JOIN public.technician_contacts() c ON c.id=t.id';
  ELSE
    SELECT id INTO my_technician FROM public.technicians WHERE user_id=actor AND status='active' ORDER BY id LIMIT 1;
    source_sql := 'SELECT t.id,t.subject AS name,t.status::text AS status,t.opened_at AS created_at,NULL::text AS domain_value,t.priority::text AS priority,t.company_id,t.assigned_technician_id AS assigned_id,
      jsonb_build_object(''id'',t.id,''number'',t.number,''subject'',t.subject,''status'',t.status,
       ''priority'',t.priority,''opened_at'',t.opened_at,''company_id'',t.company_id,
       ''assigned_technician_id'',t.assigned_technician_id,''acknowledged_at'',t.acknowledged_at,
       ''first_response_at'',t.first_response_at,''resolved_at'',t.resolved_at,''closed_at'',t.closed_at,
       ''scheduled_at'',t.scheduled_at,''last_activity_at'',t.last_activity_at,
       ''companies'',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(''trade_name'',c.trade_name) END,
       ''technicians'',CASE WHEN te.id IS NULL THEN NULL ELSE jsonb_build_object(''name'',te.name) END) AS item
      FROM public.tickets t LEFT JOIN public.companies c ON c.id=t.company_id
      LEFT JOIN public.technicians te ON te.id=t.assigned_technician_id';
  END IF;
  -- Only the allowlisted, constant SELECT above is interpolated. Every filter,
  -- UUID, offset and limit is supplied as a bound SQL parameter.
  query_sql := format($query$
    WITH base AS NOT MATERIALIZED (%s),
    scoped AS MATERIALIZED (
      SELECT b.id,b.name,b.status,b.created_at,b.domain_value,b.priority,b.company_id,b.assigned_id FROM base b
      WHERE ($1='' OR strpos(lower(b.item::text),$1)>0)
      AND ($8<>'companies' OR (
        ($3 IS NULL OR EXISTS(SELECT 1 FROM public.company_ticket_categories l WHERE l.company_id=b.id AND l.category_id=$3))
        AND ($4='all' OR ($4='present')=(btrim(coalesce(b.domain_value,''),E' \t\n\r')<>''))))
      AND ($8<>'tickets' OR (
        ($2='all' OR b.status=$2)
        AND ($11='' OR b.priority=$11)
        AND ($12 IS NULL OR b.company_id=$12)
        AND ($13 IS NULL OR b.assigned_id=$13)))
    ), selected AS MATERIALIZED (
      SELECT * FROM scoped b WHERE
      CASE WHEN $8<>'tickets' THEN ($2='all' OR b.status=$2)
      ELSE CASE $9
        WHEN 'all' THEN true
        WHEN 'unassigned' THEN b.assigned_id IS NULL AND b.status NOT IN ('closed','cancelled','duplicate')
        WHEN 'mine' THEN $10 IS NOT NULL AND b.assigned_id=$10
        WHEN 'intake' THEN b.status IN ('new','triage')
        WHEN 'in_progress' THEN b.status IN ('in_progress','reopened')
        WHEN 'waiting_customer' THEN b.status='waiting_customer'
        WHEN 'waiting_third_party' THEN b.status='waiting_third_party'
        WHEN 'scheduled' THEN b.status='scheduled'
        WHEN 'resolved' THEN b.status IN ('resolved','closed')
        ELSE false END END
    ), stats AS (SELECT count(*) AS total FROM selected),
    bounds AS (SELECT greatest(1,least($6,ceil(total::numeric/$7)::integer)) AS page FROM stats),
    page_rows AS (
      SELECT b.*,row_number() OVER (ORDER BY
        CASE WHEN $5='name_asc' THEN b.name END COLLATE public.iga_list_pt_natural ASC,
        CASE WHEN $5='name_desc' THEN b.name END COLLATE public.iga_list_pt_natural DESC,
        CASE WHEN $5='newest' THEN b.created_at END DESC NULLS LAST,
        CASE WHEN $5='oldest' THEN b.created_at END ASC NULLS LAST,
        b.name COLLATE public.iga_list_pt_natural,b.id) AS position
      FROM selected b
      ORDER BY position
      LIMIT $7 OFFSET (SELECT (page-1)*$7 FROM bounds)
    )
    SELECT jsonb_build_object(
      'page',(SELECT page FROM bounds),'pageSize',$7,'total',(SELECT total FROM stats),
      'rows',coalesce((SELECT jsonb_agg(
        CASE WHEN $8='companies' THEN payload.item || jsonb_build_object('category_links',
          coalesce((SELECT jsonb_agg(jsonb_build_object('company_id',l.company_id,'category_id',l.category_id,'is_default',l.is_default) ORDER BY l.category_id)
          FROM public.company_ticket_categories l WHERE l.company_id=p.id),'[]'::jsonb))
        ELSE payload.item END ORDER BY p.position) FROM page_rows p JOIN base payload ON payload.id=p.id),'[]'::jsonb),
      'counts',(SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE status='active'),'inactive',count(*) FILTER(WHERE status='inactive')) FROM scoped),
      'summary',(SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE status='active'),'inactive',count(*) FILTER(WHERE status='inactive')) FROM base),
      'queues',CASE WHEN $8='tickets' THEN (SELECT jsonb_build_object(
        'all',count(*),
        'unassigned',count(*) FILTER(WHERE assigned_id IS NULL AND status NOT IN ('closed','cancelled','duplicate')),
        'mine',count(*) FILTER(WHERE $10 IS NOT NULL AND assigned_id=$10),
        'intake',count(*) FILTER(WHERE status IN ('new','triage')),
        'in_progress',count(*) FILTER(WHERE status IN ('in_progress','reopened')),
        'waiting_customer',count(*) FILTER(WHERE status='waiting_customer'),
        'waiting_third_party',count(*) FILTER(WHERE status='waiting_third_party'),
        'scheduled',count(*) FILTER(WHERE status='scheduled'),
        'resolved',count(*) FILTER(WHERE status IN ('resolved','closed'))) FROM scoped) ELSE '{}'::jsonb END)
  $query$,source_sql);
  EXECUTE query_sql INTO result USING search_value,status_value,category_value,domain_value,
    sort_value,_page,_page_size,_entity,queue_value,my_technician,priority_value,company_value,technician_value;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_paged_records(text,integer,integer,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_paged_records(text,integer,integer,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
