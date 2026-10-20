import { test } from "node:test";
import assert from "node:assert/strict";
import { adminUserCreationSchema } from "../../src/lib/admin-user-creation.ts";
const operationId = "00000000-0000-4000-8000-000000000001";
const input = {
  operationId,
  fullName: " Fictional User ",
  email: " NEW@iga-test.example ",
  role: "viewer",
  status: "active",
  modules: ["tickets"],
};
test("creation normalizes a complete request before provisioning", () => {
  const value = adminUserCreationSchema.parse({
    ...input,
    phone: " ",
    modules: ["tickets", "companies", "tickets"],
  });
  assert.equal(value.fullName, "Fictional User");
  assert.equal(value.email, "new@iga-test.example");
  assert.equal(value.phone, null);
  assert.equal(value.technicianId, null);
  assert.equal(value.createTechnician, false);
  assert.deepEqual(value.modules, ["companies", "tickets"]);
});
test("creation rejects invalid identities, fields and enums", () => {
  for (const patch of [
    { operationId: "bad" },
    { fullName: " " },
    { email: "invalid" },
    { role: "primary" },
    { status: "enabled" },
    { modules: [] },
    { modules: ["unknown"] },
    { technicianId: "new" },
    { actorId: operationId },
    { actionLink: "synthetic" },
    { password: "must-not-accept" },
    { phone: "x".repeat(41) },
  ])
    assert.throws(() => adminUserCreationSchema.parse({ ...input, ...patch }));
});
test("technician selection has explicit mutually exclusive modes", () => {
  assert.throws(() => adminUserCreationSchema.parse({ ...input, createTechnician: true }));
  assert.throws(() =>
    adminUserCreationSchema.parse({
      ...input,
      role: "technician",
      createTechnician: true,
      technicianId: operationId,
    }),
  );
  for (const patch of [{ createTechnician: true }, { technicianId: operationId }, {}])
    assert.equal(
      adminUserCreationSchema.parse({ ...input, role: "technician", ...patch }).role,
      "technician",
    );
});
