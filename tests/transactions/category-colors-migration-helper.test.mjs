/** Área: Simulação das travas de destino e compatibilidade do aplicador local de cores. */
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
  resolve(repo, "drizzle/migrations/0025_category_colors.sql"),
  "utf8",
);
const source = ts.transpileModule(
  readFileSync(resolve(directory, "apply-category-colors.mjs"), "utf8").replaceAll(
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
/** Executa o aplicador com Docker e arquivos simulados, contando somente as mutações autorizadas. */
function run(options = {}) {
  let applied = 0,
    evidence = 0,
    inspected = 0,
    error = null;
  const exit = new Error("dry run exit");
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
                  rls: !options.noRls,
                  modules: true,
                  pagination: !options.noPagination,
                });
              if (query.includes("FROM pg_attribute"))
                return JSON.stringify(
                  options.present || applied
                    ? [
                        {
                          type: options.badType ? "varchar" : "text",
                          required: true,
                          default: "'#0ea5e9'::text",
                          constraint: options.drift
                            ? "CHECK (true)"
                            : "CHECK ((color = ANY (ARRAY['#0ea5e9'::text, '#eab308'::text, '#ec4899'::text, '#8b5cf6'::text, '#10b981'::text, '#f97316'::text, '#ef4444'::text])))",
                          read: true,
                          write: true,
                          anonWrite: !!options.anon,
                        },
                      ]
                    : [],
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
test("category colors migration dry run is read-only", () => {
  const r = run();
  assert.equal(r.error, null);
  assert.equal(r.applied, 0);
  assert.equal(r.evidence, 0);
});
test("category colors migration applies only in checked local transaction and saves private evidence", () => {
  const r = run({ apply: true });
  assert.equal(r.error, null);
  assert.equal(r.applied, 1);
  assert.equal(r.evidence, 1);
});
test("category colors migration recognizes the exact installed column without applying again", () => {
  const r = run({ present: true });
  assert.equal(r.error, null);
  assert.equal(r.applied, 0);
  assert.equal(r.evidence, 1);
});
for (const options of [
  { remote: true },
  { exposed: true },
  { noRls: true },
  { noPagination: true },
  { present: true, drift: true },
  { present: true, anon: true },
  { present: true, badType: true },
])
  test(`category colors helper refuses unsafe conditions ${JSON.stringify(options)}`, () => {
    const r = run({ ...options, apply: true });
    assert.ok(r.error);
    assert.equal(r.applied, 0);
    assert.equal(r.evidence, 0);
  });
