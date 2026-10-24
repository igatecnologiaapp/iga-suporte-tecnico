import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
const repo = resolve(import.meta.dirname, "../..");
const require = createRequire(resolve(repo, "package.json"));
const ts = require("typescript");
const creation = require(resolve(repo, "src/lib/admin-user-creation.ts"));
const recovery = require(resolve(repo, "src/lib/password-recovery.ts"));
const source = ts.transpileModule(
  readFileSync(resolve(repo, "src/lib/admin-user-creation.server.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const exports = {};
vm.runInNewContext(source, {
  exports,
  require(name) {
    if (name === "./admin-user-creation") return creation;
    if (name === "./password-recovery") return recovery;
    return require(name);
  },
});
const operationId = "00000000-0000-4000-8000-000000000001",
  userId = "00000000-0000-4000-8000-000000000002";
const request = creation.adminUserCreationSchema.parse({
  operationId,
  fullName: "Fictional",
  email: "new@iga-test.example",
  role: "viewer",
  status: "active",
  modules: ["tickets"],
});
const config = { supabaseUrl: "http://127.0.0.1:55421" };
function setup(options = {}) {
  const calls = [];
  const { operationId: _, ...payload } = request;
  let op = {
    operationId,
    userId,
    payload,
    stage: options.provisioned ? "provisioned" : "reserved",
    deliveryState: options.deliveryState || "not_requested",
  };
  let user =
    options.existing || options.provisioned
      ? {
          id: userId,
          email: payload.email,
          app_metadata: { admin_creation_operation: options.wrongOwner ? "wrong" : operationId },
          email_confirmed_at: options.confirmed ? "synthetic" : null,
        }
      : null;
  const snapshot = () => JSON.parse(JSON.stringify(op));
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (options.rpcFailure === name)
        return { data: null, error: options.rpcError || { message: "synthetic failure" } };
      if (name === "provision_admin_user_creation") op.stage = "provisioned";
      if (name === "claim_admin_user_invitation") {
        if (options.claimBusy || (op.deliveryState !== "not_requested" && !args._resend))
          return { data: { claimed: false, state: snapshot() }, error: null };
        op.deliveryState = "sending";
        return { data: { claimed: true, state: snapshot() }, error: null };
      }
      if (name === "record_admin_user_invitation") op.deliveryState = args._outcome;
      return { data: snapshot(), error: null };
    },
  };
  const admin = {
    auth: {
      admin: {
        async getUserById() {
          calls.push({ name: "auth.read" });
          return {
            data: { user },
            error: options.readFailure ? { status: 500 } : user ? null : { status: 404 },
          };
        },
        async createUser(attributes) {
          calls.push({ name: "auth.create", attributes });
          if (!options.createFailure)
            user = {
              id: userId,
              email: payload.email,
              app_metadata: attributes.app_metadata,
              email_confirmed_at: null,
            };
          if (options.createTimeout) throw Error("sensitive timeout");
          return { data: { user }, error: options.createFailure ? { status: 500 } : null };
        },
        async inviteUserByEmail(email, settings) {
          calls.push({ name: "auth.invite", email, settings });
          assert.equal(op.stage, "provisioned");
          assert.equal(op.deliveryState, "sending");
          if (options.mailTimeout) throw Error("sensitive transport");
          return {
            data: { user: { id: options.wrongInvitationId ? "wrong" : userId } },
            error: options.mailStatus ? { status: options.mailStatus } : null,
          };
        },
      },
    },
  };
  return {
    calls,
    snapshot,
    create: (data = request, settings = config) =>
      exports.createAdministrativeUser(client, admin, data, settings),
    resume: () => exports.resumeAdministrativeUser(client, admin, operationId, config),
    send: (resend) => exports.deliverCreationInvitation(client, admin, operationId, config, resend),
  };
}
test("creation validates all input and redirect before reservation or Auth", async () => {
  const f = setup();
  await assert.rejects(f.create({ ...request, role: "root" }));
  await assert.rejects(f.create(request, {}));
  assert.equal(f.calls.length, 0);
});
test("reservation failure does not create or invite", async () => {
  const f = setup({ rpcFailure: "reserve_admin_user_creation" });
  await assert.rejects(f.create());
  assert.equal(
    f.calls.some((c) => c.name.startsWith("auth.")),
    false,
  );
});
test("complete creation uses reserved UUID, server provenance and post-provision invitation", async () => {
  const f = setup();
  const result = await f.create();
  assert.equal(result.status, "provisioned");
  assert.equal(result.invitation, "accepted");
  const created = f.calls.find((c) => c.name === "auth.create");
  assert.equal(created.attributes.id, userId);
  assert.equal(created.attributes.email_confirm, false);
  assert.equal(created.attributes.app_metadata.admin_creation_operation, operationId);
  assert.ok(
    f.calls.findIndex((c) => c.name === "provision_admin_user_creation") <
      f.calls.findIndex((c) => c.name === "auth.invite"),
  );
  assert.equal(
    f.calls.find((c) => c.name === "auth.invite").settings.redirectTo,
    "http://127.0.0.1:4180/reset-password",
  );
  assert.deepEqual(Object.keys(result).sort(), [
    "deliveryAttempted",
    "invitation",
    "operationId",
    "status",
    "userId",
  ]);
  assert.equal(JSON.stringify(result).includes(created.attributes.password), false);
});
for (const options of [
  { createFailure: true },
  { createTimeout: true },
  { rpcFailure: "provision_admin_user_creation" },
  { existing: true, wrongOwner: true },
])
  test(`provision interruption remains pending without invitation ${JSON.stringify(options)}`, async () => {
    const f = setup(options);
    assert.equal((await f.create()).status, "pending");
    assert.equal(
      f.calls.some((c) => c.name === "auth.invite"),
      false,
    );
  });
test("ambiguous creation can resume same owned UUID without another create", async () => {
  const f = setup({ createTimeout: true });
  assert.equal((await f.create()).status, "pending");
  assert.equal((await f.resume()).status, "provisioned");
  assert.equal(f.calls.filter((c) => c.name === "auth.create").length, 1);
});
test("owned existing identity is resumed, never recreated", async () => {
  const f = setup({ existing: true });
  assert.equal((await f.create()).invitation, "accepted");
  assert.equal(
    f.calls.some((c) => c.name === "auth.create"),
    false,
  );
});
for (const options of [{ rpcFailure: "claim_admin_user_invitation" }, { claimBusy: true }])
  test(`no email without durable claim ${JSON.stringify(options)}`, async () => {
    const f = setup(options);
    await f.create();
    assert.equal(
      f.calls.some((c) => c.name === "auth.invite"),
      false,
    );
  });
for (const [options, outcome] of [
  [{ mailStatus: 429 }, "failed"],
  [{ mailStatus: 500 }, "unknown"],
  [{ mailTimeout: true }, "unknown"],
  [{ wrongInvitationId: true }, "unknown"],
])
  test(`delivery outcome does not undo provision ${outcome} ${JSON.stringify(options)}`, async () => {
    const f = setup(options);
    const result = await f.create();
    assert.equal(result.status, "provisioned");
    assert.equal(result.invitation, outcome);
  });
test("audit/result failure returns unknown; another creation request does not resend", async () => {
  const f = setup({ rpcFailure: "record_admin_user_invitation" });
  assert.equal((await f.create()).invitation, "unknown");
  await f.create();
  assert.equal(f.calls.filter((c) => c.name === "auth.invite").length, 1);
});
test("completed creation repetition never resets profile or reissues invitation", async () => {
  const f = setup({ provisioned: true, deliveryState: "accepted" });
  assert.equal((await f.create()).invitation, "accepted");
  assert.equal(
    f.calls.some((c) =>
      ["auth.create", "auth.invite", "provision_admin_user_creation"].includes(c.name),
    ),
    false,
  );
});
test("explicit resend is a delivery operation only", async () => {
  const f = setup({ provisioned: true, deliveryState: "failed" });
  assert.equal((await f.send(true)).invitation, "accepted");
  assert.equal(
    f.calls.some((c) => ["auth.create", "provision_admin_user_creation"].includes(c.name)),
    false,
  );
});
test("confirmed account skips invitation and records activation", async () => {
  const f = setup({ provisioned: true, confirmed: true });
  assert.equal((await f.send(true)).invitation, "activated");
  assert.equal(
    f.calls.some((c) => c.name === "auth.invite"),
    false,
  );
});

test("Auth read failure does not trigger creation or delivery", async () => {
  const f = setup({ readFailure: true });
  assert.equal((await f.create()).status, "pending");
  assert.equal(
    f.calls.some((call) => ["auth.create", "auth.invite"].includes(call.name)),
    false,
  );
});

test("cached accepted delivery is explicit about no new attempt", async () => {
  const f = setup({ provisioned: true, deliveryState: "accepted", claimBusy: true });
  const result = await f.send(true);
  assert.equal(result.invitation, "accepted");
  assert.equal(result.deliveryAttempted, false);
  assert.equal(
    f.calls.some((call) => call.name === "auth.invite"),
    false,
  );
});

test("known duplicate-email refusal is clear and stops before all Auth requests", async () => {
  const f = setup({
    rpcFailure: "reserve_admin_user_creation",
    rpcError: { code: "22023", message: "E-mail já cadastrado ou com operação pendente." },
  });
  await assert.rejects(
    f.create(),
    (error) =>
      /Este e-mail já está cadastrado/.test(error.message) && !/retome/i.test(error.message),
  );
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, "reserve_admin_user_creation");
});
test("unknown SQL/provider messages remain sanitized", async () => {
  for (const rpcError of [
    { code: "XX001", message: "synthetic-sensitive-token" },
    { code: "22023", message: "synthetic-sensitive-token" },
    "synthetic-sensitive-token",
  ]) {
    const f = setup({ rpcFailure: "reserve_admin_user_creation", rpcError });
    await assert.rejects(
      f.create(),
      (error) =>
        /Não foi possível confirmar/.test(error.message) &&
        !error.message.includes("synthetic-sensitive-token"),
    );
    assert.equal(f.calls.length, 1);
  }
});
