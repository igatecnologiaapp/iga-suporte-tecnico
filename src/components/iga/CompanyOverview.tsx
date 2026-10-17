import { Archive, Building2, CheckCircle2 } from "lucide-react";
export function CompanyOverview({
  rows,
  loading,
}: {
  rows: { status: string }[];
  loading: boolean;
}) {
  const items = [
    { label: "Total de empresas", value: rows.length, Icon: Building2 },
    {
      label: "Empresas ativas",
      value: rows.filter((row) => row.status === "active").length,
      Icon: CheckCircle2,
    },
    {
      label: "Arquivadas / inativas",
      value: rows.filter((row) => row.status === "inactive").length,
      Icon: Archive,
    },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-3" aria-label="Resumo dos cadastros disponíveis">
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
