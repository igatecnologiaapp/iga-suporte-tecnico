import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(new URL("../../package.json", import.meta.url));
const ts = require("typescript");
const pure = require("./src/lib/password-recovery.ts");
const source = ts.transpileModule(
  readFileSync(new URL("../../src/lib/password-recovery.server.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const exports = {};
vm.runInNewContext(source, {
  exports,
  require: (name) => (name === "./password-recovery" ? pure : require(name)),
});
function setup(options = {}) {
  const events = [];
  const admin = {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async single() {
          return {
            error: options.readFailure === table,
            data: {
              profiles: { id: "target" },
              user_roles: { role: options.role || "viewer" },
              primary_admin: { user_id: options.primary || "primary" },
            }[table],
          };
        },
        async insert(row) {
          events.push(row);
          return { error: options.auditFailure === events.length };
        },
      };
    },
    auth: {
      admin: {
        async getUserById() {
          return {
            error: false,
            data: {
              user: {
                id: "target",
                email: "fake@example.test",
                email_confirmed_at: options.unconfirmed ? null : "synthetic",
              },
            },
          };
        },
      },
      async resetPasswordForEmail(email, config) {
        events.push({ mail: true, email, config });
        if (options.throwMail) throw Error("sensitive");
        return { error: !!options.failMail, data: { action_link: "must-never-return" } };
      },
    },
  };
  return {
    events,
    run: () =>
      exports.requestAdministrativePasswordRecovery(admin, options.actor || "actor", "target", {
        supabaseUrl: "http://127.0.0.1:55421",
      }),
  };
}
for (const options of [
  { role: "admin" },
  { primary: "target" },
  { actor: "target" },
  { readFailure: "profiles" },
  { readFailure: "user_roles" },
  { readFailure: "primary_admin" },
  { unconfirmed: true },
])
  test(`denied before side effects ${JSON.stringify(options)}`, async () => {
    const f = setup(options);
    await assert.rejects(f.run());
    assert.equal(f.events.length, 0);
  });
test("intent audit failure prevents email", async () => {
  const f = setup({ auditFailure: 1 });
  await assert.rejects(f.run(), /Nenhum envio/);
  assert.equal(f.events.length, 1);
});
test("accepted mail is audited; result contains no link or Auth payload", async () => {
  const f = setup();
  const result = await f.run();
  assert.equal(JSON.stringify(result), '{"status":"requested","audit":"recorded"}');
  assert.equal(f.events[0].action, "password_reset_requested");
  assert.equal(f.events[1].config.redirectTo, "http://127.0.0.1:4180/reset-password");
  assert.equal(f.events[2].action, "password_reset_email_requested");
  assert.equal(f.events[0].new_value.request_id, f.events[2].new_value.request_id);
  assert.equal(JSON.stringify([f.events[0], f.events[2]]).includes("fake@example.test"), false);
});
for (const options of [{ failMail: true }, { throwMail: true }])
  test(`mail failure recorded ${JSON.stringify(options)}`, async () => {
    const f = setup(options);
    assert.equal((await f.run()).status, "failed");
    assert.equal(f.events[2].action, "password_reset_failed");
  });
test("completion audit failure does not resend or claim recorded", async () => {
  const f = setup({ auditFailure: 3 });
  const result = await f.run();
  assert.equal(result.status, "requested");
  assert.equal(result.audit, "pending");
  assert.equal(f.events.filter((e) => e.mail).length, 1);
});
test("principal may request recovery for another admin", async () => {
  assert.equal((await setup({ actor: "primary", role: "admin" }).run()).status, "requested");
});
