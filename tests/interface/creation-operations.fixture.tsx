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
    <div data-ready={ready}>
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
    </div>
  );
}
