/** Área: Entrada em todos os registros, títulos destacados e filtros reais de tipo. */
import { expect, test } from "@playwright/test";

for (const [path, label, total] of [
  ["companies", "Todas", 13],
  ["contacts", "Todos", 12],
  ["categories", "Todas", 14],
] as const)
  test(`${path} inicia sem restringir a situação e destaca os títulos`, async ({ page }) => {
    await page.goto(`/${path}?pagination&category-list`);
    await expect(
      page.getByRole("button", { name: `${label} ${total}`, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page
        .getByRole("heading", { level: 1 })
        .evaluate((el) => Number(getComputedStyle(el).fontWeight)),
    ).toBeGreaterThanOrEqual(700);
    expect(
      await page
        .locator("header p")
        .first()
        .evaluate((el) => Number(getComputedStyle(el).fontWeight)),
    ).toBeGreaterThanOrEqual(700);
    await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
    expect((await page.evaluate(() => window.testPageReads)).at(-1)?.["_filters"]).toMatchObject({
      status: "all",
    });
  });

test("tipo filtra no banco, combina pesquisa e situação e limpar restaura ambos os tipos", async ({
  page,
}) => {
  await page.goto("/categories?category-list");
  const pager = page.getByRole("navigation", { name: "Paginação de Categorias de Chamados" });
  await expect(pager).toContainText("1 a 5 de 14");
  await pager.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(pager).toContainText("6 a 10 de 14");
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByLabel("Exibir", { exact: true }).selectOption("category");
  await expect(pager).toContainText("1 a 5 de 11");
  await page.getByLabel("Exibir", { exact: true }).selectOption("subcategory");
  await expect(pager).toContainText("1 a 3 de 3");
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Todas 3", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page
      .locator("tbody tr")
      .getByRole("cell")
      .filter({ hasText: /^Subcategoria$/ }),
  ).toHaveCount(3);
  await page
    .getByRole("textbox", { name: "Pesquisar categorias por nome", exact: true })
    .fill("Subcategoria");
  await expect(pager).toContainText("1 a 2 de 2");
  await page.getByRole("button", { name: "Inativas / Arquivadas 0", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Nenhum cadastro encontrado");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(pager).toContainText("1 a 2 de 2");
  await expect(
    page.getByRole("button", { name: "Inativas / Arquivadas 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    (await page.evaluate(() => window.testPageReads)).some(
      (read) =>
        read["_rpc"] === "list_paged_categories" &&
        (read["_filters"] as Record<string, string>)["type"] === "subcategory",
    ),
  ).toBe(true);
});

test("técnicos e chamados de técnico também começam em todos", async ({ page }) => {
  await page.goto("/technicians");
  await expect(page.getByLabel("Mostrar arquivados")).toBeChecked();
  await page.goto("/tickets?technician");
  await expect(page.getByRole("tab", { name: /^Todos/ })).toHaveAttribute("aria-selected", "true");
});

test("voltar a um cadastro começa novamente em todas as situações", async ({ page }) => {
  await page.goto("/companies");
  await page.getByRole("button", { name: /^Inativas \/ Arquivadas / }).click();
  await page.getByRole("link", { name: "Contatos", exact: true }).click();
  await page.getByRole("link", { name: "Empresas / Clientes", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Todas / })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
