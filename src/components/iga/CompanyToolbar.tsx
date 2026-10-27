/** Área: Pesquisa e filtros combinados da listagem de empresas. */
import { useState } from "react";
import { ChevronDown, Filter, LayoutGrid, Search, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { CompanyListFilters, CompanySort, CompanyDomainFilter } from "../../lib/company-list";

/** Combina pesquisa, categoria, situação e opções adicionais de empresas. */
export function CompanyToolbar({
  filters,
  counts,
  visibleCount,
  categories,
  unavailable,
  onChange,
}: {
  filters: CompanyListFilters;
  counts: { all: number; active: number; inactive: number };
  visibleCount: number;
  categories: { id: string; name: string; parent_id?: string | null; status: string }[];
  unavailable: boolean;
  onChange: (filters: CompanyListFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const advancedCount = Number(filters.sort !== "name_asc") + Number(filters.domain !== "all");
  const hasFilters = Boolean(filters.search.trim() || filters.categoryId || advancedCount);
  return (
    <div className="company-list-controls space-y-3">
      <div className="resource-toolbar company-toolbar">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
          />
          <Input
            className="h-10 pl-10"
            aria-label="Pesquisar empresas por nome, documento ou domínio"
            maxLength={300}
            placeholder="Nome, documento ou domínio..."
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
          />
        </div>
        <select
          aria-label="Filtrar por categoria"
          className="form-control company-category-filter"
          disabled={unavailable}
          value={filters.categoryId}
          onChange={(event) => onChange({ ...filters, categoryId: event.target.value })}
        >
          <option value="">Categoria: todas</option>
          {categories.map((category) => {
            const parent = category.parent_id
              ? categories.find((item) => item.id === category.parent_id)
              : null;
            return (
              <option key={category.id} value={category.id}>
                {parent ? `${parent.name} — ` : ""}
                {category.name}
                {category.status === "inactive" ? " (inativa)" : ""}
              </option>
            );
          })}
        </select>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button className="h-10" variant="outline" disabled={unavailable}>
              <Filter className="text-primary" />
              Mais filtros
              {advancedCount > 0 && (
                <span
                  className="rounded-full bg-primary/10 px-1.5 text-xs"
                  aria-label={`${advancedCount} filtro(s) adicional(is) ativo(s)`}
                >
                  {advancedCount}
                </span>
              )}
              <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-80 max-w-[calc(100vw_-_2rem)] space-y-4 bg-card text-card-foreground"
            aria-label="Mais filtros de empresas"
          >
            <h2 className="text-sm font-semibold">Refinar listagem</h2>
            <div className="space-y-1.5">
              <Label htmlFor="company-sort">Ordenar por</Label>
              <select
                id="company-sort"
                className="form-control"
                value={filters.sort}
                onChange={(event) =>
                  onChange({ ...filters, sort: event.target.value as CompanySort })
                }
              >
                <option value="name_asc">Nome: A–Z</option>
                <option value="name_desc">Nome: Z–A</option>
                <option value="newest">Cadastro: mais recentes</option>
                <option value="oldest">Cadastro: mais antigos</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-domain-filter">Domínio</Label>
              <select
                id="company-domain-filter"
                className="form-control"
                value={filters.domain}
                onChange={(event) =>
                  onChange({ ...filters, domain: event.target.value as CompanyDomainFilter })
                }
              >
                <option value="all">Todos os cadastros</option>
                <option value="present">Com domínio preenchido</option>
                <option value="missing">Sem domínio</option>
              </select>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Os filtros são combinados com a pesquisa, a categoria e a situação selecionada.
            </p>
            <Button className="w-full" variant="outline" onClick={() => setOpen(false)}>
              Concluir
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex max-w-full flex-wrap gap-2"
          role="group"
          aria-label="Filtrar empresas por situação"
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
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                search: "",
                categoryId: "",
                status: filters.status,
                sort: "name_asc",
                domain: "all",
              })
            }
          >
            <X />
            Limpar filtros
          </Button>
        )}
      </div>
      {!unavailable && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {visibleCount} {visibleCount === 1 ? "empresa encontrada" : "empresas encontradas"}
        </p>
      )}
    </div>
  );
}
