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
      return { data: options.primary === true, error: null };
    },
  };
  const caller = {
    async rpc(name, args) {
      if (name === "has_role") return { data: true, error: null };
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
    require(name) {
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
