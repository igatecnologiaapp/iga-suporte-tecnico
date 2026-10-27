/** Área: Totais gerais de categorias e subcategorias autorizadas. */
import { Archive, CheckCircle2, Tags } from "lucide-react";

/** Apresenta os totais de categorias ativas e inativas autorizadas. */
export function CategoryOverview({
  summary,
  loading,
}: {
  summary: { all: number; active: number; inactive: number };
  loading: boolean;
}) {
  const items = [
    { label: "Total de categorias", value: summary.all, Icon: Tags },
    { label: "Categorias ativas", value: summary.active, Icon: CheckCircle2 },
    { label: "Inativas / arquivadas", value: summary.inactive, Icon: Archive },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-3" aria-label="Resumo das categorias disponíveis">
      {items.map(({ label, value, Icon }) => (
        <div key={label} className="company-stat">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-2 text-2xl font-semibold tracking-tight">{loading ? "—" : value}</dd>
          </div>
          <Icon aria-hidden="true" className="size-9 rounded-xl bg-primary/10 p-2 text-primary" />
        </div>
      ))}
    </dl>
  );
}
