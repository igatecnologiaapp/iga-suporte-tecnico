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
  const email = `denied-creation-${id}@iga-homologation.example`;
  const [actorRoles, actorProfile, actorModules, primary] = await Promise.all([
    read(`/rest/v1/user_roles?user_id=eq.${credentials.id}&select=role`),
    read(`/rest/v1/profiles?id=eq.${credentials.id}&select=status`),
    read(`/rest/v1/user_modules?user_id=eq.${credentials.id}&select=module`),
    read("/rest/v1/primary_admin?select=user_id"),
  ]);
  assert.equal(actorRoles.length, 1);
  assert.equal(actorRoles[0].role, "admin");
  assert.equal(actorProfile[0].status, "active");
  assert.ok(actorModules.some((row) => row.module === "users"));
  assert.equal(primary.length, 1);
  assert.notEqual(primary[0].user_id, credentials.id);
  async function matchingAuthUsers() {
    const data = await read(
      `/auth/v1/admin/users?filter=${encodeURIComponent(email)}&page=1&per_page=200`,
    );
    assert.ok(Array.isArray(data.users));
    // If this server ignores the filter, fail closed rather than infer absence.
    assert.ok(data.users.every((user) => user.email === email));
    return data.users;
  }
  assert.equal((await matchingAuthUsers()).length, 0);
  assert.equal(
    (await read(`/rest/v1/admin_user_creation_operations?id=eq.${id}&select=id`)).length,
    0,
  );
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
  stage = "recusa dos quatro endpoints de criação e convite";
  const result = await page.evaluate(
    async ({ operationId, email, actorId }) => {
      const { supabase } = await import("/src/integrations/supabase/client.ts");
      const session = await supabase.auth.getSession();
      if (session.error || session.data.session?.user.id !== actorId) return null;
      const functions = await import("/src/lib/admin-users.functions.ts");
      const checks = [];
      for (const [name, data] of [
        [
          "createAdminUser",
          {
            operationId,
            fullName: "Homologação criação negada",
            email,
            role: "viewer",
            status: "active",
            modules: ["tickets"],
          },
        ],
        ["resumeAdminUserCreation", { operationId }],
        ["resendAdminUserInvitation", { operationId }],
        ["listAdminUserCreations", undefined],
      ]) {
        let denied = false;
        try {
          await functions[name](data === undefined ? undefined : { data });
        } catch (error) {
          denied =
            error instanceof Error &&
            error.message.includes("Somente o Administrador Principal pode realizar esta ação.");
        }
        checks.push({ endpoint: name, denied });
      }
      return checks;
    },
    { operationId: id, email, actorId: credentials.id },
  );
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 4);
  assert.ok(result.every((check) => check.denied));
  stage = "conferência de efeitos";
  const operations = await read(`/rest/v1/admin_user_creation_operations?id=eq.${id}&select=id`);
  assert.equal(operations.length, 0);
  assert.equal((await matchingAuthUsers()).length, 0);
  // Allow the local mail queue a bounded observation window before checking.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const after = await mailIds();
  assert.equal([...after].filter((value) => !before.has(value)).length, 0);

  writeFileSync(
    resolve(privateDir, "creation-ordinary-admin-result.json"),
    JSON.stringify(
      {
        test: "creation.ordinary-admin-denial",
        status: "passed",
        checked_at: new Date().toISOString(),
        actual_local_endpoint: true,
        actor_confirmed_ordinary_admin_with_users_module: true,
        endpoints: result,
        creation_operations_created: 0,
        auth_accounts_created: 0,
        new_mailpit_messages: 0,
        observation_ms: 3000,
        users_created_or_deleted: false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "APROVADO: administrador comum impedido de criar, retomar, reenviar e listar operações.",
  );
  console.log(
    "APROVADO: nenhuma nova conta, reserva ou mensagem no Mailpit durante a conferência.",
  );
  console.log("Resultado salvo na pasta privada. Nenhuma credencial foi exibida.");
} catch {
  console.error(`NÃO CONCLUÍDO: ${stage}. Nenhuma credencial foi exibida.`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
