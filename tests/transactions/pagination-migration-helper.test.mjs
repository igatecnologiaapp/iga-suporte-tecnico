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
  resolve(repo, "drizzle/migrations/0023_paginated_record_lists.sql"),
  "utf8",
);
const body = migration.match(/AS \$\$([\s\S]*?)\$\$;/)[1];
const source = ts.transpileModule(
  readFileSync(resolve(directory, "apply-pagination.mjs"), "utf8").replaceAll(
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
    inspected = 0,
    error = null;
  const exit = new Error("dry run exit");
  const collation = {
    icu: true,
    deterministic: false,
    locale: options.badCollation ? "wrong-locale" : "pt-u-kn-true-ks-level1",
  };
  try {
    vm.runInNewContext(source, {
      exports: {},
      URL,
      console: { log() {} },
      process: {
        env: { IGA_HOMO_PRIVATE: "/tmp/iga-pagination-private" },
        argv: options.apply ? ["--apply"] : [],
        exit() {
          throw exit;
        },
      },
      require(name) {
        if (name === "node:fs")
          return {
            realpathSync: (path) => path,
            readFileSync(path) {
              return path.endsWith("local-config.json")
                ? JSON.stringify({
                    API_URL: options.remote
                      ? "https://remote.example.test"
                      : "http://127.0.0.1:55421",
                  })
                : migration;
            },
            writeFileSync(_path, _data, flags) {
              assert.equal(flags.mode, 0o600);
              evidence++;
            },
          };
        if (name === "node:child_process")
          return {
            execFileSync(command, args, settings) {
              assert.equal(command, "docker");
              if (args[0] === "inspect") {
                inspected++;
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
                  creation_guard: true,
                  contact_rpc: true,
                  modules: true,
                  icu: !options.noIcu,
                });
              if (query.includes("FROM pg_proc"))
                return JSON.stringify(
                  options.present || applied
                    ? [
                        {
                          body: options.drift ? "wrong-body" : body,
                          definer: false,
                          stable: true,
                          config: ["search_path=pg_catalog, public"],
                          anon: !!options.anon,
                          authenticated: true,
                          service: false,
                        },
                      ]
                    : [],
                );
              if (query.includes("pg_collation"))
                return JSON.stringify(
                  query.includes("json_agg")
                    ? options.badCollation || options.present
                      ? [collation]
                      : []
                    : collation,
                );
              throw new Error("Unexpected SQL in helper test");
            },
          };
        return require(name);
      },
    });
  } catch (caught) {
    if (caught !== exit) error = caught;
  }
  return { applied, evidence, inspected, error };
}
test("pagination migration dry run is read-only", () => {
  const r = run();
  assert.equal(r.error, null);
  assert.equal(r.applied, 0);
  assert.equal(r.evidence, 0);
});
test("pagination migration applies only in checked local transaction and saves private evidence", () => {
  const r = run({ apply: true });
  assert.equal(r.error, null);
  assert.equal(r.applied, 1);
  assert.equal(r.evidence, 1);
});
test("pagination migration recognizes the exact installed function without applying again", () => {
  const r = run({ present: true });
  assert.equal(r.error, null);
  assert.equal(r.applied, 0);
  assert.equal(r.evidence, 1);
});
for (const options of [
  { remote: true },
  { exposed: true },
  { noIcu: true },
  { present: true, drift: true },
  { present: true, anon: true },
  { badCollation: true },
])
  test(`pagination migration refuses unsafe preconditions ${JSON.stringify(options)}`, () => {
    const r = run({ ...options, apply: true });
    assert.ok(r.error);
    assert.equal(r.applied, 0);
    assert.equal(r.evidence, 0);
  });
