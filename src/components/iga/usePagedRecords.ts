import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PAGE_SIZE, pagedRecordsSchema } from "../../lib/list-pagination";
const empty = pagedRecordsSchema.parse({
  rows: [],
  total: 0,
  page: 1,
  pageSize: 5,
  counts: { all: 0, active: 0, inactive: 0 },
  summary: { all: 0, active: 0, inactive: 0 },
  queues: {},
});
export function usePagedRecords(
  entity: "companies" | "contacts" | "technicians" | "categories" | "tickets",
  filters: Record<string, string>,
) {
  const search = filters["search"] ?? "";
  const [debounced, setDebounced] = useState({ entity, search });
  const appliedSearch = debounced.entity === entity ? debounced.search : search;
  const debouncing = appliedSearch !== search;
  useEffect(() => {
    if (debounced.entity === entity && debounced.search === search) return;
    const timer = window.setTimeout(() => setDebounced({ entity, search }), 250);
    return () => window.clearTimeout(timer);
  }, [entity, search, debounced]);
  const filterKey = JSON.stringify({ ...filters, search: appliedSearch });
  const scope = JSON.stringify([entity, filterKey]);
  const [selection, setSelection] = useState({ scope, page: 1 });
  const page = selection.scope === scope ? selection.page : 1;
  const pageSize = DEFAULT_PAGE_SIZE;
  const [version, setVersion] = useState(0);
  const requestKey = JSON.stringify([scope, page, pageSize, version]);
  const [state, setState] = useState({
    key: "",
    dataScope: "",
    data: pagedRecordsSchema.parse(empty),
    loading: true,
    error: null as string | null,
  });
  const delivered = useRef("");
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    if (delivered.current === requestKey) return;
    let active = true;
    setSelection((value) => (value.scope === scope ? value : { ...value, scope, page: 1 }));
    setState((value) => ({ ...value, key: requestKey, loading: true, error: null }));
    void (async () => {
      try {
        const response = await supabase.rpc("list_paged_records", {
          _entity: entity,
          _page: page,
          _page_size: pageSize,
          _filters: JSON.parse(filterKey),
        });
        if (response.error) throw response.error;
        const result = pagedRecordsSchema.parse(response.data);
        if (result.pageSize !== pageSize) throw new Error("Tamanho de página inválido.");
        if (!active) return;
        const key = JSON.stringify([scope, result.page, pageSize, version]);
        delivered.current = key;
        setState({ key, dataScope: scope, data: result, loading: false, error: null });
        setSelection((value) => ({ ...value, scope, page: result.page }));
      } catch {
        if (active)
          setState({
            key: requestKey,
            dataScope: "",
            data: pagedRecordsSchema.parse(empty),
            loading: false,
            error: "Não foi possível carregar esta página. Tente novamente.",
          });
      }
    })();
    return () => {
      active = false;
    };
  }, [requestKey, scope, entity, filterKey, page, pageSize, version]);
  const current = state.key === requestKey;
  const loading = !current || state.loading || debouncing;
  const hasRetainedRows = loading && state.dataScope === scope && state.data.rows.length > 0;
  return {
    data: !loading || hasRetainedRows ? state.data : { ...empty, page, pageSize },
    loading,
    hasRetainedRows,
    error: current ? state.error : null,
    page,
    pageSize,
    refresh,
    setPage: (value: number) =>
      setSelection((previous) => ({ ...previous, scope, page: Math.max(1, value) })),
  };
}
