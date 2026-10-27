import { expect, test } from "@playwright/test";

test("company pages request five rows and preserve full totals", async ({ page }) => {
  await page.goto("/companies?pagination");
  const pager = page.getByRole("navigation", { name: "Paginação de Empresas / Clientes" });
  await expect(pager).toContainText("Mostrando 1 a 5 de 12 registros");
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Ativas 12", exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("cell", { name: "Alfa Sintética", exact: true })
      .locator('[aria-hidden="true"] svg'),
  ).toHaveCount(1);
  await pager.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(pager).toContainText("Mostrando 6 a 10 de 12 registros");
  await pager.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(pager).toContainText("Mostrando 11 a 12 de 12 registros");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(pager.getByRole("button", { name: "Próxima página", exact: true })).toBeDisabled();
  await expect(pager.getByRole("combobox")).toHaveCount(0);
  await pager.getByRole("button", { name: "Página anterior", exact: true }).click();
  await expect(pager).toContainText("Mostrando 6 a 10 de 12 registros");
  await expect(page.locator("tbody tr")).toHaveCount(5);
  const reads = await page.evaluate(() => window.testPageReads);
  expect(reads.some((read) => read["_page"] === 3 && read["_page_size"] === 5)).toBe(true);
  expect(
    (await page.evaluate(() => window.testPageResponses)).every(
      (result) => Number(result["rowCount"]) <= Number(result["_page_size"]),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.testWrites.length)).toBe(0);
});

test("search and status reset the remote page while clear keeps the selected status", async ({
  page,
}) => {
  await page.goto("/companies?pagination");
  const pager = page.getByRole("navigation", { name: "Paginação de Empresas / Clientes" });
  await expect(pager).toContainText("1 a 5 de 12");
  await pager.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(pager).toContainText("6 a 10 de 12");
  await page
    .getByRole("textbox", { name: "Pesquisar empresas por nome, documento ou domínio" })
    .fill("Alfa");
  await expect(pager).toContainText("1 a 1 de 1");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: /^Inativas \/ Arquivadas / }).click();
  await expect(page.getByRole("status")).toContainText("Nenhum cadastro encontrado");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(pager).toContainText("1 a 1 de 1");
  await expect(
    page.getByRole("button", { name: "Inativas / Arquivadas 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("contacts have a person icon, server pages and viewer-safe controls", async ({ page }) => {
  await page.goto("/contacts?viewer");
  const pager = page.getByRole("navigation", { name: "Paginação de Contatos" });
  await expect(pager).toContainText("1 a 5 de 11");
  await expect(
    page.getByRole("cell", { name: /^Contato 01/ }).locator('[aria-hidden="true"] svg'),
  ).toHaveCount(1);
  await pager.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(pager).toContainText("6 a 10 de 11");
  await expect(page.getByRole("button", { name: /^Editar |^Arquivar |^Excluir / })).toHaveCount(0);
  expect(
    (await page.evaluate(() => window.testPageReads)).some(
      (read) => read["_entity"] === "contacts" && read["_page"] === 2,
    ),
  ).toBe(true);
});

test("ticket pages preserve queue totals and the own-technician queue", async ({ page }) => {
  await page.goto("/tickets?technician");
  const pager = page.getByRole("navigation", { name: "Paginação de Chamados" });
  await expect(pager).toContainText("1 a 5 de 6");
  await expect(page.getByRole("tab", { name: "Todos 12", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Meus chamados 6", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await pager.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(pager).toContainText("6 a 6 de 6");
  await page.getByRole("tab", { name: "Todos 12", exact: true }).click();
  await expect(pager).toContainText("1 a 5 de 12");
  await page.getByRole("tab", { name: "Resolvidos 6", exact: true }).click();
  await expect(pager).toContainText("1 a 5 de 6");
  await expect(page.locator("tbody tr")).toHaveCount(5);
});

test("old page response cannot replace a newer search", async ({ page }) => {
  await page.goto("/companies?pagination&page-race");
  const pager = page.getByRole("navigation", { name: "Paginação de Empresas / Clientes" });
  await expect(pager).toContainText("1 a 5 de 12");
  await pager.getByRole("button", { name: "Próxima página", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Pesquisar empresas por nome, documento ou domínio" })
    .fill("Alfa");
  await expect(pager).toContainText("1 a 1 de 1");
  await expect
    .poll(() =>
      page.evaluate(() => window.testPageResponses.some((result) => result["_page"] === 2)),
    )
    .toBe(true);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Alfa Sintética");
});

test("page failure offers retry instead of showing stale records", async ({ page }) => {
  await page.goto("/companies?pagination&page-failure");
  const pager = page.getByRole("navigation", { name: "Paginação de Empresas / Clientes" });
  await expect(pager).toContainText("1 a 5 de 12");
  await pager.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(pager).toContainText("6 a 10 de 12");
});

for (const width of [360, 1440])
  test(`header slides away down and returns up with reduced motion at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 650 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/companies?pagination");
    await expect(
      page.getByRole("navigation", { name: "Paginação de Empresas / Clientes" }),
    ).toContainText("1 a 5 de 12");
    const header = page.getByRole("banner");
    await page.evaluate(() => window.scrollTo(0, 280));
    await expect(header).toHaveAttribute("data-hidden", "true");
    await expect(header).not.toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 200));
    await expect(header).toHaveAttribute("data-hidden", "false");
    await expect(header).toBeInViewport();
    expect(
      await header.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration)),
    ).toBeLessThan(0.001);
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect(header).toHaveAttribute("data-hidden", "true");
    await page.getByRole("button", { name: "Ativar modo escuro", exact: true }).focus();
    await expect(header).toHaveAttribute("data-hidden", "false");
    await expect(header).toBeInViewport();
  });
