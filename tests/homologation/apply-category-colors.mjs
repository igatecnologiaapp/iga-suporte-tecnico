/** Área: Instala a paleta somente no Supabase local de homologação, sem modificar vínculos. */
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
/** Executa uma transação apenas no container local previamente conferido. */
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
const migrationName = "0025_category_colors.sql";
const migration = readFileSync(resolve(repo, "drizzle/migrations", migrationName), "utf8");
const prerequisites = JSON.parse(
  sql(
    `SELECT json_build_object('database',current_database(),'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.ticket_categories'::regclass),'modules',to_regprocedure('public.has_module(uuid,text)') IS NOT NULL,'pagination',to_regprocedure('public.list_paged_records(text,integer,integer,jsonb)') IS NOT NULL);`,
  ),
);
assert.equal(prerequisites.database, "postgres");
assert.ok(
  prerequisites.rls && prerequisites.modules && prerequisites.pagination,
  "Pré-requisitos de segurança e paginação ausentes.",
);
/** Lê tipo, padrão e restrição instalados sem alterar uma coluna existente. */
function definition() {
  return JSON.parse(
    sql(
      `SELECT coalesce(json_agg(json_build_object('type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'constraint',(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=a.attrelid AND conname='ticket_categories_color_palette' AND convalidated),'read',has_column_privilege('authenticated',a.attrelid,a.attname,'SELECT'),'write',has_column_privilege('authenticated',a.attrelid,a.attname,'UPDATE'),'anonWrite',has_column_privilege('anon',a.attrelid,a.attname,'UPDATE'),'anonRlsProtected',NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='anon') AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=a.attrelid AND p.polpermissive AND p.polcmd IN ('*','r','w') AND EXISTS (SELECT 1 FROM unnest(p.polroles) role_oid WHERE CASE WHEN role_oid=0 THEN true ELSE pg_has_role('anon',role_oid,'MEMBER') END)))),'[]'::json) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.ticket_categories'::regclass AND a.attname='color' AND NOT a.attisdropped;`,
    ),
  );
}
/** Aceita apenas a definição exata da paleta, preservando instalações incompatíveis para revisão. */
function check(column) {
  assert.ok(column, "Coluna de cor não encontrada.");
  assert.equal(column.type, "text");
  assert.equal(column.required, true);
  assert.equal(column.default, "'#0ea5e9'::text");
  const expected =
    "CHECK ((color = ANY (ARRAY['#0ea5e9'::text, '#eab308'::text, '#ec4899'::text, '#8b5cf6'::text, '#10b981'::text, '#f97316'::text, '#ef4444'::text])))";
  assert.equal(column.constraint?.replace(/\s/g, ""), expected.replace(/\s/g, ""));
  assert.equal(column.read, true);
  assert.equal(column.write, true);
  // O Supabase pode conceder privilégios SQL padrão a anon; sem política permissiva,
  // a RLS bloqueia leitura/atualização. Confira a proteção efetiva, inclusive herança.
  assert.equal(column.anonRlsProtected, true, "RLS deve bloquear leitura e atualização anônimas.");
}
const existing = definition();
assert.ok(existing.length <= 1);
if (existing.length) check(existing[0]);
if (!existing.length && !process.argv.includes("--apply")) {
  console.log("Isolamento local confirmado. Migration 0025 não aplicada; use --apply.");
  process.exit(0);
}
if (!existing.length) sql(migration);
const [installed] = definition();
check(installed);
writeFileSync(
  resolve(folder, "category-colors-migration.json"),
  JSON.stringify(
    {
      migration: migrationName,
      sha256: createHash("sha256").update(migration).digest("hex"),
      alreadyPresent: existing.length === 1,
      prerequisites,
      installed,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log("APROVADO: migration 0025 e paleta conferidas somente no Supabase local.");
console.log("Categorias existentes recebem azul; nomes e vínculos são preservados.");
