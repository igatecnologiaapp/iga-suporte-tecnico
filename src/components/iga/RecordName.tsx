import { Building2, UserRound } from "lucide-react";

export function RecordName({ kind, name }: { kind: "company" | "contact"; name: string }) {
  const Icon = kind === "company" ? Building2 : UserRound;
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="record-name-icon" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 break-words">{name}</span>
    </span>
  );
}
