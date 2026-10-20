import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canRequestPasswordRecovery,
  passwordRecoveryRequestSchema,
  passwordRecoveryRedirect,
  completePasswordRecovery,
} from "../../src/lib/password-recovery.ts";
const actor = { id: "actor", role: "admin", isPrimary: false };
for (const role of ["viewer", "technician", "supervisor", "admin"])
  test(`recovery authorization: ordinary admin / ${role}`, () => {
    assert.equal(
      canRequestPasswordRecovery(actor, { id: "other", role, isPrimary: false }),
      role !== "admin",
    );
    assert.equal(canRequestPasswordRecovery(actor, { id: "other", role, isPrimary: true }), false);
  });
test("primary can request other admin, never self; non-admin cannot request", () => {
  assert.equal(
    canRequestPasswordRecovery(
      { ...actor, isPrimary: true },
      { id: "other", role: "admin", isPrimary: false },
    ),
    true,
  );
  assert.equal(
    canRequestPasswordRecovery({ ...actor, isPrimary: true }, { ...actor, isPrimary: true }),
    false,
  );
  assert.equal(
    canRequestPasswordRecovery(
      { ...actor, role: "viewer" },
      { id: "other", role: "viewer", isPrimary: false },
    ),
    false,
  );
});
test("strict input accepts only target UUID", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(passwordRecoveryRequestSchema.parse({ userId }), { userId });
  for (const input of [
    { email: "fake@example.test" },
    { userId: "bad" },
    { userId, email: "fake@example.test" },
  ])
    assert.throws(() => passwordRecoveryRequestSchema.parse(input));
});
test("redirect is trusted configuration, with local-only fallback", () => {
  assert.equal(
    passwordRecoveryRedirect(undefined, "http://127.0.0.1:55421"),
    "http://127.0.0.1:4180/reset-password",
  );
  assert.equal(
    passwordRecoveryRedirect("https://app.example.test"),
    "https://app.example.test/reset-password",
  );
  for (const url of [
    undefined,
    "http://remote.example.test",
    "https://user:secret@app.example.test",
    "https://app.example.test/?x=1",
    "https://app.example.test/#token",
    "https://app.example.test/path",
  ])
    assert.throws(() => passwordRecoveryRedirect(url));
  assert.throws(() => passwordRecoveryRedirect(undefined, "https://remote.example.test"));
});
test("missing/expired session prevents password mutation and sanitizes provider errors", async () => {
  for (const getSession of [
    async () => ({ data: { session: null }, error: null }),
    async () => {
      throw Error("secret provider detail");
    },
  ]) {
    let calls = 0;
    await assert.rejects(
      completePasswordRecovery(
        {
          getSession,
          updateUser: async () => {
            calls++;
            return { error: null };
          },
        },
        "synthetic-password",
      ),
      /Link inválido/,
    );
    assert.equal(calls, 0);
  }
});
test("update success, rejected password and provider failure", async () => {
  const getSession = async () => ({ data: { session: {} }, error: null });
  let calls = 0;
  const updateUser = async () => {
    calls++;
    return { error: null };
  };
  await assert.rejects(
    completePasswordRecovery({ getSession, updateUser }, "short"),
    /8 caracteres/,
  );
  assert.equal(calls, 0);
  await completePasswordRecovery({ getSession, updateUser }, "synthetic-password");
  assert.equal(calls, 1);
  await assert.rejects(
    completePasswordRecovery(
      {
        getSession,
        updateUser: async () => {
          throw Error("secret provider detail");
        },
      },
      "synthetic-password",
    ),
    /Não foi possível atualizar/,
  );
});
