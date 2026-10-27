/** Área: Utilitários locais de clientes autenticados e armazenamento privado de evidências. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
export const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const privateDir = process.env.IGA_HOMO_PRIVATE;
if (!privateDir) throw new Error("IGA_HOMO_PRIVATE must name a private directory outside Git");
export const config = JSON.parse(readFileSync(resolve(privateDir, "local-config.json"), "utf8"));
export const apiUrl = config.API_URL ?? config.api_url ?? config.apiUrl;
const parsed = new URL(apiUrl);
if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "55421")
  throw new Error("Refusing any non-local Supabase destination");
const require = createRequire(resolve(repo, "package.json"));
const { createClient } = require("@supabase/supabase-js");
export const anonKey = config.ANON_KEY ?? config.anon_key;
const adminKey = config.SERVICE_ROLE_KEY ?? config.service_role_key;
if (!anonKey || !adminKey) throw new Error("Missing keys of the local Supabase instance");
export const admin = createClient(apiUrl, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/** Cria cliente de teste sem persistir sessão compartilhada. */
export function userClient() {
  return createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
/** Salva a evidência em arquivo privado fora do repositório. */
export function savePrivate(name, value) {
  writeFileSync(resolve(privateDir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
}
/** Interrompe o cenário quando a operação Supabase retorna erro. */
export function requireOk(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? ""} ${result.error.message}`);
  return result.data;
}
