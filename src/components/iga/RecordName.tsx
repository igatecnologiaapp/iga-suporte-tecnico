/** Área: Identificação visual de empresas, pessoas e categorias nas tabelas. */
import { Building2, CornerDownRight, Tags, UserRound } from "lucide-react";
import { CategoryChip } from "./CategoryChip";

/** Exibe nome e informação complementar com o ícone correspondente ao cadastro. */
export function RecordName({
  kind,
  name,
  detail,
  categoryColor,
}: {
  kind: "company" | "contact" | "category" | "subcategory";
  name: string;
  detail?: string | null;
  categoryColor?: string | null | undefined;
}) {
  const Icon = {
    company: Building2,
    contact: UserRound,
    category: Tags,
    subcategory: CornerDownRight,
  }[kind];
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="record-name-icon" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 break-words">
        {kind === "category" || kind === "subcategory" ? (
          <CategoryChip name={name} color={categoryColor} />
        ) : (
          name
        )}
        {detail && (
          <small className="mt-1 block break-all text-xs font-normal text-muted-foreground">
            {detail}
          </small>
        )}
      </span>
    </span>
  );
}
