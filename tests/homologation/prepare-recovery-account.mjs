// Dedicated local fixture; deliberately independent of npm and existing fixtures.
import { readFileSync, writeFileSync, chmodSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

async function main() {
  if (!process.env.IGA_HOMO_PRIVATE) throw new Error("Defina IGA_HOMO_PRIVATE.");
  const directory = realpathSync(process.env.IGA_HOMO_PRIVATE);
  const repo = realpathSync(new URL("../..", import.meta.url));
  const location = relative(repo, directory);
  if (!location || (!location.startsWith("..") && !isAbsolute(location)))
    throw new Error("A pasta privada precisa ficar fora do repositório.");
  const config = JSON.parse(readFileSync(resolve(directory, "local-config.json"), "utf8"));
  const url = new URL(config.API_URL ?? config.api_url ?? config.apiUrl);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "55421" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Destino recusado: somente Supabase HTTP local na porta 55421.");
  const key = config.SERVICE_ROLE_KEY ?? config.service_role_key;
  if (!key) throw new Error("Chave do Supabase local ausente.");
  async function request(path, method = "GET", body) {
    const response = await fetch(new URL(path, url), {
      method,
      redirect: "error",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new Error(
        `Operação local não confirmada (HTTP ${response.status}). Consulte o estado privado antes de repetir.`,
      );
    return response.status === 204 ? null : response.json();
  }
  const primary = await request("/rest/v1/primary_admin?select=user_id");
  if (!Array.isArray(primary) || primary.length !== 1 || !primary[0].user_id)
    throw new Error("O ambiente precisa ter um administrador principal configurado.");
  const operation = randomUUID();
  const email = `recovery-${operation}@iga-homologation.example`;
  const state = {
    operation,
    email,
    password: randomBytes(24).toString("base64url"),
    role: "viewer",
    status: "prepared",
  };
  const file = resolve(directory, `recovery-account-${operation}.json`);
  writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600, flag: "wx" });
  const save = () => {
    writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
    chmodSync(file, 0o600);
  };
  try {
    const account = await request("/auth/v1/admin/users", "POST", {
      email,
      password: state.password,
      email_confirm: true,
      user_metadata: { full_name: `Homologação recuperação ${operation.slice(0, 8)}` },
    });
    if (!account.id || account.email !== email) throw new Error("Conta local não confirmada.");
    state.id = account.id;
    state.status = "account-created";
    save();
    if (account.id === primary[0].user_id)
      throw new Error("Proteção do principal: operação interrompida.");
    // A freshly created account must have no additional roles from a trigger.
    const roles = await request(
      `/rest/v1/user_roles?user_id=eq.${encodeURIComponent(account.id)}&select=role`,
    );
    if (!Array.isArray(roles) || roles.length !== 1 || roles[0].role !== "viewer")
      throw new Error("Papel inesperado na conta nova; interrompido para revisão.");
    await request("/rest/v1/user_modules?on_conflict=user_id,module", "POST", {
      user_id: account.id,
      module: "tickets",
    });
    const profiles = await request(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(account.id)}&select=id,status`,
    );
    if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0].status !== "active")
      throw new Error("Perfil local não confirmado como ativo.");
    state.status = "ready";
    save();
    console.log("Conta exclusiva de recuperação preparada.");
    console.log(`Nome: Homologação recuperação ${operation.slice(0, 8)}`);
    console.log(`E-mail: ${email}`);
    console.log("Senha guardada somente no arquivo privado. Não alterados os usuários anteriores.");
  } catch (error) {
    state.status = "needs-review";
    save();
    console.error(`Preparação interrompida. Registro privado: ${file}`);
    throw error;
  }
}
main().catch(() => {
  console.error(
    "Preparação não concluída; não repita antes da revisão. Nenhuma credencial foi exibida.",
  );
  process.exitCode = 1;
});
