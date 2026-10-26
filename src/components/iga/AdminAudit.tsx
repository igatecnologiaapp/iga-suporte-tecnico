import { useEffect, useState } from "react";
import { formatDate } from "../../lib/iga";

export type AdminAuditRecord = {
  id: string;
  action: string;
  target_name: string;
  actor_name: string;
  created_at: string;
  old_value?: unknown;
  new_value?: unknown;
};

const auditLabels: Record<string, string> = {
  user_creation_reserved: "Cadastro reservado",
  user_invitation_requested: "Convite solicitado",
  user_invitation_accepted: "Envio de convite aceito",
  user_invitation_failed: "Envio de convite recusado",
  user_invitation_unknown: "Envio de convite não confirmado",
  user_invitation_activated: "E-mail já confirmado",
  user_created: "Usuário criado",
  user_updated: "Dados atualizados",
  role_changed: "Perfil de acesso alterado",
  user_activated: "Usuário ativado",
  user_deactivated: "Usuário desativado",
  technician_linked: "Técnico vinculado",
  technician_unlinked: "Técnico desvinculado",
  password_reset_requested: "Recuperação solicitada",
  password_reset_email_requested: "Envio de recuperação aceito",
  password_reset_failed: "Envio de recuperação não confirmado",
  modules_changed: "Módulos permitidos alterados",
};

export function AdminAudit({ records }: { records: AdminAuditRecord[] }) {
  // Start after hydration so server/client clocks cannot change the initial markup.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <section className="rounded-md border bg-card p-5" aria-label="Auditoria administrativa">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Auditoria administrativa</h2>
        {records.length > 0 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="audit-recent-dot" aria-hidden="true" />
            Últimas 24 horas
          </p>
        )}
      </div>
      {records.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma alteração administrativa registrada.
        </p>
      ) : (
        <ul className="mt-4 divide-y">
          {records.map((record) => {
            const age = now === null ? -1 : now - Date.parse(record.created_at);
            const recent = age >= 0 && age < 86_400_000;
            return (
              <li key={record.id} className="flex gap-3 py-3 text-sm">
                <span className="flex w-2 shrink-0 pt-1.5" aria-hidden="true">
                  {recent && <span className="audit-recent-dot" />}
                </span>
                <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  <p className="font-medium">
                    {recent && <span className="sr-only">Alteração nas últimas 24 horas. </span>}
                    {auditLabels[record.action] ?? record.action}
                    {record.target_name !== "—" ? ` · ${record.target_name}` : ""}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    por {record.actor_name} em {formatDate(record.created_at)}
                    {record.old_value || record.new_value
                      ? ` · de ${JSON.stringify(record.old_value ?? null)} para ${JSON.stringify(record.new_value ?? null)}`
                      : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
