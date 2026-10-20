import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
const repo = resolve(import.meta.dirname, "../..");
assert.ok(process.env.IGA_HOMO_PRIVATE, "Defina IGA_HOMO_PRIVATE.");
const privateDir = resolve(process.env.IGA_HOMO_PRIVATE);
assert.ok(relative(repo, privateDir).startsWith("../"), "Pasta privada precisa ficar fora do Git.");
const config = JSON.parse(readFileSync(resolve(privateDir, "local-config.json"), "utf8"));
const url = new URL(config.API_URL ?? config.api_url ?? config.apiUrl);
assert.equal(url.href, "http://127.0.0.1:55421/");
const container = "supabase_db_iga-service-homologation";
const [info] = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }));
assert.equal(info.Name, `/${container}`);
assert.equal(info.State.Running, true);
const bindings = info.NetworkSettings.Ports["5432/tcp"];
assert.ok(
  bindings?.length &&
    bindings.every(
      (binding) => ["127.0.0.1", "::1"].includes(binding.HostIp) && binding.HostPort === "55422",
    ),
);
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
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const prerequisites = JSON.parse(
  sql(`SELECT json_build_object(
 'database',current_database(),
 'atomic_update',to_regprocedure('public.update_admin_user_atomic(uuid,jsonb)') IS NOT NULL,
 'app_metadata',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='raw_app_meta_data')
);`),
);
assert.equal(prerequisites.database, "postgres");
assert.ok(prerequisites.atomic_update && prerequisites.app_metadata);
const name = "0021_admin_user_creation_operations.sql";
const migration = readFileSync(resolve(repo, "drizzle/migrations", name), "utf8");
const functions = [
  ...migration.matchAll(
    /CREATE FUNCTION public\.(\w+)\([\s\S]*?\n(?:LANGUAGE[\s\S]*?)AS \$\$([\s\S]*?)\$\$;/g,
  ),
].map((match) => ({
  name: match[1],
  body: match[2],
  definer: match[0].includes("SECURITY DEFINER"),
}));
assert.equal(functions.length, 11, "Unexpected migration function set");
const present = JSON.parse(
  sql(
    `SELECT json_build_object('present',to_regclass('public.admin_user_creation_operations') IS NOT NULL);`,
  ),
).present;
if (!present) {
  if (!process.argv.includes("--apply")) {
    console.log("Isolamento local confirmado. Migration 0021 não aplicada; use --apply.");
    process.exit(0);
  }
  sql(migration);
  console.log("Migration 0021 aplicada em transação somente no Supabase local.");
}
for (const fn of functions) {
  const rows = JSON.parse(
    sql(
      `SELECT COALESCE(json_agg(json_build_object('body',p.prosrc,'definer',p.prosecdef,'public_access',has_function_privilege('anon',p.oid,'EXECUTE'),'service_access',has_function_privilege('service_role',p.oid,'EXECUTE'),'authenticated_access',has_function_privilege('authenticated',p.oid,'EXECUTE'))),'[]'::json) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${fn.name}';`,
    ),
  );
  assert.equal(rows.length, 1, `Function missing/overloaded: ${fn.name}`);
  const current = rows[0];
  assert.equal(current.body, fn.body, `Function differs: ${fn.name}`);
  assert.equal(current.definer, fn.definer);
  assert.equal(current.public_access, false);
  assert.equal(current.service_access, false);
  assert.equal(
    current.authenticated_access,
    [
      "reserve_admin_user_creation",
      "provision_admin_user_creation",
      "claim_admin_user_invitation",
      "record_admin_user_invitation",
      "list_admin_user_creations",
      "get_admin_user_creation",
    ].includes(fn.name),
  );
}
const checks = JSON.parse(
  sql(`SELECT json_build_object(
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.admin_user_creation_operations'::regclass),
 'authenticated_read',has_table_privilege('authenticated','public.admin_user_creation_operations','SELECT'),
 'service_insert',has_table_privilege('service_role','public.admin_user_creation_operations','INSERT'),
 'guards',(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('pending_creation_profile','pending_creation_role','pending_creation_module','pending_creation_technician','pending_creation_auth_identity'))
);`),
);
assert.equal(checks.rls, true);
assert.equal(checks.authenticated_read, false);
assert.equal(checks.service_insert, false);
assert.equal(checks.guards, 5);
writeFileSync(
  resolve(privateDir, "admin-creation-local-migration.json"),
  JSON.stringify(
    {
      migration: name,
      sha256: createHash("sha256").update(migration).digest("hex"),
      already_present: present,
      functions_checked: functions.length,
      checks,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log("APROVADO: funções, permissões e proteções da migration 0021 conferidas.");
