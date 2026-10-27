/** Área: Aplicação controlada das migrations na instância local de testes. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "../..");
const container = "supabase_db_iga-service-homologation";
const name = execFileSync("docker", ["inspect", "--format", "{{.Name}}", container], {
  encoding: "utf8",
}).trim();
if (name !== `/${container}`) throw new Error("Refusing an unexpected container");
/** Executa SQL somente no container previamente conferido, interrompendo a transação em caso de falha. */
function sql(input) {
  return spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
    ],
    { input, encoding: "utf8" },
  );
}
const before = sql(
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies';",
);
if (before.status !== 0 || !/\n\s*0\s*\n/.test(before.stdout))
  throw new Error("Database is not a fresh isolated database");
const results = [];
for (const file of readdirSync(resolve(root, "drizzle/migrations"))
  .filter((name) => /^00(?:0\d|1\d)_.*\.sql$/.test(name))
  .sort()) {
  const bytes = readFileSync(resolve(root, "drizzle/migrations", file));
  const result = sql(bytes);
  results.push({
    migration: file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    exit_code: result.status,
  });
  console.log(file, result.status === 0 ? "applied" : "FAILED");
  if (result.status !== 0) {
    writeFileSync(resolve(process.env.IGA_HOMO_PRIVATE, "migration-failure.log"), result.stderr, {
      mode: 0o600,
    });
    break;
  }
}
writeFileSync(
  resolve(root, "docs/phase-1/homologation/migrations.json"),
  JSON.stringify({ target: "local Docker container", container, migrations: results }, null, 2) +
    "\n",
);
if (results.length !== 20 || results.some((item) => item.exit_code !== 0)) process.exitCode = 1;
