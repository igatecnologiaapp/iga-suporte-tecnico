import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canRequestPasswordRecovery,
  passwordRecoveryRequestSchema,
  passwordRecoveryRedirect,
  initializePasswordResetSession,
  shouldDetectSharedAuthCallback,
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
const grant = (type = "recovery") =>
  `http://127.0.0.1:4180/reset-password#access_token=synthetic-access&refresh_token=synthetic-refresh&token_type=bearer&type=${type}`;
function authFixture(
  options: {
    setError?: boolean;
    verifyError?: boolean;
    mismatch?: boolean;
    changedUser?: boolean;
    updateError?: unknown;
    updateThrow?: boolean;
  } = {},
) {
  const calls: { action: string; scope?: string }[] = [];
  let reads = 0;
  const auth = {
    async setSession() {
      calls.push({ action: "set" });
      return {
        data: { session: options.setError ? null : { user: { id: "invited" } } },
        error: options.setError,
      };
    },
    async getUser() {
      calls.push({ action: "verify" });
      reads++;
      return {
        data: {
          user: {
            id: options.mismatch || (options.changedUser && reads > 1) ? "primary" : "invited",
            email: "invited@iga-test.example",
          },
        },
        error: options.verifyError,
      };
    },
    async updateUser() {
      calls.push({ action: "update" });
      if (options.updateThrow) throw Error("provider-secret");
      return { error: options.updateError };
    },
    async signOut(options: { scope: "local" }) {
      calls.push({ action: "logout", scope: options.scope });
      return { error: null };
    },
  };
  return { auth, calls };
}
test("shared login skips reset callbacks while preserving ordinary auth routes", () => {
  for (const path of ["/reset-password", "/reset-password/"])
    assert.equal(shouldDetectSharedAuthCallback(path), false);
  for (const path of ["/auth", "/tickets", "/"])
    assert.equal(shouldDetectSharedAuthCallback(path), true);
});
test("missing, invalid or ambiguous callbacks never open an Auth client or use a stored login", async () => {
  for (const url of [
    "http://127.0.0.1:4180/reset-password",
    "http://127.0.0.1:4180/reset-password#error=access_denied&error_code=otp_expired",
    grant() + "&error=expired",
    grant().replace("#", "?error=expired#"),
    grant("signup"),
    grant().replace("reset-password", "auth"),
    grant() + "&access_token=another",
    grant().replace("refresh_token=synthetic-refresh&", ""),
    grant().replace("bearer", "other"),
  ]) {
    let opened = 0;
    await assert.rejects(
      initializePasswordResetSession(url, () => {
        opened++;
        return authFixture().auth;
      }),
      /Link inválido/,
    );
    assert.equal(opened, 0);
  }
});
for (const type of ["invite", "recovery"])
  test(`valid ${type} verifies identity and updates only once`, async () => {
    const f = authFixture();
    const session = await initializePasswordResetSession(grant(type), () => f.auth);
    assert.equal(session.email, "invited@iga-test.example");
    await session.complete("synthetic-password");
    await assert.rejects(session.complete("another-password"), /Link inválido/);
    assert.equal(f.calls.filter((c) => c.action === "update").length, 1);
    assert.deepEqual(
      f.calls.filter((c) => c.action === "logout"),
      [{ action: "logout", scope: "local" }],
    );
  });
for (const options of [{ setError: true }, { verifyError: true }, { mismatch: true }])
  test(`invalid link session never falls back to primary ${JSON.stringify(options)}`, async () => {
    const f = authFixture(options);
    await assert.rejects(
      initializePasswordResetSession(grant(), () => f.auth),
      /Link inválido/,
    );
    assert.equal(
      f.calls.some((c) => c.action === "update"),
      false,
    );
  });
test("identity changing between validation and save cannot receive the password", async () => {
  const f = authFixture({ changedUser: true });
  const session = await initializePasswordResetSession(grant(), () => f.auth);
  await assert.rejects(session.complete("synthetic-password"), /Link inválido/);
  assert.equal(
    f.calls.some((c) => c.action === "update"),
    false,
  );
});
test("short password and sanitized update failure do not announce success", async () => {
  const f = authFixture();
  const session = await initializePasswordResetSession(grant(), () => f.auth);
  await assert.rejects(session.complete("short"), /8 caracteres/);
  assert.equal(
    f.calls.some((c) => c.action === "update"),
    false,
  );
  for (const options of [{ updateError: true }, { updateThrow: true }]) {
    const failed = authFixture(options);
    const context = await initializePasswordResetSession(grant(), () => failed.auth);
    await assert.rejects(context.complete("synthetic-password"), /Não foi possível atualizar/);
    assert.equal(
      failed.calls.some((c) => c.action === "logout"),
      false,
    );
  }
});

test("same-password code gives safe guidance and allows retry in the isolated session", async () => {
  const f = authFixture({ updateError: { code: "same_password", message: "provider-secret" } });
  const session = await initializePasswordResetSession(grant(), () => f.auth);
  await assert.rejects(session.complete("synthetic-password"), /diferente da senha atual/);
  assert.equal(
    f.calls.some((c) => c.action === "logout"),
    false,
  );
  f.auth.updateUser = async () => ({ error: null });
  await session.complete("different-synthetic-password");
  assert.equal(f.calls.filter((c) => c.action === "logout").length, 1);
});
test("provider message alone never bypasses sanitized error handling", async () => {
  const f = authFixture({ updateError: { message: "same_password provider-secret" } });
  const session = await initializePasswordResetSession(grant(), () => f.auth);
  await assert.rejects(session.complete("synthetic-password"), (error: Error) => {
    assert.match(error.message, /Não foi possível atualizar/);
    assert.doesNotMatch(error.message, /provider-secret|same_password/);
    return true;
  });
});
