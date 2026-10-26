export type CompanyStatusFilter = "all" | "active" | "inactive";
export type CompanySort = "name_asc" | "name_desc" | "newest" | "oldest";
export type CompanyDomainFilter = "all" | "present" | "missing";
export type CompanyListFilters = {
  search: string;
  categoryId: string;
  status: CompanyStatusFilter;
  sort: CompanySort;
  domain: CompanyDomainFilter;
};
type CompanyListRow = {
  id: string;
  status: string;
  trade_name?: string;
  domain?: string | null;
  created_at?: string;
};
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** A view over already-authorized rows; never changes records or category links. */
export function buildCompanyList<T extends CompanyListRow>(
  rows: readonly T[],
  links: readonly { company_id: string; category_id: string }[],
  filters: CompanyListFilters,
) {
  const categoryIds = new Set(
    links.filter((link) => link.category_id === filters.categoryId).map((link) => link.company_id),
  );
  const search = filters.search.trim().toLocaleLowerCase("pt-BR");
  const matching = rows.filter((row) => {
    if (filters.categoryId && !categoryIds.has(row.id)) return false;
    if (search && !JSON.stringify(row).toLocaleLowerCase("pt-BR").includes(search)) return false;
    const hasDomain = Boolean(row.domain?.trim());
    return filters.domain === "all" || (filters.domain === "present" ? hasDomain : !hasDomain);
  });
  // Counts describe the same search/category/domain scope as the visible rows.
  const counts = {
    all: matching.length,
    active: matching.filter((row) => row.status === "active").length,
    inactive: matching.filter((row) => row.status === "inactive").length,
  };
  const visible = matching.filter(
    (row) => filters.status === "all" || row.status === filters.status,
  );
  const nameOrder = (a: T, b: T) =>
    collator.compare(a.trade_name ?? "", b.trade_name ?? "") || collator.compare(a.id, b.id);
  const timestamp = (row: T) => {
    const value = Date.parse(row.created_at ?? "");
    return Number.isFinite(value) ? value : 0;
  };
  visible.sort((a, b) => {
    if (filters.sort === "name_asc") return nameOrder(a, b);
    if (filters.sort === "name_desc") return -nameOrder(a, b);
    const difference = timestamp(a) - timestamp(b);
    return (filters.sort === "newest" ? -difference : difference) || nameOrder(a, b);
  });
  return { rows: visible, counts };
}
