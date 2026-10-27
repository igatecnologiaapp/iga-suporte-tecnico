/** Área: Pesquisa, situação e ordenação das categorias de chamados. */
import { useState } from "react";
import { ChevronDown, Filter, LayoutGrid, Search, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export type CategoryListFilters = {
  search: string;
  status: "all" | "active" | "inactive";
  sort: "name_asc" | "name_desc";
  type: "all" | "category" | "subcategory";
};
/** Combina nome, tipo, situação e ordem alfabética sem alterar os vínculos das categorias. */
export function CategoryToolbar({
  filters,
  counts,
  visibleCount,
  unavailable,
  onChange,
}: {
  filters: CategoryListFilters;
  counts: { all: number; active: number; inactive: number };
  visibleCount: number;
  unavailable: boolean;
  onChange: (value: CategoryListFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const advancedCount = Number(filters.sort !== "name_asc") + Number(filters.type !== "all");
  const hasFilters = Boolean(filters.search.trim() || advancedCount);
  return (
    <div className="company-list-controls space-y-3">
      <div className="resource-toolbar flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-[1_1_16rem]">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
          />
          <Input
            className="h-10 pl-10"
            aria-label="Pesquisar categorias por nome"
            maxLength={300}
            placeholder="Buscar categoria ou subcategoria..."
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
          />
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button className="h-10" variant="outline" disabled={unavailable}>
              <Filter className="text-primary" />
              Filtros
              {advancedCount > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 text-xs">{advancedCount}</span>
              )}
              <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-96 max-w-[calc(100vw_-_2rem)] space-y-4 bg-card text-card-foreground"
            aria-label="Filtros de categorias"
          >
            <h2 className="text-sm font-semibold">Refinar categorias</h2>
            <div className="space-y-1.5">
              <Label htmlFor="category-type">Exibir</Label>
              <select
                id="category-type"
                className="form-control"
                value={filters.type}
                onChange={(event) =>
                  onChange({ ...filters, type: event.target.value as CategoryListFilters["type"] })
                }
              >
                <option value="all">Categorias e subcategorias</option>
                <option value="category">Somente categorias</option>
                <option value="subcategory">Somente subcategorias</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category-sort">Ordenar por</Label>
              <select
                id="category-sort"
                className="form-control"
                value={filters.sort}
                onChange={(event) =>
                  onChange({ ...filters, sort: event.target.value as CategoryListFilters["sort"] })
                }
              >
                <option value="name_asc">Nome: A–Z</option>
                <option value="name_desc">Nome: Z–A</option>
              </select>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Os filtros são combinados com a pesquisa e a situação selecionada.
            </p>
            <Button className="w-full" variant="outline" onClick={() => setOpen(false)}>
              Concluir
            </Button>
          </PopoverContent>
        </Popover>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({ search: "", status: filters.status, sort: "name_asc", type: "all" })
            }
          >
            <X />
            Limpar filtros
          </Button>
        )}
      </div>
      <div
        className="flex max-w-full flex-wrap gap-2"
        role="group"
        aria-label="Filtrar categorias por situação"
      >
        {(
          [
            ["all", "Todas"],
            ["active", "Ativas"],
            ["inactive", "Inativas / Arquivadas"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="company-status-filter"
            aria-pressed={filters.status === value}
            disabled={unavailable}
            onClick={() => onChange({ ...filters, status: value })}
          >
            {value === "all" ? (
              <LayoutGrid aria-hidden="true" className="size-4" />
            ) : (
              <span aria-hidden="true" className={`record-state-dot record-state-${value}`} />
            )}
            {label}
            <span className="company-filter-count">{unavailable ? "—" : counts[value]}</span>
          </button>
        ))}
      </div>
      {!unavailable && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {visibleCount} {visibleCount === 1 ? "categoria encontrada" : "categorias encontradas"}
        </p>
      )}
    </div>
  );
}
