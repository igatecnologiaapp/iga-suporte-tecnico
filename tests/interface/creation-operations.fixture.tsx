import { AdminAudit } from "../../src/components/iga/AdminAudit";
import { Input } from "../../src/components/ui/input";
import { Label } from "../../src/components/ui/label";
import { useEffect, useState } from "react";
import { AdminCreationOperations } from "../../src/components/iga/AdminCreationOperations";
import { adminUserCreationSchema, type CreationOperation } from "../../src/lib/admin-user-creation";
const payload = adminUserCreationSchema.parse({
  operationId: "00000000-0000-4000-8000-000000000001",
  fullName: "Fictional Pending",
  email: "pending@iga-test.example",
  role: "viewer",
  status: "active",
  modules: ["tickets"],
});
const operations: CreationOperation[] = [
  {
    operationId: "pending",
    userId: "pending",
    payload,
    stage: "reserved",
    deliveryState: "not_requested",
  },
  {
    operationId: "failed",
    userId: "failed",
    payload: { ...payload, fullName: "Fictional Delivery", email: "delivery@iga-test.example" },
    stage: "provisioned",
    deliveryState: "unknown",
  },
  {
    operationId: "confirmed",
    userId: "confirmed",
    payload: { ...payload, fullName: "Fictional Confirmed", email: "confirmed@iga-test.example" },
    stage: "provisioned",
    deliveryState: "activated",
  },
];
export function Fixture() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  return (
    <div data-ready={ready} className="mx-auto max-w-4xl space-y-6 p-4">
      <AdminCreationOperations
        operations={operations}
        busyId={busyId}
        onResume={(id) => {
          document.documentElement.dataset.action = `resume:${id}`;
          setBusyId(id);
        }}
        onResend={(id) => {
          document.documentElement.dataset.action = `resend:${id}`;
          setBusyId(id);
        }}
      />
      <AdminAudit
        records={[
          {
            id: "recent",
            action: "modules_changed",
            actor_name: "Administrador de teste",
            target_name: "Conta de teste recente",
            created_at: new Date(Date.now() - 300_000).toISOString(),
            old_value: { modules: ["tickets"] },
            new_value: { modules: ["tickets", "contacts"] },
          },
          {
            id: "old",
            action: "user_updated",
            actor_name: "Administrador de teste",
            target_name: "Conta de teste anterior",
            created_at: "2020-01-01T12:00:00Z",
            new_value: {
              email: "long-fictitious-address-for-mobile-overflow-check@iga-test.example",
            },
          },
        ]}
      />
      <section className="rounded-md border bg-card p-5">
        <Label htmlFor="sample-name">Nome</Label>
        <Input id="sample-name" placeholder="Nome do usuário" />
        <Label htmlFor="sample-role">Perfil de acesso</Label>
        <select id="sample-role" className="form-control">
          <option>Visualização</option>
        </select>
      </section>
    </div>
  );
}
