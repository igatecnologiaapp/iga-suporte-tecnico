/** Área: Preparação e conferência local do fluxo de convite de uma conta fictícia. */
// Local-only capability check. No migration and no existing account changes.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

let stage = "preparação";
let state;
let file;
/** Salva o resultado da conferência no local de evidências apropriado. */
function save() {
  writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
}
/** Coordena as pré-condições locais e as etapas do cenário de homologação. */
async function main() {
  assert.ok(process.env.IGA_HOMO_PRIVATE);
  const directory = realpathSync(process.env.IGA_HOMO_PRIVATE);
  const repo = realpathSync(new URL("../..", import.meta.url));
  const location = relative(repo, directory);
  assert.ok(location && (location.startsWith("../") || isAbsolute(location)));
  const config = JSON.parse(readFileSync(resolve(directory, "local-config.json"), "utf8"));
  const api = new URL(config.API_URL ?? config.api_url ?? config.apiUrl);
  assert.equal(api.origin, "http://127.0.0.1:55421");
  assert.ok(api.pathname === "/" && !api.username && !api.password && !api.search && !api.hash);
  const key = config.SERVICE_ROLE_KEY ?? config.service_role_key;
  assert.ok(key);
  /** Faz a requisição ao destino local conferido e trata falhas de resposta. */
  async function request(path, method = "GET", body) {
    const response = await fetch(new URL(path, api), {
      method,
      redirect: "error",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.ok(response.ok, `HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  const primary = await request("/rest/v1/primary_admin?select=user_id");
  assert.equal(primary.length, 1);
  assert.ok(primary[0].user_id);
  const operation = randomUUID();
  const id = randomUUID();
  const email = `invitation-probe-${operation}@iga-homologation.example`;
  state = {
    operation,
    id,
    email,
    status: "prepared",
    account_inactive: false,
    modules: [],
    invitation_requested: false,
  };
  file = resolve(directory, "invitation-preflight.json");
  // Fixed exclusive journal prevents accidental reruns and duplicate test mail.
  writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600, flag: "wx" });
  stage = "criação da conta exclusiva com UUID reservado";
  state.status = "creation_started";
  save();
  const created = await request("/auth/v1/admin/users", "POST", {
    id,
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: false,
    user_metadata: { full_name: `Homologação convite ${operation.slice(0, 8)}` },
    app_metadata: { invitation_preflight: operation },
  });
  assert.equal(created.id, id);
  assert.equal(created.email, email);
  assert.ok(!created.email_confirmed_at);
  assert.equal(created.app_metadata.invitation_preflight, operation);
  state.status = "account_created";
  save();
  stage = "isolamento da conta exclusiva";
  const profiles = await request(`/rest/v1/profiles?id=eq.${id}`, "PATCH", { status: "inactive" });
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, id);
  assert.equal(profiles[0].status, "inactive");
  const [roles, modules] = await Promise.all([
    request(`/rest/v1/user_roles?user_id=eq.${id}&select=role`),
    request(`/rest/v1/user_modules?user_id=eq.${id}&select=module`),
  ]);
  assert.equal(roles.length, 1);
  assert.equal(roles[0].role, "viewer");
  assert.equal(modules.length, 0);
  assert.notEqual(primary[0].user_id, id);
  state.account_inactive = true;
  state.status = "isolated";
  save();
  stage = "convite da conta previamente criada";
  state.status = "invitation_started";
  save();
  const invited = await request(
    "/auth/v1/invite?redirect_to=" + encodeURIComponent("http://127.0.0.1:4180/reset-password"),
    "POST",
    {
      email,
      data: { full_name: `Homologação convite ${operation.slice(0, 8)}` },
    },
  );
  assert.equal(invited.id, id);
  assert.equal(invited.email, email);
  assert.ok(!invited.email_confirmed_at);
  assert.ok(invited.invited_at);
  state.invitation_requested = true;
  stage = "conferência após convite";
  const account = await request(`/auth/v1/admin/users/${id}`);
  assert.equal(account.id, id);
  assert.equal(account.email, email);
  assert.equal(account.app_metadata.invitation_preflight, operation);
  const isolated = await request(`/rest/v1/profiles?id=eq.${id}&select=status`);
  assert.equal(isolated[0].status, "inactive");
  assert.equal((await request(`/rest/v1/user_modules?user_id=eq.${id}&select=module`)).length, 0);
  stage = "entrega no Mailpit";
  let delivered = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch("http://127.0.0.1:55424/api/v1/messages", { redirect: "error" });
    assert.ok(response.ok);
    const mailbox = await response.json();
    assert.ok(Array.isArray(mailbox.messages));
    delivered = mailbox.messages.some((message) =>
      (message.To || []).some((to) => to.Address === email),
    );
    if (delivered) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(delivered, true);
  state.status = "passed";
  state.mailpit_delivered = true;
  save();
  console.log("APROVADO: Auth aceitou o UUID reservado na criação.");
  console.log("APROVADO: convite enviado para a conta existente sem trocar seu UUID.");
  console.log("APROVADO: mensagem recebida no Mailpit; conta mantida inativa e sem módulos.");
  console.log("Nenhuma conta anterior foi alterada. Não abra o link deste convite de diagnóstico.");
}
main().catch(() => {
  // Keep the last known stage: a timeout must never be treated as proof of failure.
  console.error(`NÃO CONCLUÍDO: ${stage}. Não repita o comando; informe somente esta mensagem.`);
  process.exitCode = 1;
});
