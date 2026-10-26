import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
const root = resolve(import.meta.dirname, "../.."),
  require = createRequire(resolve(root, "package.json")),
  ts = require("typescript");
const uid = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function setup(file, options = {}) {
  const calls = [];
  const profiles = Array.from({ length: 12 }, (_, i) => ({
    id: uid(i + 1),
    full_name: `Person ${i + 1}`,
    phone: null,
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
  }));
  const events = Array.from({ length: 25 }, (_, i) => ({
    id: uid(i + 1),
    provider: "whatsapp",
    created_at: new Date(Date.UTC(2026, 0, 25 - i)).toISOString(),
    event_type: "message",
    result: "processed",
    external_id: `synthetic-${i + 1}`,
    error_message: null,
  }));
  const admin = {
    from(table) {
      let head = false,
        range = null,
        limit = null;
      const predicates = [];
      const query = {
        select(_fields, settings) {
          head = !!settings?.head;
          return query;
        },
        eq(key, value) {
          predicates.push((row) => row[key] === value);
          return query;
        },
        in(key, values) {
          predicates.push((row) => values.includes(row[key]));
          calls.push({ table, ids: values });
          return query;
        },
        order(key) {
          calls.push({ table, order: key });
          return query;
        },
        not() {
          return query;
        },
        range(from, to) {
          range = [from, to];
          calls.push({ table, range });
          return query;
        },
        limit(value) {
          limit = value;
          return query;
        },
        maybeSingle() {
          return query.then((result) => ({ ...result, data: result.data?.[0] ?? null }));
        },
        then(resolve) {
          let rows = (
            {
              profiles,
              user_roles: profiles.map((profile) => ({ user_id: profile.id, role: "viewer" })),
              technicians: [],
              user_modules: profiles.map((profile) => ({ user_id: profile.id, module: "tickets" })),
              primary_admin: [{ user_id: uid(1) }],
              integration_events: events,
              messages: [],
            }[table] ?? []
          ).filter((row) => predicates.every((predicate) => predicate(row)));
          const count = rows.length;
          if (range) rows = rows.slice(range[0], range[1] + 1);
          if (limit !== null) rows = rows.slice(0, limit);
          return Promise.resolve({
            data: head ? null : rows,
            count,
            error:
              options.queryError && table === "profiles"
                ? { message: "synthetic-private-error" }
                : null,
          }).then(resolve);
        },
      };
      return query;
    },
    auth: {
      admin: {
        listUsers() {
          throw new Error("Bulk Auth listing must never be used");
        },
        async getUserById(id) {
          calls.push({ auth: id });
          return {
            data: { user: { id, email: `${id}@iga-test.example`, last_sign_in_at: null } },
            error: options.authError ? { message: "synthetic-private-error" } : null,
          };
        },
      },
    },
  };
  const exports = {};
  const source = ts.transpileModule(readFileSync(resolve(root, "src/lib", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    process: { env: {} },
    require(name) {
      if (name === "@tanstack/react-start")
        return {
          createServerFn() {
            let validator = (value) => value;
            return {
              middleware() {
                return this;
              },
              inputValidator(fn) {
                validator = fn;
                return this;
              },
              handler(fn) {
                return (request) => fn({ ...request, data: validator(request.data) });
              },
            };
          },
        };
      if (name === "@/integrations/supabase/auth-middleware") return { requireSupabaseAuth: {} };
      if (name === "@/integrations/supabase/client.server") return { supabaseAdmin: admin };
      if (name.startsWith("./")) return require(resolve(root, "src/lib", name + ".ts"));
      return require(name);
    },
  });
  const context = {
    userId: uid(1),
    supabase: {
      async rpc() {
        return { data: !options.denied, error: null };
      },
    },
  };
  return { calls, context, exports };
}
test("admin user listing fetches only requested profiles and their Auth identities", async () => {
  const f = setup("admin-users.functions.ts");
  const result = await f.exports.listAdminUsers({
    data: { page: 2, pageSize: 5 },
    context: f.context,
  });
  assert.equal(result.rows.length, 5);
  assert.equal(result.total, 12);
  assert.equal(result.page, 2);
  assert.deepEqual(
    f.calls.filter((call) => call.auth).map((call) => call.auth),
    [6, 7, 8, 9, 10].map(uid),
  );
  assert.ok(f.calls.some((call) => call.table === "profiles" && String(call.range) === "5,9"));
  assert.ok(f.calls.filter((call) => call.ids).every((call) => call.ids.length === 5));
});
test("admin list bounds pages and rejects Auth lookup errors without partial data", async () => {
  const f = setup("admin-users.functions.ts");
  const result = await f.exports.listAdminUsers({
    data: { page: 99, pageSize: 5 },
    context: f.context,
  });
  assert.equal(result.page, 3);
  assert.equal(result.rows.length, 2);
  const bad = setup("admin-users.functions.ts", { authError: true });
  await assert.rejects(
    bad.exports.listAdminUsers({ data: { page: 1, pageSize: 5 }, context: bad.context }),
    /Não foi possível conferir/,
  );
});
test("admin list rejects invalid limits and unauthorized callers before profile queries", async () => {
  const f = setup("admin-users.functions.ts");
  assert.throws(() =>
    f.exports.listAdminUsers({ data: { page: 1, pageSize: 500 }, context: f.context }),
  );
  assert.equal(f.calls.length, 0);
  const bad = setup("admin-users.functions.ts", { denied: true });
  await assert.rejects(
    bad.exports.listAdminUsers({ data: { page: 1, pageSize: 5 }, context: bad.context }),
    /Apenas administradores/,
  );
  assert.equal(bad.calls.length, 0);
});
test("integration log pages preserve the twenty-event scope and latest event summary", async () => {
  const f = setup("whatsapp.functions.ts");
  const result = await f.exports.getWhatsAppStatus({
    data: { page: 3, pageSize: 5 },
    context: f.context,
  });
  assert.equal(result.events.length, 5);
  assert.equal(result.eventsTotal, 20);
  assert.equal(result.eventsPage, 3);
  assert.equal(result.events[0].external_id, "synthetic-11");
  assert.equal(result.lastEvent.external_id, "synthetic-1");
  assert.ok(
    f.calls.some((call) => call.table === "integration_events" && String(call.range) === "10,14"),
  );
});
test("integration paging remains admin-only and validates input before data access", async () => {
  const f = setup("whatsapp.functions.ts", { denied: true });
  await assert.rejects(
    f.exports.getWhatsAppStatus({ data: { page: 1, pageSize: 5 }, context: f.context }),
    /Apenas Administrador/,
  );
  assert.equal(f.calls.length, 0);
  const invalid = setup("whatsapp.functions.ts");
  assert.throws(() =>
    invalid.exports.getWhatsAppStatus({
      data: { page: -1, pageSize: 5 },
      context: invalid.context,
    }),
  );
  assert.equal(invalid.calls.length, 0);
});
