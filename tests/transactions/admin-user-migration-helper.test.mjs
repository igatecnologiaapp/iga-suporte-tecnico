import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";

const repo = resolve(import.meta.dirname, "../..");
const require = createRequire(resolve(repo, "package.json"));
const ts = require("typescript");
const directory = resolve(repo, "tests/homologation");
const source = ts.transpileModule(
  readFileSync(resolve(directory, "apply-admin-atomic.mjs"), "utf8").replaceAll(
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
const migration = readFileSync(
  resolve(repo, "drizzle/migrations/0020_atomic_admin_user_update.sql"),
  "utf8",
);
const body = migration.match(/AS \$\$([\s\S]*?)\$\$;/)[1];

function run(options = {}) {
  const writes = [];
  let databaseCalls = 0;
  let evidence = 0;
  const exit = new Error("read-only exit");
  try {
    vm.runInNewContext(source, {
      exports: {},
      URL,
      console: { log() {} },
      process: {
        env: { IGA_HOMO_PRIVATE: "/tmp/iga-private-fixture" },
        argv: options.apply ? ["--apply"] : [],
        exit() {
          throw exit;
        },
      },
      require(name) {
        if (name === "node:fs")
          return {
            readFileSync(file) {
              if (file.endsWith("local-config.json"))
                return JSON.stringify({ API_URL: options.url || "http://127.0.0.1:55421" });
              if (file.endsWith("0020_atomic_admin_user_update.sql")) return migration;
              throw new Error("Unexpected file read");
            },
            writeFileSync() {
              evidence++;
            },
          };
        if (name === "node:child_process")
          return {
            execFileSync(command, args, callOptions) {
              assert.equal(command, "docker");
              if (args[0] === "inspect")
                return JSON.stringify([
                  {
                    Name: options.name || "/supabase_db_iga-service-homologation",
                    State: { Running: true },
                    NetworkSettings: {
                      Ports: {
                        "5432/tcp": [{ HostIp: options.host || "127.0.0.1", HostPort: "55422" }],
                      },
                    },
                  },
                ]);
              databaseCalls++;
              const input = callOptions.input;
              if (input === migration) {
                writes.push(input);
                return "CREATE FUNCTION\nREVOKE\nGRANT\nNOTIFY";
              }
              if (input.includes("'database'"))
                return JSON.stringify({
                  database: "postgres",
                  domain: true,
                  categories: true,
                  validator: true,
                });
              if (input.includes("FROM pg_proc"))
                return JSON.stringify(
                  options.existing
                    ? { body: options.badBody ? "different" : body, definer: true }
                    : null,
                );
              if (input.includes("has_function_privilege"))
                return JSON.stringify({
                  authenticated: true,
                  anon: options.badAcl || false,
                  service_role: false,
                });
              throw new Error("Unexpected SQL");
            },
          };
        return require(name);
      },
    });
    return { writes, databaseCalls, evidence };
  } catch (error) {
    return { writes, databaseCalls, evidence, error: error === exit ? undefined : error };
  }
}

test("migration helper checks without writing by default", () => {
  const result = run();
  assert.equal(result.error, undefined);
  assert.equal(result.writes.length, 0);
  assert.equal(result.evidence, 0);
});
test("migration helper applies exactly one transaction only with --apply", () => {
  const result = run({ apply: true });
  assert.equal(result.error, undefined);
  assert.equal(result.writes.length, 1);
  assert.equal(result.evidence, 1);
});
test("migration helper rejects remote API, wrong container and exposed database before SQL", () => {
  for (const options of [
    { url: "https://remote.example" },
    { name: "/other" },
    { host: "0.0.0.0" },
  ]) {
    const result = run({ ...options, apply: true });
    assert.ok(result.error);
    assert.equal(result.error.code, "ERR_ASSERTION");
    assert.equal(result.databaseCalls, 0);
    assert.equal(result.writes.length, 0);
  }
});
test("migration helper recognizes matching function without replaying migration", () => {
  const result = run({ apply: true, existing: true });
  assert.equal(result.error, undefined);
  assert.equal(result.writes.length, 0);
  assert.equal(result.evidence, 1);
});
test("migration helper rejects divergent body or unsafe existing grants", () => {
  for (const options of [{ badBody: true }, { badAcl: true }]) {
    const result = run({ apply: true, existing: true, ...options });
    assert.ok(result.error);
    assert.equal(result.error.code, "ERR_ASSERTION");
    assert.equal(result.databaseCalls, options.badBody ? 2 : 3);
    assert.equal(result.writes.length, 0);
    assert.equal(result.evidence, 0);
  }
});
