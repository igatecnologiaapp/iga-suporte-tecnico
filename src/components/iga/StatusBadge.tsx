import { Badge } from "@/components/ui/badge";
import { priorityLabels, statusLabels } from "@/lib/iga";
export function StatusBadge({
  value,
  kind = "status",
  inactiveLabel = "Inativo",
}: {
  value: string;
  kind?: "status" | "priority" | "record";
  inactiveLabel?: string;
}) {
  if (kind === "record" && (value === "active" || value === "inactive")) {
    return (
      <span className={`record-status record-status-${value}`}>
        <span className="record-state-dot" aria-hidden="true" />
        {value === "active" ? "Ativo" : inactiveLabel}
      </span>
    );
  }
  const label =
    kind === "priority" ? priorityLabels[value] : kind === "record" ? value : statusLabels[value];
  const tone = ["urgent", "cancelled", "inactive"].includes(value)
    ? "destructive"
    : ["resolved", "closed", "active"].includes(value)
      ? "secondary"
      : "outline";
  return <Badge variant={tone}>{label ?? value}</Badge>;
}
