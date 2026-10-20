import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

let stage = "preparação";
let browser;
try {
  const privateDir = process.env.IGA_HOMO_PRIVATE;
  assert.ok(privateDir);
  const config = JSON.parse(readFileSync(resolve(privateDir, "local-config.json"), "utf8"));
  const api = new URL(config.API_URL ?? config.api_url ?? config.apiUrl);
  assert.equal(api.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost"].includes(api.hostname));
  assert.equal(api.port, "55421");
  assert.equal(api.pathname, "/");
  assert.ok(!api.username && !api.password && !api.search && !api.hash);
  const key = config.SERVICE_ROLE_KEY ?? config.service_role_key;
  assert.ok(key);
  const credentials = JSON.parse(readFileSync(resolve(privateDir, "fixtures.json"), "utf8")).users
    .admin;
  assert.equal(credentials.email, "admin@iga-homologation.example");
  assert.ok(credentials.id && credentials.password);
  async function read(path) {
    const response = await fetch(new URL(path, api), {
      redirect: "error",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    assert.ok(response.ok);
    return response.json();
  }
  const id = randomUUID();
  const [profiles, roles, actorRoles] = await Promise.all([
    read(`/rest/v1/profiles?id=eq.${id}&select=id`),
    read(`/rest/v1/user_roles?user_id=eq.${id}&select=role`),
    read(`/rest/v1/user_roles?user_id=eq.${credentials.id}&select=role`),
  ]);
  assert.equal(profiles.length, 0);
  assert.equal(roles.length, 0);
  assert.equal(actorRoles.length, 1);
  assert.equal(actorRoles[0].role, "admin");
  const account = await fetch(new URL(`/auth/v1/admin/users/${id}`, api), {
    redirect: "error",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  assert.equal(account.status, 404);
  async function mailIds() {
    const response = await fetch("http://127.0.0.1:55424/api/v1/messages", { redirect: "error" });
    assert.ok(response.ok);
    const data = await response.json();
    assert.ok(Array.isArray(data.messages));
    return new Set(data.messages.map((message) => message.ID));
  }
  const before = await mailIds();
  let chromium;
  for (const path of [
    resolve(process.env.HOME, "iga-homologacao/browser-tools/package.json"),
    resolve(import.meta.dirname, "../package.json"),
    resolve(process.env.HOME, "iga-homologacao/app/package.json"),
  ]) {
    const require = createRequire(path);
    for (const name of ["@playwright/test", "playwright"]) {
      try {
        chromium = require(name).chromium;
      } catch {
        /* Try next installed package. */
      }
      if (chromium) break;
    }
    if (chromium) break;
  }
  assert.ok(chromium);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      ["4180", "55421"].includes(url.port)
      ? route.continue()
      : route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  stage = "login local do administrador";
  await page.goto("http://127.0.0.1:4180/auth");
  await page.locator('input[name="email"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/tickets", {
    waitUntil: "commit",
    timeout: 45000,
  });
  stage = "requisição ao endpoint da aplicação";
  const result = await page.evaluate(async (targetId) => {
    const { sendPasswordReset } = await import("/src/lib/admin-users.functions.ts");
    try {
      await sendPasswordReset({ data: { userId: targetId } });
      return { rejected: false, expectedMessage: false };
    } catch (error) {
      return {
        rejected: true,
        expectedMessage:
          error instanceof Error &&
          error.message.includes("Não foi possível validar o usuário para recuperação."),
      };
    }
  }, id);
  assert.equal(result.rejected, true);
  assert.equal(result.expectedMessage, true);
  stage = "conferência de efeitos";
  const audits = await read(`/rest/v1/admin_audit_logs?target_user_id=eq.${id}&select=id`);
  assert.equal(audits.length, 0);
  // Allow the local mail queue a bounded observation window before checking.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const after = await mailIds();
  assert.equal([...after].filter((value) => !before.has(value)).length, 0);
  assert.equal((await read(`/rest/v1/profiles?id=eq.${id}&select=id`)).length, 0);
  writeFileSync(
    resolve(privateDir, "recovery-missing-user-result.json"),
    JSON.stringify(
      {
        test: "recovery.nonexistent-target",
        status: "passed",
        checked_at: new Date().toISOString(),
        actual_local_endpoint: true,
        target_confirmed_absent_before_request: true,
        rejected_before_delivery_intent: true,
        new_mailpit_messages: 0,
        observation_ms: 3000,
        users_created_or_deleted: false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log("APROVADO: usuário inexistente recusado pelo endpoint local.");
  console.log("APROVADO: nenhum e-mail novo no Mailpit durante a conferência.");
  console.log("Nenhuma conta criada ou excluída. Resultado salvo na pasta privada.");
} catch {
  console.error(`NÃO CONCLUÍDO: ${stage}. Nenhuma credencial foi exibida.`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
