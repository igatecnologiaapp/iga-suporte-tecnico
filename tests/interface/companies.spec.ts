import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const screenshots = fileURLToPath(new URL("../../docs/phase-1/screenshots/", import.meta.url));
const requests = new WeakMap<Page, string[]>();
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ context, page }) => {
  requests.set(page, []);
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    requests.get(page)!.push(url.hostname);
    return route.abort("blockedbyclient");
  });
});
test.afterEach(async ({ page }) => {
  expect(requests.get(page)).toEqual([]);
  expect(errors.get(page)).toEqual([]);
});
/** Abre o recorte ativo dos cenários existentes; a entrada em Todas tem cobertura própria. */
async function visitActive(page: Page, url: string) {
  await page.goto(url);
  if (!url.includes("error") && !url.includes("loading"))
    await page.getByRole("button", { name: /^Ativas / }).click();
}
async function openCompany(page: Page, name = "Alfa Sintética") {
  await visitActive(page, "/companies");
  await page.getByRole("button", { name: `Editar ${name}`, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
const domainLabel = "Domínio (opcional, texto livre)";
test("searches by domain and preserves normalized display links for archived records", async ({
  page,
}) => {
  await visitActive(page, "/companies");
  const search = page.getByRole("textbox", {
    name: "Pesquisar empresas por nome, documento ou domínio",
  });
  await search.fill("ALFA.EXAMPLE");
  await expect(page.getByRole("link", { name: "alfa.example", exact: true })).toHaveAttribute(
    "href",
    "https://alfa.example",
  );
  await expect(page.getByRole("button", { name: "Editar Beta Sintética" })).toHaveCount(0);
  await search.fill("ARQUIVO.EXAMPLE");
  await expect(page.getByRole("status")).toContainText("Nenhum cadastro encontrado");
  await page.getByRole("button", { name: /^Todas / }).click();
  await expect(
    page.getByRole("link", { name: "HTTPS://WWW.ARQUIVO.EXAMPLE/path" }),
  ).toHaveAttribute("href", "https://arquivo.example");
});
test("editing another field preserves domain and all parent/child/default links", async ({
  page,
}) => {
  await openCompany(page);
  await expect(page.getByLabel(domainLabel)).toHaveValue("alfa.example");
  await expect(page.getByLabel(domainLabel)).not.toHaveAttribute("required");
  await expect(page.getByLabel("Sistema sintético", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Subcategoria Alfa", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Treinamento sintético", { exact: true })).toBeChecked();
  await page.getByLabel("Nome Fantasia", { exact: true }).fill("Alfa Atualizada");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const state = await page.evaluate(() => ({ db: window.testDatabase, writes: window.testWrites }));
  expect(state.db.companies[0]!.domain).toBe("alfa.example");
  expect(state.db.companies[0]!.trade_name).toBe("Alfa Atualizada");
  expect(state.db.company_ticket_categories).toHaveLength(3);
  expect(
    state.db.company_ticket_categories.find((row) => row.category_id === "cat-a")!.is_default,
  ).toBe(true);
  expect(state.db.company_ticket_categories.some((row) => row.category_id === "sub-a")).toBe(true);
  expect(state.db.ticket_categories.find((row) => row.id === "sub-a")!.parent_id).toBe("cat-a");
  expect(
    state.writes.every((write) => ["companies", "company_ticket_categories"].includes(write.table)),
  ).toBe(true);
});
test("omitting domain from the actual form cannot erase the existing value", async ({ page }) => {
  await openCompany(page);
  await page.getByLabel(domainLabel).evaluate((element) => element.remove());
  await page.getByLabel("Nome Fantasia", { exact: true }).fill("Alfa com campo omitido");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.testDatabase.companies[0]!.domain)).toBe("alfa.example");
});
test("keeps free-text storage without applying link normalization during saving", async ({
  page,
}) => {
  await openCompany(page, "Beta Sintética");
  await expect(page.getByLabel(domainLabel)).toHaveValue("Sem site / interno");
  await page.getByLabel("Nome Fantasia", { exact: true }).fill("Beta Atualizada");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.testDatabase.companies[1]!.domain)).toBe(
    "Sem site / interno",
  );
  await expect(page.getByRole("link", { name: "Sem site / interno" })).toHaveCount(0);
});
test("preserves raw URL when only another field is edited", async ({ page }) => {
  await visitActive(page, "/companies");
  await page.getByRole("button", { name: /^Todas / }).click();
  await page.getByRole("button", { name: "Editar Arquivo Sintético" }).click();
  await page.getByLabel("Nome Fantasia", { exact: true }).fill("Arquivo Atualizado");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.testDatabase.companies[2]!.domain)).toBe(
    "HTTPS://WWW.ARQUIVO.EXAMPLE/path",
  );
});
test("duplicate domain outside the filtered page remains an informational warning", async ({
  page,
}) => {
  await visitActive(page, "/companies");
  await page
    .getByRole("textbox", { name: "Pesquisar empresas por nome, documento ou domínio" })
    .fill("Beta");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Editar Beta Sintética", exact: true }).click();
  await page.getByLabel(domainLabel).fill(" alfa.example ");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(
    page.getByText("Atenção: o domínio alfa.example já está cadastrado em Alfa Sintética."),
  ).toBeVisible();
  expect(await page.evaluate(() => window.testDatabase.companies[1]!.domain)).toBe("alfa.example");
});
test("explicit clearing and creation without domain remain allowed", async ({ page }) => {
  await openCompany(page);
  await page.getByLabel(domainLabel).clear();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.testDatabase.companies[0]!.domain)).toBeNull();
  const clearedRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }) });
  await expect(clearedRow).toBeVisible();
  await expect(clearedRow).not.toContainText("Domínio:");
  await page.getByRole("button", { name: "Novo cadastro" }).click();
  await page.getByLabel("Razão Social", { exact: true }).fill("Nova Empresa Sintética");
  await page.getByLabel("Nome Fantasia", { exact: true }).fill("Nova Sintética");
  await page.getByLabel("CNPJ/CPF").fill("00000000000400");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => window.testDatabase.companies.find((row) => row.id === "synthetic-new")!.domain,
    ),
  ).toBeNull();
  const newRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: "Editar Nova Sintética", exact: true }) });
  await expect(newRow).toBeVisible();
  await expect(newRow).not.toContainText("Domínio:");
});
test("filters by linked subcategory and preserves one default main category", async ({ page }) => {
  await visitActive(page, "/companies");
  await page.getByRole("combobox", { name: "Filtrar por categoria" }).selectOption("sub-a");
  await expect(page.getByRole("button", { name: "Editar Beta Sintética" })).toHaveCount(0);
  await page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }).click();
  await page.getByLabel("Padrão", { exact: true }).nth(1).check();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const links = await page.evaluate(() => window.testDatabase.company_ticket_categories);
  expect(links.filter((row) => row.is_default)).toHaveLength(1);
  expect(links.find((row) => row.category_id === "cat-b")!.is_default).toBe(true);
  expect(links.some((row) => row.category_id === "sub-a")).toBe(true);
});
test("unselecting a parent clears its child links and previous default as before", async ({
  page,
}) => {
  await openCompany(page);
  await page.getByLabel("Sistema sintético", { exact: true }).uncheck();
  await expect(page.getByLabel("Subcategoria Alfa", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Subcategoria Alfa", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const links = await page.evaluate(() => window.testDatabase.company_ticket_categories);
  expect(links.map((row) => row.category_id)).toEqual(["cat-b"]);
  expect(links[0]!.is_default).toBe(false);
});
test("viewer cannot edit or see unavailable modules", async ({ page }) => {
  await visitActive(page, "/companies?viewer");
  await expect(page.getByRole("link", { name: "alfa.example", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo cadastro" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar Alfa Sintética" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Chamados", exact: true })).toHaveCount(0);
});
for (const query of ["error", "error&category-error"])
  test(`failure blocks editing and retry recovers (${query})`, async ({ page }) => {
    await visitActive(page, `/companies?${query}`);
    await expect(page.getByRole("alert")).toContainText("Não foi possível carregar");
    await expect(page.getByRole("button", { name: "Novo cadastro" })).toBeDisabled();
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(page.getByRole("link", { name: "alfa.example", exact: true })).toBeVisible();
  });
test("loading is distinguishable from empty results", async ({ page }) => {
  await visitActive(page, "/companies?loading&empty");
  await expect(page.getByRole("status")).toContainText("Carregando cadastros");
  await expect(page.getByRole("status")).toContainText("Nenhum cadastro encontrado", {
    timeout: 10000,
  });
});
for (const width of [360, 768, 1440])
  for (const theme of ["light", "dark"])
    test(`responsive list and form ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("iga-theme", value), theme);
      await visitActive(page, "/companies");
      await expect(page.getByRole("link", { name: "alfa.example", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.getByRole("button", { name: /^Todas / }).click();
      await page.screenshot({
        path: `/tmp/iga-company-list-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: /^Mais filtros/ }).click();
      const panel = page.getByRole("dialog", { name: "Mais filtros de empresas" });
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      expect(panelBox!.x).toBeGreaterThanOrEqual(0);
      expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: `/tmp/iga-company-filters-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /^Mais filtros/ })).toBeFocused();
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: `${screenshots}/companies-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
      if (width === 360) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole("button", { name: "Abrir menu" }).click();
        await expect(page.getByRole("dialog", { name: "Menu IGA Service" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
      }
      await page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }).click();
      await expect(page.getByLabel(domainLabel)).toHaveValue("alfa.example");
      const box = await page.getByRole("dialog").boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: `${screenshots}/company-form-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.getByLabel("Subcategoria Alfa", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${screenshots}/company-categories-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
    });
test("theme persists and compact navigation has an accessible current item", async ({ page }) => {
  await visitActive(page, "/companies");
  await page.getByRole("button", { name: "Ativar modo escuro" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await expect(
    page.getByRole("link", { name: "Empresas / Clientes", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
test("dialog keyboard focus stays inside and returns to edit trigger", async ({ page }) => {
  await openCompany(page);
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 35; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }),
  ).toBeFocused();
});
test("new dialog returns focus without writing on cancel", async ({ page }) => {
  await visitActive(page, "/companies");
  const trigger = page.getByRole("button", { name: "Novo cadastro" });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => window.testWrites.length)).toBe(0);
});

for (const editing of [false, true])
  test(`duplicate CNPJ/CPF keeps ${editing ? "edited" : "new"} form and category data intact`, async ({
    page,
  }) => {
    await visitActive(page, "/companies");
    const original = await page.evaluate(() => JSON.stringify(window.testDatabase));
    if (editing)
      await page.getByRole("button", { name: "Editar Beta Sintética", exact: true }).click();
    else await page.getByRole("button", { name: "Novo cadastro", exact: true }).click();
    await page.getByLabel("Razão Social", { exact: true }).fill("Empresa em conferência");
    await page.getByLabel("Nome Fantasia", { exact: true }).fill("Dados preservados");
    // The archived company must also keep its unique document protected.
    await page.getByLabel("CNPJ/CPF").fill("00000000000300");
    await page
      .getByRole("button", { name: editing ? "Salvar alterações" : "Salvar", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Este CNPJ/CPF já está cadastrado");
    await expect(page.getByLabel("CNPJ/CPF")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("CNPJ/CPF")).toBeFocused();
    await expect(page.getByLabel("Nome Fantasia", { exact: true })).toHaveValue(
      "Dados preservados",
    );
    expect(await page.evaluate(() => JSON.stringify(window.testDatabase))).toBe(original);
    expect(
      await page.evaluate(() => window.testWrites.some((write) => write.table !== "companies")),
    ).toBe(false);
    await page.getByLabel("CNPJ/CPF").fill(editing ? "00000000000200" : "00000000000400");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page
      .getByRole("button", { name: editing ? "Salvar alterações" : "Salvar", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

for (const conflict of ["duplicate-tax-id", "other-unique"])
  test(`server conflict ${conflict} is specific only for the document constraint`, async ({
    page,
  }) => {
    await visitActive(page, `/companies?${conflict}`);
    await page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }).click();
    await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    if (conflict === "duplicate-tax-id")
      await expect(page.getByRole("alert")).toContainText("Este CNPJ/CPF já está cadastrado");
    else {
      await expect(
        page.getByText("Não foi possível salvar a empresa. Confira os dados e tente novamente."),
      ).toBeVisible();
      await expect(
        page.getByText("Este CNPJ/CPF já está cadastrado", { exact: false }),
      ).toHaveCount(0);
    }
    await expect(page.getByText(/companies_tax_id_key|unrelated_key/)).toHaveCount(0);
  });

for (const width of [360, 1440])
  for (const theme of ["light", "dark"])
    test(`delete hover and keyboard focus are red, confirmation fits ${width}px ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem("iga-theme", value), theme);
      await visitActive(page, "/companies?admin");
      const button = page.getByRole("button", { name: "Excluir Alfa Sintética", exact: true });
      const originalColor = await button.evaluate((element) => getComputedStyle(element).color);
      await button.hover();
      await expect(button).not.toHaveCSS("color", originalColor);
      await page.mouse.move(0, 0);
      await page.keyboard.press("Tab");
      await button.focus();
      expect(await button.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
      await expect(button).not.toHaveCSS("color", originalColor);
      await button.click();
      const dialog = page.getByRole("dialog", { name: "Excluir registro?" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Confirmar", exact: true })).toBeDisabled();
      await page.screenshot({
        path: `/tmp/iga-delete-confirmation-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      expect(await page.evaluate(() => window.testWrites.length)).toBe(0);
    });

for (const width of [360, 1440])
  for (const theme of ["light", "dark"])
    test(`logout cancellation preserves the session and focus at ${width}px ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem("iga-theme", value), theme);
      await visitActive(page, "/companies");
      if (width === 360)
        await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
      const trigger = page.getByRole("button", { name: "Sair da conta", exact: true });
      await trigger.click();
      const dialog = page.getByRole("alertdialog", { name: "Sair da conta?", exact: true });
      await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: `/tmp/iga-logout-confirmation-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      expect(await page.evaluate(() => window.testSignOutCalls ?? 0)).toBe(0);
      await expect(page).toHaveURL(/\/companies$/);
    });

test("logout waits for explicit confirmation and blocks duplicate calls", async ({ page }) => {
  await visitActive(page, "/companies?logout-delay");
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  expect(await page.evaluate(() => window.testSignOutCalls ?? 0)).toBe(0);
  await page.getByRole("alertdialog").getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saindo…", exact: true })).toBeDisabled();
  await expect(page.getByText("Login sintético", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.testSignOutCalls)).toBe(1);
});

test("logout failure stays on the page with an explanation and allows retry", async ({ page }) => {
  await visitActive(page, "/companies?logout-error");
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByText("Não foi possível sair da conta. Tente novamente.")).toBeVisible();
  await expect(page).toHaveURL(/\/companies\?logout-error$/);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByText("Login sintético", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.testSignOutCalls)).toBe(2);
});

test("status counts and listing share search/category scope without changing records", async ({
  page,
}) => {
  await visitActive(page, "/companies");
  const group = page.getByRole("group", { name: "Filtrar empresas por situação" });
  await expect(group.getByRole("button", { name: "Ativas 3", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(group.getByRole("button", { name: "Todas 4", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await group.getByRole("button", { name: "Inativas / Arquivadas 1", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar Arquivo Sintético", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Inativo / Arquivado");
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Todas / }).click();
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Pesquisar empresas por nome, documento ou domínio" })
    .fill("alfa");
  await page.getByRole("combobox", { name: "Filtrar por categoria" }).selectOption("sub-a");
  await expect(group.getByRole("button", { name: "Todas 1", exact: true })).toBeVisible();
  await expect(group.getByRole("button", { name: "Ativas 1", exact: true })).toBeVisible();
  await expect(
    group.getByRole("button", { name: "Inativas / Arquivadas 0", exact: true }),
  ).toBeVisible();
  await group.getByRole("button", { name: "Inativas / Arquivadas 0", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Nenhum cadastro encontrado");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await expect(
    group.getByRole("button", { name: "Inativas / Arquivadas 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Filtrar por categoria" })).toHaveValue("");
  expect(await page.evaluate(() => window.testWrites.length)).toBe(0);
});

test("advanced domain filters combine with status and restore natural name ordering", async ({
  page,
}) => {
  await visitActive(page, "/companies");
  await page.getByRole("button", { name: /^Todas / }).click();
  await page.getByRole("button", { name: /^Mais filtros/ }).click();
  const panel = page.getByRole("dialog", { name: "Mais filtros de empresas" });
  await panel.getByLabel("Domínio", { exact: true }).selectOption("missing");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Cliente sem domínio");
  await panel.getByLabel("Domínio", { exact: true }).selectOption("present");
  await panel.getByLabel("Ordenar por").selectOption("name_desc");
  await panel.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.locator("tbody tr td:first-child")).toHaveText([
    "Beta Sintética",
    "Arquivo Sintético",
    "Alfa Sintética",
  ]);
  await expect(page.getByRole("button", { name: /^Mais filtros/ })).toContainText("2");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Todas 4", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("tbody tr td:first-child")).toHaveText([
    "Alfa Sintética",
    "Arquivo Sintético",
    "Beta Sintética",
    "Cliente sem domínio",
  ]);
  expect(await page.evaluate(() => window.testDatabase.companies[1]!.domain)).toBe(
    "Sem site / interno",
  );
  expect(await page.evaluate(() => window.testWrites.length)).toBe(0);
});

test("creation-date sorting and viewer filters never grant editing access", async ({ page }) => {
  await visitActive(page, "/companies?viewer");
  await page.getByRole("button", { name: /^Todas / }).click();
  await page.getByRole("button", { name: /^Mais filtros/ }).click();
  await page.getByLabel("Ordenar por").selectOption("newest");
  await expect(page.locator("tbody tr td:first-child")).toHaveText([
    "Cliente sem domínio",
    "Beta Sintética",
    "Alfa Sintética",
    "Arquivo Sintético",
  ]);
  await page.getByLabel("Ordenar por").selectOption("oldest");
  await expect(page.locator("tbody tr td:first-child")).toHaveText([
    "Arquivo Sintético",
    "Alfa Sintética",
    "Beta Sintética",
    "Cliente sem domínio",
  ]);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /^Editar |^Excluir |^Arquivar |^Restaurar / }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Novo cadastro", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.testWrites.length)).toBe(0);
});
