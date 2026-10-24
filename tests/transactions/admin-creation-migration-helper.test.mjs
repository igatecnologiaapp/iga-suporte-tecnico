import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
const repo = resolve(import.meta.dirname, "../.."),
  directory = resolve(repo, "tests/homologation");
const require = createRequire(resolve(repo, "package.json")),
  ts = require("typescript");
const migration = readFileSync(
  resolve(repo, "drizzle/migrations/0021_admin_user_creation_operations.sql"),
  "utf8",
);
const patch = readFileSync(
  resolve(repo, "drizzle/migrations/0022_allow_auth_creation_metadata_initialization.sql"),
  "utf8",
);
const patchBody = patch.match(/AS \$\$([\s\S]*?)\$\$;/)[1];
const functions = [
  ...migration.matchAll(
    /CREATE FUNCTION public\.(\w+)\([\s\S]*?\n(?:LANGUAGE[\s\S]*?)AS \$\$([\s\S]*?)\$\$;/g,
  ),
].map((m) => ({ name: m[1], body: m[2], definer: m[0].includes("SECURITY DEFINER") }));
const source = ts.transpileModule(
  readFileSync(resolve(directory, "apply-admin-creation.mjs"), "utf8").replaceAll(
    "import.meta.dirname",
    JSON.stringify(directory),
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
function run(options = {}) {
  let applied = 0,
    evidence = 0,
    inspections = 0;
  const exit = new Error("expected read-only exit");
  let error;
  try {
    vm.runInNewContext(source, {
      exports: {},
      URL,
      console: { log() {} },
      process: {
        env: { IGA_HOMO_PRIVATE: "/tmp/iga-private-creation" },
        argv: options.apply ? ["--apply"] : [],
        exit() {
          throw exit;
        },
      },
      require(name) {
        if (name === "node:fs")
          return {
            readFileSync(path) {
              if (path.endsWith("local-config.json"))
                return JSON.stringify({
                  API_URL: options.remote
                    ? "https://remote.example.test"
                    : "http://127.0.0.1:55421",
                });
              if (path.endsWith("0022_allow_auth_creation_metadata_initialization.sql"))
                return patch;
              return migration;
            },
            writeFileSync(_path, _value, flags) {
              assert.equal(flags.mode, 0o600);
              evidence++;
            },
          };
        if (name === "node:child_process")
          return {
            execFileSync(command, args, settings) {
              assert.equal(command, "docker");
              if (args[0] === "inspect") {
                inspections++;
                return JSON.stringify([
                  {
                    Name: "/supabase_db_iga-service-homologation",
                    State: { Running: true },
                    NetworkSettings: {
                      Ports: {
                        "5432/tcp": [
                          { HostIp: options.exposed ? "0.0.0.0" : "127.0.0.1", HostPort: "55422" },
                        ],
                      },
                    },
                  },
                ]);
              }
              assert.ok(args.includes("--single-transaction"));
              assert.ok(args.includes("ON_ERROR_STOP=1"));
              const query = settings.input;
              if (query === migration) {
                applied++;
                return "";
              }
              if (query.includes("'database'"))
                return JSON.stringify({
                  database: "postgres",
                  atomic_update: true,
                  app_metadata: true,
                });
              if (query.includes("'present'"))
                return JSON.stringify({ present: !!options.present });
              if (query.includes("FROM pg_proc")) {
                const name = query.match(/p\.proname='(\w+)'/)[1],
                  fn = functions.find((f) => f.name === name);
                return JSON.stringify([
                  {
                    body: options.drift
                      ? "changed"
                      : options.patched && name === "guard_admin_creation_auth_identity"
                        ? patchBody
                        : fn.body,
                    definer: fn.definer,
                    public_access: !!options.publicAccess,
                    service_access: false,
                    authenticated_access: [
                      "reserve_admin_user_creation",
                      "provision_admin_user_creation",
                      "claim_admin_user_invitation",
                      "record_admin_user_invitation",
                      "list_admin_user_creations",
                      "get_admin_user_creation",
                    ].includes(name),
                  },
                ]);
              }
              if (query.includes("'rls'"))
                return JSON.stringify({
                  rls: true,
                  authenticated_read: false,
                  service_insert: false,
                  guards: options.missingGuard ? 4 : 5,
                });
              throw Error("Unexpected SQL");
            },
          };
        return require(name);
      },
    });
  } catch (caught) {
    if (caught !== exit) error = caught;
  }
  return { applied, evidence, inspections, error };
}
test("creation migration helper defaults to local read-only preflight", () => {
  assert.equal(functions.length, 11);
  const r = run();
  assert.equal(r.error, undefined);
  assert.equal(r.applied, 0);
  assert.equal(r.evidence, 0);
});
test("creation migration helper applies one transaction and checks all definitions", () => {
  const r = run({ apply: true });
  assert.equal(r.error, undefined);
  assert.equal(r.applied, 1);
  assert.equal(r.evidence, 1);
});
test("matching installed migration is verified without applying again", () => {
  const r = run({ present: true, apply: true });
  assert.equal(r.error, undefined);
  assert.equal(r.applied, 0);
  assert.equal(r.evidence, 1);
});
for (const options of [{ remote: true }, { exposed: true }])
  test(`migration refuses unsafe destination ${JSON.stringify(options)}`, () => {
    const r = run({ ...options, apply: true });
    assert.ok(r.error);
    assert.equal(r.applied, 0);
    assert.equal(r.evidence, 0);
  });
for (const options of [{ drift: true }, { publicAccess: true }, { missingGuard: true }])
  test(`installed migration mismatch is never overwritten ${JSON.stringify(options)}`, () => {
    const r = run({ ...options, present: true, apply: true });
    assert.ok(r.error);
    assert.equal(r.applied, 0);
    assert.equal(r.evidence, 0);
  });

test("0021 verification accepts the exact reviewed 0022 guard without reapplying", () => {
  const r = run({ present: true, patched: true, apply: true });
  assert.equal(r.error, undefined);
  assert.equal(r.applied, 0);
  assert.equal(r.evidence, 1);
});
