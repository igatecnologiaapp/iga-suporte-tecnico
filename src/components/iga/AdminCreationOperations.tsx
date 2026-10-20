import type { CreationOperation } from "../../lib/admin-user-creation";
import { Button } from "../ui/button";

const labels = {
  not_requested: "Convite ainda não solicitado",
  sending: "Envio em andamento ou aguardando confirmação",
  accepted: "Envio do convite aceito",
  failed: "Envio do convite recusado",
  unknown: "Resultado do envio não confirmado",
  activated: "E-mail já confirmado",
};
export function AdminCreationOperations({
  operations,
  busyId,
  onResume,
  onResend,
}: {
  operations: CreationOperation[];
  busyId: string | null;
  onResume: (operationId: string) => void;
  onResend: (operationId: string) => void;
}) {
  if (operations.length === 0) return null;
  return (
    <section className="rounded-md border bg-card p-5" aria-label="Cadastros e convites">
      <h2 className="font-semibold">Cadastros e convites</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Retome cadastros pendentes sem criar outra conta. Antes de reenviar um convite, confira o
        e-mail do titular. O reenvio substitui o link anterior. Aguarde ao menos um minuto entre
        reenvios; se o envio estiver em andamento, aguarde cinco minutos antes de tentar novamente.
      </p>
      <div className="mt-4 divide-y">
        {operations.map((op) => (
          <div
            key={op.operationId}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="font-medium">{op.payload.fullName}</p>
              <p className="text-sm text-muted-foreground">{op.payload.email}</p>
              <p className="text-sm" role="status">
                {op.stage === "reserved"
                  ? "Cadastro pendente — acesso ainda bloqueado"
                  : labels[op.deliveryState]}
              </p>
            </div>
            {op.stage === "reserved" ? (
              <Button
                variant="outline"
                disabled={busyId !== null}
                onClick={() => onResume(op.operationId)}
              >
                Retomar cadastro
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={busyId !== null || op.deliveryState === "activated"}
                onClick={() => onResend(op.operationId)}
              >
                Reenviar convite
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
