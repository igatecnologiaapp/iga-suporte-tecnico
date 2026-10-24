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
const original = readFileSync(
  resolve(repo, "drizzle/migrations/0021_admin_user_creation_operations.sql"),
  "utf8",
);
const patch = readFileSync(
  resolve(repo, "drizzle/migrations/0022_allow_auth_creation_metadata_initialization.sql"),
  "utf8",
);
const body = patch.match(/AS \$\$([\s\S]*?)\$\$;/)[1];
const functions = [
  ...original.matchAll(
    /CREATE FUNCTION public\.(\w+)\([\s\S]*?\n(?:LANGUAGE[\s\S]*?)AS \$\$([\s\S]*?)\$\$;/g,
  ),
].map((m) => ({ name: m[1], body: m[2], definer: m[0].includes("SECURITY DEFINER") }));
const source = ts.transpileModule(
  readFileSync(resolve(directory, "apply-auth-creation-initialization.mjs"), "utf8").replaceAll(
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
    queries = 0;
  let error;
  const exit = new Error("expected exit");
  try {
    vm.runInNewContext(source, {
      exports: {},
      URL,
      console: { log() {} },
      process: {
        env: { IGA_HOMO_PRIVATE: "/tmp/iga-authinit-private" },
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
              return path.endsWith("0022_allow_auth_creation_metadata_initialization.sql")
                ? patch
                : original;
            },
            writeFileSync(path, value, flags) {
              assert.equal(flags.mode, 0o600);
              assert.ok(path.startsWith("/tmp/iga-authinit-private/"));
              evidence++;
            },
          };
        if (name === "node:child_process")
          return {
            execFileSync(command, args, settings) {
              assert.equal(command, "docker");
              if (args[0] === "inspect")
                return JSON.stringify([
                  {
                    Name: "/supabase_db_iga-service-homologation",
                    State: { Running: !options.stopped },
                    NetworkSettings: {
                      Ports: {
                        "5432/tcp": [
                          { HostIp: options.exposed ? "0.0.0.0" : "127.0.0.1", HostPort: "55422" },
                        ],
                      },
                    },
                  },
                ]);
              queries++;
              assert.ok(args.includes("--single-transaction"));
              assert.ok(args.includes("ON_ERROR_STOP=1"));
              const query = settings.input;
              if (query === patch) {
                applied++;
                return "";
              }
              if (query.includes("'database'"))
                return JSON.stringify({
                  database: "postgres",
                  atomic_update: !options.missingPrerequisite,
                  app_metadata: true,
                });
              if (query.includes("FROM pg_proc")) {
                const name = query.match(/p\.proname='(\w+)'/)[1],
                  fn = functions.find((f) => f.name === name);
                return JSON.stringify([
                  {
                    body: options.drift
                      ? "unreviewed"
                      : name === "guard_admin_creation_auth_identity" &&
                          (options.patched || applied)
                        ? body
                        : fn.body,
                    definer: fn.definer,
                    anon: !!options.publicAccess,
                    service: false,
                    authenticated: [
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
                  auth_binding: !options.wrongTrigger,
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
  return { applied, evidence, queries, error };
}
test("0022 helper defaults to read-only isolation and reviewed-version checks", () => {
  const r = run();
  assert.equal(r.error, undefined);
  assert.equal(r.applied, 0);
  assert.equal(r.evidence, 0);
});
test("0022 helper applies one transaction, verifies patch and stores only private evidence", () => {
  const r = run({ apply: true });
  assert.equal(r.error, undefined);
  assert.equal(r.applied, 1);
  assert.equal(r.evidence, 1);
});
test("0022 helper recognizes matching installed patch without replacement", () => {
  const r = run({ patched: true, apply: true });
  assert.equal(r.error, undefined);
  assert.equal(r.applied, 0);
  assert.equal(r.evidence, 1);
});
for (const options of [
  { remote: true },
  { exposed: true },
  { stopped: true },
  { missingPrerequisite: true },
  { drift: true },
  { publicAccess: true },
  { missingGuard: true },
  { wrongTrigger: true },
])
  test(`0022 refuses unsafe or different installation ${JSON.stringify(options)}`, () => {
    const r = run({ ...options, apply: true });
    assert.ok(r.error);
    assert.equal(r.applied, 0);
    assert.equal(r.evidence, 0);
  });
