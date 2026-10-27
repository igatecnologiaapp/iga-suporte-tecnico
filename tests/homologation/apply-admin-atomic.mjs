/** Área: Aplicador local da transação administrativa de alteração de usuários. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

// Intentionally independent of the Supabase client and all production env files.
const repo = resolve(import.meta.dirname, "../..");
assert.ok(process.env.IGA_HOMO_PRIVATE, "IGA_HOMO_PRIVATE is required");
const privateDir = resolve(process.env.IGA_HOMO_PRIVATE);
assert.ok(relative(repo, privateDir).startsWith("../"), "Private directory must be outside Git");
const config = JSON.parse(readFileSync(resolve(privateDir, "local-config.json"), "utf8"));
const url = new URL(config.API_URL ?? config.api_url ?? config.apiUrl);
assert.equal(url.origin, "http://127.0.0.1:55421", "Unexpected local API destination");

const container = "supabase_db_iga-service-homologation";
const [info] = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }));
assert.equal(info.Name, `/${container}`);
assert.equal(info.State.Running, true);
const bindings = info.NetworkSettings.Ports["5432/tcp"];
assert.ok(bindings?.length, "Local PostgreSQL binding required");
assert.ok(
  bindings.every(
    (binding) => ["127.0.0.1", "::1"].includes(binding.HostIp) && binding.HostPort === "55422",
  ),
  "Refusing non-loopback or unexpected database port bindings",
);

/** Executa SQL somente no container previamente conferido, interrompendo a transação em caso de falha. */
function sql(input) {
  return execFileSync(
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
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
    ],
    { input, encoding: "utf8" },
  ).trim();
}

const checks = JSON.parse(
  sql(`SELECT json_build_object(
  'database', current_database(),
  'domain', EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='companies' AND column_name='domain'),
  'categories', to_regclass('public.company_ticket_categories') IS NOT NULL,
  'validator', to_regprocedure('public.validate_company_ticket_category()') IS NOT NULL
);`),
);
assert.equal(checks.database, "postgres");
assert.ok(
  checks.domain && checks.categories && checks.validator,
  "Historical schema prerequisites missing",
);

const name = "0020_atomic_admin_user_update.sql";
const migration = readFileSync(resolve(repo, "drizzle/migrations", name), "utf8");
const body = migration.match(/AS \$\$([\s\S]*?)\$\$;/)?.[1];
assert.ok(body, "Migration function body missing");
const existing = JSON.parse(
  sql(`SELECT COALESCE((
  SELECT json_build_object('body',prosrc,'definer',prosecdef)
  FROM pg_proc WHERE oid=to_regprocedure('public.update_admin_user_atomic(uuid,jsonb)')
), 'null'::json);`),
);

if (existing) {
  assert.equal(existing.body, body, "Existing RPC differs; refusing automatic replacement");
  assert.equal(existing.definer, true);
  console.log("Migration 0020 already present with matching function body.");
} else if (process.argv.includes("--apply")) {
  sql(migration);
  console.log("Migration 0020 applied exclusively inside the verified local container.");
} else {
  console.log("Local isolation checks passed. Migration not applied; use --apply.");
  process.exit(0);
}

const privileges = JSON.parse(
  sql(`SELECT json_build_object(
  'authenticated',has_function_privilege('authenticated','public.update_admin_user_atomic(uuid,jsonb)','EXECUTE'),
  'anon',has_function_privilege('anon','public.update_admin_user_atomic(uuid,jsonb)','EXECUTE'),
  'service_role',has_function_privilege('service_role','public.update_admin_user_atomic(uuid,jsonb)','EXECUTE')
);`),
);
assert.equal(privileges.authenticated, true);
assert.equal(privileges.anon, false);
assert.equal(privileges.service_role, false);

writeFileSync(
  resolve(repo, "docs/phase-1/homologation/admin-atomic-local-migration.json"),
  JSON.stringify(
    {
      target: "Verified local Docker container",
      container,
      migration: name,
      sha256: createHash("sha256").update(migration).digest("hex"),
      existing_matching_function: Boolean(existing),
      checks,
      privileges,
    },
    null,
    2,
  ) + "\n",
);
