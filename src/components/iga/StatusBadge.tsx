import { Badge } from "@/components/ui/badge";
import { priorityLabels, statusLabels } from "@/lib/iga";
export function StatusBadge({ value, kind = "status" }: { value: string; kind?: "status" | "priority" | "record" }) {
  const label = kind === "priority" ? priorityLabels[value] : kind === "record" ? (value === "active" ? "Ativo" : "Inativo") : statusLabels[value];
  const tone = ["urgent","cancelled","inactive"].includes(value) ? "destructive" : ["resolved","closed","active"].includes(value) ? "secondary" : "outline";
  return <Badge variant={tone}>{label ?? value}</Badge>;
}
