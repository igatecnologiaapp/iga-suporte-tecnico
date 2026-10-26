import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";

const repo = resolve(import.meta.dirname, "../..");
const require = createRequire(resolve(repo, "package.json"));
const ts = require("typescript");
const helper = require(resolve(repo, "src/lib/admin-user-update.ts"));
const source = ts.transpileModule(
  readFileSync(resolve(repo, "src/lib/admin-users.functions.ts"), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
const primary = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const target = "00000000-0000-4000-8000-000000000003";

function setup(options = {}) {
  const calls = [];
  const admin = {
    from(table) {
      const query = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single() {
          return this.execute();
        },
        maybeSingle() {
          return this.execute();
        },
        then(resolve, reject) {
          return this.execute().then(resolve, reject);
        },
        async execute() {
          if (options.readFailure === table)
            return { data: null, error: { message: "Synthetic read failure" } };
          return {
            error: null,
            data: {
              profiles: { id: target },
              user_roles: { role: "viewer" },
              user_modules: [{ module: "tickets" }],
              primary_admin: { user_id: primary },
            }[table],
          };
        },
      };
      // Deliberately no insert/update/delete/upsert methods: preflight must be read-only.
      return query;
    },
    async rpc() {
      return {
        data: options.primary === true,
        error: options.primaryError ? { message: "Synthetic principal read failure" } : null,
      };
    },
  };
  const caller = {
    async rpc(name, args) {
      if (name === "has_role") return { data: !options.denied, error: null };
      if (name === "has_module")
        return {
          data: true,
          error: options.moduleFailure ? { message: "Synthetic module read failure" } : null,
        };
      calls.push({ name, args });
      return options.rpcFailure
        ? { data: null, error: { message: "Synthetic transaction failure" } }
        : { data: { ok: true }, error: null };
    },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    process: { env: {} },
    require(name) {
      if (name === "./admin-user-creation.server")
        return {
          createAdministrativeUser: async (client, service, input) => {
            calls.push({
              kind: "create",
              sameClient: client === caller,
              sameService: service === admin,
              input,
            });
            return { status: "pending" };
          },
          resumeAdministrativeUser: async (_client, _service, operationId) => {
            calls.push({ kind: "resume", operationId });
            return { status: "pending" };
          },
          deliverCreationInvitation: async (_client, _service, operationId, _config, resend) => {
            calls.push({ kind: "resend", operationId, resend });
            return { status: "provisioned" };
          },
          listAdministrativeCreations: async () => {
            calls.push({ kind: "list" });
            return [];
          },
        };
      if (name === "./admin-user-creation")
        return require(resolve(repo, "src/lib/admin-user-creation.ts"));
      if (name === "./password-recovery.server")
        return {
          requestAdministrativePasswordRecovery: async (_admin, actorId, targetId) => {
            calls.push({ actorId, targetId });
            return { status: "requested", audit: "recorded" };
          },
        };
      if (name === "./password-recovery")
        return require(resolve(repo, "src/lib/password-recovery.ts"));
      if (name === "./list-pagination") return require(resolve(repo, "src/lib/list-pagination.ts"));
      if (name === "./admin-user-update") return helper;
      if (name === "@/integrations/supabase/auth-middleware") return { requireSupabaseAuth: {} };
      if (name === "@/integrations/supabase/client.server") return { supabaseAdmin: admin };
      if (name === "@tanstack/react-start")
        return {
          createServerFn() {
            let validate = (value) => value;
            return {
              middleware() {
                return this;
              },
              inputValidator(fn) {
                validate = fn;
                return this;
              },
              handler(fn) {
                return (request) => fn({ ...request, data: validate(request.data) });
              },
            };
          },
        };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return {
    calls,
    creation(action, data) {
      return exports[action]({
        data,
        context: { userId: options.primary ? primary : actor, supabase: caller },
      });
    },
    recover(data) {
      return exports.sendPasswordReset({ data, context: { userId: actor, supabase: caller } });
    },
    run(patch) {
      return exports.updateAdminUser({
        data: { userId: target, ...patch },
        context: { userId: options.primary ? primary : actor, supabase: caller },
      });
    },
  };
}

test("handler rejects mixed forbidden role/modules before any write RPC", async () => {
  for (const patch of [
    { fullName: "Changed", role: "admin" },
    { fullName: "Changed", modules: ["inbox"] },
  ]) {
    const fixture = setup();
    await assert.rejects(fixture.run(patch), /Principal/);
    assert.equal(fixture.calls.length, 0);
  }
});
test("handler validates raw input before contacting mutation RPC", async () => {
  const fixture = setup();
  await assert.rejects(async () => fixture.run({ role: "root" }));
  assert.equal(fixture.calls.length, 0);
});
for (const table of ["profiles", "user_roles", "user_modules", "primary_admin"])
  test(`handler fails closed on ${table} read failure`, async () => {
    const fixture = setup({ readFailure: table });
    await assert.rejects(fixture.run({ fullName: "Changed" }), /read failure/);
    assert.equal(fixture.calls.length, 0);
  });
test("handler fails closed even when module RPC returns truthy data with an error", async () => {
  const fixture = setup({ moduleFailure: true });
  await assert.rejects(fixture.run({ fullName: "Changed" }), /administradores/);
  assert.equal(fixture.calls.length, 0);
});
test("valid basic edit makes one authenticated RPC without an actor parameter", async () => {
  const fixture = setup();
  assert.equal((await fixture.run({ fullName: " Changed " })).ok, true);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].name, "update_admin_user_atomic");
  assert.equal(fixture.calls[0].args._target_id, target);
  assert.equal(fixture.calls[0].args._patch.fullName, "Changed");
  assert.deepEqual(Object.keys(fixture.calls[0].args).sort(), ["_patch", "_target_id"]);
});
test("transaction error is propagated without fallback individual writes", async () => {
  const fixture = setup({ rpcFailure: true });
  await assert.rejects(fixture.run({ fullName: "Changed" }), /transaction failure/);
  assert.equal(fixture.calls.length, 1);
});

for (const options of [{ denied: true }, { moduleFailure: true }])
  test(`recovery handler rejects unauthorized actor ${JSON.stringify(options)}`, async () => {
    const f = setup(options);
    await assert.rejects(f.recover({ userId: target }), /administradores/);
    assert.equal(f.calls.length, 0);
  });
test("recovery handler uses authenticated actor and UUID, rejects email/actor injection", async () => {
  const f = setup();
  for (const data of [{ email: "synthetic@example.test" }, { userId: target, actorId: primary }])
    await assert.rejects(async () => f.recover(data));
  assert.equal(f.calls.length, 0);
  assert.equal((await f.recover({ userId: target })).status, "requested");
  assert.equal(f.calls[0].actorId, actor);
  assert.equal(f.calls[0].targetId, target);
});

const creationInput = {
  operationId: target,
  fullName: "Synthetic",
  email: "new@iga-test.example",
  role: "viewer",
  status: "active",
  modules: ["tickets"],
};
for (const action of [
  "createAdminUser",
  "resumeAdminUserCreation",
  "resendAdminUserInvitation",
  "listAdminUserCreations",
])
  test(`creation endpoint ${action} requires principal`, async () => {
    const f = setup();
    await assert.rejects(
      f.creation(action, action === "createAdminUser" ? creationInput : { operationId: target }),
      /Principal/,
    );
    assert.equal(f.calls.length, 0);
  });
test("principal check fails closed on truthy result plus error", async () => {
  const f = setup({ primary: true, primaryError: true });
  await assert.rejects(f.creation("createAdminUser", creationInput), /Principal/);
  assert.equal(f.calls.length, 0);
});
test("creation endpoint validates raw input before touching Auth and forwards authenticated client", async () => {
  const f = setup({ primary: true });
  await assert.rejects(async () =>
    f.creation("createAdminUser", { ...creationInput, actorId: primary }),
  );
  assert.equal(f.calls.length, 0);
  await f.creation("createAdminUser", creationInput);
  assert.equal(f.calls[0].sameClient, true);
  assert.equal(f.calls[0].sameService, true);
  assert.equal(f.calls[0].input.operationId, target);
});
test("resume/resend accept only operation UUID and resend is explicit", async () => {
  const f = setup({ primary: true });
  await assert.rejects(async () =>
    f.creation("resumeAdminUserCreation", { operationId: target, email: "x@iga-test.example" }),
  );
  await f.creation("resumeAdminUserCreation", { operationId: target });
  await f.creation("resendAdminUserInvitation", { operationId: target });
  assert.equal(f.calls[0].operationId, target);
  assert.equal(f.calls[1].resend, true);
});
