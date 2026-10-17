import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { admin, privateDir, repo, requireOk } from "./local-support.mjs";
const require = createRequire(resolve(repo, "tests/package.json"));
const { chromium } = require("@playwright/test");
const fixtures = JSON.parse(readFileSync(resolve(privateDir, "fixtures.json"), "utf8"));
const out = resolve(repo, "docs/phase-1/homologation");
mkdirSync(resolve(out, "screenshots"), { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const external = [];
async function session(key) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(u.hostname)) return route.continue();
    external.push(u.hostname);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto("http://127.0.0.1:4180/auth");
  await page.locator("input[name=email]").fill(fixtures.users[key].email);
  await page.locator("input[name=password]").fill(fixtures.users[key].password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/tickets/, { timeout: 20000 });
  return { context, page };
}
async function check(id, fn) {
  try {
    await fn();
    results.push({ id, status: "passed" });
  } catch (error) {
    results.push({ id, status: "failed", detail: String(error.message).slice(0, 450) });
  }
}
const { context, page } = await session("primary");
let created;
const domainLabel = "Domínio (opcional, texto livre)";
async function save() {
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function edit(name) {
  await page.goto("http://127.0.0.1:4180/companies");
  await page.getByRole("button", { name: `Editar ${name}`, exact: true }).click();
}
async function company(id) {
  return requireOk(
    await admin.from("companies").select("*").eq("id", id).single(),
    "persisted company",
  );
}
await check("ui.real-auth.primary", async () => {
  assert.ok(page.url().endsWith("/tickets"));
});
await check("ui.company.create-with-domain", async () => {
  await page.goto("http://127.0.0.1:4180/companies");
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await page.getByLabel("Razão Social", { exact: true }).fill("Empresa UI Homologação Ltda");
  await page.getByLabel("Nome Fantasia", { exact: true }).fill("Empresa UI Homologação");
  await page.getByLabel("CNPJ/CPF").fill("00000000001005");
  await page.getByLabel(domainLabel).fill("ui.example");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  created = requireOk(
    await admin.from("companies").select("*").eq("tax_id", "00000000001005").single(),
    "created",
  );
  assert.equal(created.domain, "ui.example");
});
await check("ui.domain.edit-and-free-text-contract", async () => {
  assert.ok(created);
  await edit(created.trade_name);
  await page.getByLabel(domainLabel).fill("HTTPS://WWW.UI.EXAMPLE/path");
  await save();
  assert.equal((await company(created.id)).domain, "HTTPS://WWW.UI.EXAMPLE/path");
});
await check("ui.domain.other-fields-preserved-after-reload", async () => {
  await edit(created.trade_name);
  await page.getByLabel("Telefone", { exact: true }).fill("11911111111");
  await save();
  await page.reload();
  assert.equal((await company(created.id)).domain, "HTTPS://WWW.UI.EXAMPLE/path");
  await page.getByRole("link", { name: "HTTPS://WWW.UI.EXAMPLE/path", exact: true }).waitFor();
});
await check("ui.domain.field-omitted-preserved", async () => {
  await edit(created.trade_name);
  await page.getByLabel(domainLabel).evaluate((element) => element.remove());
  await page.getByLabel("Nome Fantasia", { exact: true }).fill("Empresa UI Atualizada");
  await save();
  created.trade_name = "Empresa UI Atualizada";
  assert.equal((await company(created.id)).domain, "HTTPS://WWW.UI.EXAMPLE/path");
});
await check("ui.domain.search-and-safe-display", async () => {
  await page.goto("http://127.0.0.1:4180/companies");
  await page
    .getByRole("textbox", { name: "Pesquisar empresas por nome, documento ou domínio" })
    .fill("UI.EXAMPLE");
  const link = page.getByRole("link", { name: "HTTPS://WWW.UI.EXAMPLE/path", exact: true });
  assert.equal(await link.getAttribute("href"), "https://ui.example");
});
await check("ui.domain.duplicate-warning-persists", async () => {
  await edit(created.trade_name);
  await page.getByLabel(domainLabel).fill("alfa.example");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await page
    .getByText("Atenção: o domínio alfa.example já está cadastrado em Alfa Homologação.")
    .waitFor();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await company(created.id)).domain, "alfa.example");
});
await check("ui.company.create-without-domain", async () => {
  await page.goto("http://127.0.0.1:4180/companies");
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await page.getByLabel("Razão Social", { exact: true }).fill("Empresa Sem Domínio");
  await page.getByLabel("Nome Fantasia", { exact: true }).fill("Empresa Sem Domínio");
  await page.getByLabel("CNPJ/CPF").fill("00000000001196");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const record = requireOk(
    await admin.from("companies").select("domain").eq("tax_id", "00000000001196").single(),
    "optional domain",
  );
  assert.equal(record.domain, null);
});
await check("ui.domain.free-text-not-rewritten", async () => {
  await edit("Beta Homologação");
  await page.getByLabel("Telefone", { exact: true }).fill("11922222222");
  await save();
  assert.equal((await company(fixtures.companies[1].id)).domain, "Sem site / uso interno");
});
await check("ui.company.parent-child-default-persistence", async () => {
  await edit("Alfa Homologação");
  assert.equal(await page.getByLabel("Subcategoria Alfa", { exact: true }).isChecked(), true);
  await page.getByLabel("Subcategoria Beta", { exact: true }).check();
  await page.getByLabel("Padrão", { exact: true }).nth(1).check();
  await save();
  await page.reload();
  const links = requireOk(
    await admin
      .from("company_ticket_categories")
      .select("*")
      .eq("company_id", fixtures.companies[0].id),
    "links",
  );
  assert.equal(links.length, 4);
  assert.equal(links.find((l) => l.is_default).category_id, fixtures.categories[1].id);
  assert.equal((await company(fixtures.companies[0].id)).domain, "alfa.example");
});
await check("ui.contacts.create-search-persist", async () => {
  await page.goto("http://127.0.0.1:4180/contacts");
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await page
    .getByLabel("Empresa / Cliente", { exact: true })
    .selectOption(fixtures.companies[0].id);
  await page.getByLabel("Nome", { exact: true }).fill("Contato UI Sintético");
  await page.getByLabel("E-mail", { exact: true }).fill("ui-contact@alfa.example");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.reload();
  await page.getByRole("textbox", { name: "Pesquisar cadastros" }).fill("Contato UI Sintético");
  await page.getByText("Contato UI Sintético", { exact: true }).waitFor();
  const rows = requireOk(
    await admin.from("contacts").select("company_id").eq("name", "Contato UI Sintético"),
    "contact",
  );
  assert.equal(rows[0].company_id, fixtures.companies[0].id);
});
await check("ui.empty-state", async () => {
  await page.goto("http://127.0.0.1:4180/companies");
  await page
    .getByRole("textbox", { name: "Pesquisar empresas por nome, documento ou domínio" })
    .fill("no-synthetic-match-918172");
  await page.getByRole("status").filter({ hasText: "Nenhum cadastro encontrado" }).waitFor();
});
for (const width of [360, 768, 1440])
  for (const theme of ["light", "dark"])
    await check(`ui.responsive.${width}.${theme}`, async () => {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((value) => localStorage.setItem("iga-theme", value), theme);
      await page.goto("http://127.0.0.1:4180/companies");
      await page.getByRole("button", { name: "Editar Alfa Homologação", exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.screenshot({
        path: resolve(out, `screenshots/companies-${width}-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Editar Alfa Homologação", exact: true }).click();
      await page.getByLabel(domainLabel).waitFor();
      await page.screenshot({
        path: resolve(out, `screenshots/company-form-${width}-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await page.getByLabel("Subcategoria Alfa", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(out, `screenshots/company-categories-${width}-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    });
await check("server.primary.users-list-allowed", async () => {
  const r = await page.evaluate(async () => {
    try {
      const mod = await import("/src/lib/admin-users.functions.ts");
      await mod.listAdminUsers();
      return true;
    } catch {
      return false;
    }
  });
  assert.equal(r, true);
});
await check("server.primary.role-change-allowed", async () => {
  const r = await page.evaluate(async (id) => {
    try {
      const mod = await import("/src/lib/admin-users.functions.ts");
      await mod.updateUser({ data: { userId: id, role: "viewer" } });
      return true;
    } catch {
      return false;
    }
  }, fixtures.users.restricted.id);
  assert.equal(r, true);
  const role = requireOk(
    await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", fixtures.users.restricted.id)
      .single(),
    "role persisted",
  );
  assert.equal(role.role, "viewer");
});
await check("ui.loading-and-real-api-outage", async () => {
  await page.route("**/rest/v1/companies?*", async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Outage sintético local" }),
    });
  });
  await page.goto("http://127.0.0.1:4180/companies");
  await page.getByRole("status").filter({ hasText: "Carregando cadastros" }).waitFor();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("button", { name: "Novo cadastro" }).isDisabled(), true);
  await page.unroute("**/rest/v1/companies?*");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await page.getByRole("button", { name: "Editar Alfa Homologação", exact: true }).waitFor();
});
await context.close();
for (const key of ["admin", "supervisor", "technician", "viewer"])
  await check(`ui.permissions.${key}`, async () => {
    const s = await session(key);
    try {
      await s.page.goto("http://127.0.0.1:4180/companies");
      await s.page.getByRole("heading", { name: "Empresas / Clientes", exact: true }).waitFor();
      assert.equal(
        await s.page.getByRole("button", { name: "Novo cadastro" }).count(),
        key === "viewer" ? 0 : 1,
      );
      const result = await s.page.evaluate(async () => {
        try {
          const mod = await import("/src/lib/admin-users.functions.ts");
          await mod.listAdminUsers();
          return { ok: true };
        } catch {
          return { ok: false };
        }
      });
      assert.equal(result.ok, key === "admin", "Server-function users access does not match role");
      if (key === "admin") {
        const denied = await s.page.evaluate(async (id) => {
          try {
            const mod = await import("/src/lib/admin-users.functions.ts");
            await mod.updateUser({ data: { userId: id, role: "technician" } });
            return false;
          } catch {
            return true;
          }
        }, fixtures.users.restricted.id);
        assert.equal(denied, true, "Non-primary admin changed role");
      }
    } finally {
      await s.context.close();
    }
  });
await check("ui.no-module.route-denied", async () => {
  const s = await session("restricted");
  try {
    await s.page.goto("http://127.0.0.1:4180/companies");
    await s.page.waitForURL(/\/tickets/);
    assert.equal(
      await s.page.getByRole("heading", { name: "Empresas / Clientes", exact: true }).count(),
      0,
    );
  } finally {
    await s.context.close();
  }
});
await browser.close();
writeFileSync(
  resolve(out, "ui-results.json"),
  JSON.stringify(
    { backend: "real local Supabase", results, blocked_external_hosts: [...new Set(external)] },
    null,
    2,
  ) + "\n",
);
console.log(
  "UI tests:",
  results.filter((r) => r.status === "passed").length,
  "passed;",
  results.filter((r) => r.status === "failed").length,
  "failed",
);
for (const r of results.filter((r) => r.status === "failed")) console.log(r.id, r.detail);

if (results.some((result) => result.status === "failed")) process.exitCode = 1;
