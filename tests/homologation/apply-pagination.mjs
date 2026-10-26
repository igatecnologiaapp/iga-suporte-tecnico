import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
const repo = realpathSync(resolve(import.meta.dirname, "../.."));
const folder = realpathSync(process.env.IGA_HOMO_PRIVATE || "");
assert.ok(
  relative(repo, folder).startsWith("../"),
  "Pasta privada deve ficar fora do repositório.",
);
const config = JSON.parse(readFileSync(resolve(folder, "local-config.json"), "utf8"));
assert.equal(
  new URL(config.API_URL ?? config.api_url ?? config.apiUrl).href,
  "http://127.0.0.1:55421/",
);
const container = "supabase_db_iga-service-homologation";
const [info] = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }));
assert.equal(info.Name, "/" + container);
assert.equal(info.State.Running, true);
const ports = info.NetworkSettings.Ports["5432/tcp"];
assert.ok(
  ports?.length &&
    ports.every((port) => ["127.0.0.1", "::1"].includes(port.HostIp) && port.HostPort === "55422"),
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
const name = "0023_paginated_record_lists.sql";
const migration = readFileSync(resolve(repo, "drizzle/migrations", name), "utf8");
const body = migration.match(/AS \$\$([\s\S]*?)\$\$;/)?.[1];
assert.ok(body);
const signature = "public.list_paged_records(text,integer,integer,jsonb)";
function definition() {
  return JSON.parse(
    sql(
      `SELECT coalesce(json_agg(json_build_object('body',p.prosrc,'definer',p.prosecdef,'stable',p.provolatile='s','config',p.proconfig,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE'))),'[]'::json) FROM pg_proc p WHERE p.oid=to_regprocedure('${signature}');`,
    ),
  );
}
function checkFunction(fn) {
  assert.equal(fn.body, body);
  assert.equal(fn.definer, false);
  assert.equal(fn.stable, true);
  assert.equal(fn.anon, false);
  assert.equal(fn.authenticated, true);
  assert.equal(fn.service, false);
  assert.ok(fn.config.includes("search_path=pg_catalog, public"));
}
const prerequisites = JSON.parse(
  sql(
    `SELECT json_build_object('database',current_database(),'creation_guard',to_regprocedure('public.guard_admin_creation_auth_identity()') IS NOT NULL,'contact_rpc',to_regprocedure('public.technician_contacts()') IS NOT NULL,'modules',to_regprocedure('public.has_module(uuid,text)') IS NOT NULL,'icu',EXISTS(SELECT 1 FROM pg_collation WHERE collprovider='i'));`,
  ),
);
assert.equal(prerequisites.database, "postgres");
assert.ok(
  prerequisites.creation_guard &&
    prerequisites.contact_rpc &&
    prerequisites.modules &&
    prerequisites.icu,
);
const previousCollation = JSON.parse(
  sql(
    `SELECT coalesce(json_agg(json_build_object('icu',c.collprovider='i','deterministic',c.collisdeterministic,'locale',coalesce(to_jsonb(c)->>'colllocale',to_jsonb(c)->>'colliculocale'))),'[]'::json) FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='public' AND c.collname='iga_list_pt_natural';`,
  ),
);
if (previousCollation.length) {
  assert.equal(previousCollation.length, 1);
  assert.equal(previousCollation[0].icu, true);
  assert.equal(previousCollation[0].deterministic, false);
  assert.equal(previousCollation[0].locale, "pt-u-kn-true-ks-level1");
}
const existing = definition();
assert.ok(existing.length <= 1);
if (existing.length) checkFunction(existing[0]);
if (!existing.length && !process.argv.includes("--apply")) {
  console.log("Isolamento local confirmado. Migration 0023 não aplicada; use --apply.");
  process.exit(0);
}
if (!existing.length) sql(migration);
const [installed] = definition();
checkFunction(installed);
const collation = JSON.parse(
  sql(
    `SELECT json_build_object('icu',c.collprovider='i','deterministic',c.collisdeterministic,'locale',coalesce(to_jsonb(c)->>'colllocale',to_jsonb(c)->>'colliculocale')) FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='public' AND c.collname='iga_list_pt_natural';`,
  ),
);
assert.equal(collation.icu, true);
assert.equal(collation.deterministic, false);
assert.equal(collation.locale, "pt-u-kn-true-ks-level1");
writeFileSync(
  resolve(folder, "pagination-migration.json"),
  JSON.stringify(
    {
      migration: name,
      sha256: createHash("sha256").update(migration).digest("hex"),
      alreadyPresent: existing.length === 1,
      securityInvoker: true,
      prerequisites,
      collation,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log("APROVADO: migration 0023 e permissões conferidas somente no Supabase local.");
console.log("Nenhum cadastro ou credencial foi alterado. Resultado salvo na pasta privada.");
