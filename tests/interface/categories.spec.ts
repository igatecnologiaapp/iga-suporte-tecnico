import { expect, test, type Page } from "@playwright/test";

/** Localiza a navegação compartilhada da listagem de categorias. */
const pager = (page: Page) =>
  page.getByRole("navigation", { name: "Paginação de Categorias de Chamados", exact: true });
/** Aplica pesquisa para alcançar um registro sem depender da posição na página. */
async function search(page: Page, name: string) {
  await page
    .getByRole("textbox", { name: "Pesquisar categorias por nome", exact: true })
    .fill(name);
  await expect(pager(page)).toContainText("1 a 1 de 1");
}

test("categorias mantêm totais completos e páginas de cinco com ícones e hierarquia", async ({
  page,
}) => {
  await page.goto("/categories?category-list");
  await expect(pager(page)).toContainText("1 a 5 de 14");
  await expect(page.getByRole("definition")).toHaveText(["14", "12", "2"]);
  await expect(page.getByRole("columnheader")).toHaveText([
    "Nome",
    "Tipo",
    "Categoria superior",
    "Status",
    "Ações",
  ]);
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await expect(page.locator("tbody tr").first().getByRole("cell").nth(1)).toHaveText("Categoria");
  await pager(page).getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(pager(page)).toContainText("6 a 10 de 14");
  await search(page, "Subcategoria Alfa");
  await expect(page.locator("tbody tr")).toContainText(
    "Subcategoria AlfaSubcategoriaSistema sintético",
  );
  await expect(
    page.getByRole("cell", { name: "Subcategoria Alfa", exact: true }).locator("svg"),
  ).toHaveCount(1);
  expect(
    (await page.evaluate(() => window.testPageReads)).some(
      (read) => read["_entity"] === "categories" && read["_page"] === 2 && read["_page_size"] === 5,
    ),
  ).toBe(true);
});

test("ordenação e situação usam consultas e limpar preserva a situação rápida", async ({
  page,
}) => {
  await page.goto("/categories?category-list");
  await expect(pager(page)).toContainText("1 a 5 de 14");
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Filtros de categorias", exact: true });
  await panel.getByLabel("Ordenar por", { exact: true }).selectOption("name_desc");
  await expect(page.locator("tbody tr").first()).toContainText("Z Principal arquivada");
  await panel.getByRole("button", { name: "Concluir", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Pesquisar categorias por nome", exact: true })
    .fill("Categoria 0");
  await expect(pager(page)).toContainText("1 a 5 de 8");
  await expect(page.getByRole("button", { name: "Todas 8", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Inativas / Arquivadas 1", exact: true }).click();
  await expect(page.locator("tbody tr")).toContainText("Categoria 08");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(pager(page)).toContainText("1 a 2 de 2");
  await expect(
    page.getByRole("button", { name: "Inativas / Arquivadas 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await expect(page.getByRole("definition")).toHaveText(["14", "12", "2"]);
});

test("editar subcategoria preserva o vínculo atual inclusive com categoria superior arquivada", async ({
  page,
}) => {
  await page.goto("/categories?category-list");
  await search(page, "Filha de arquivada");
  await expect(page.locator("tbody tr")).toContainText("Z Principal arquivadaInativa / arquivada");
  await expect(page.locator("tbody .category-chip")).toHaveAttribute(
    "data-category-color",
    "#8b5cf6",
  );
  const before = await page.evaluate(() => window.testDatabase.company_ticket_categories);
  await page.getByRole("button", { name: "Editar Filha de arquivada", exact: true }).click();
  const select = page.getByLabel("Categoria superior (opcional)", { exact: true });
  await expect(select).toHaveValue("cat-archived");
  await expect(page.getByRole("dialog").locator("[data-required-indicator]")).toHaveCount(1);
  await page.getByLabel("Nome", { exact: true }).fill("Filha de arquivada revisada");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr")).toContainText("Filha de arquivada revisada");
  expect(
    await page.evaluate(
      () =>
        window.testDatabase.ticket_categories.find((row) => row.id === "sub-archived-parent")
          ?.parent_id,
    ),
  ).toBe("cat-archived");
  expect(await page.evaluate(() => window.testDatabase.company_ticket_categories)).toEqual(before);
});

for (const width of [360, 1440])
  for (const dark of [false, true])
    test(`categorias cabem na tela ${width}px tema escuro=${dark} e respeitam perfil de visualização`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/categories?category-list&viewer");
      await expect(pager(page)).toContainText("1 a 5 de 14");
      if (dark) await page.getByRole("button", { name: "Ativar modo escuro", exact: true }).click();
      if (width === 360)
        await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
      await expect(
        page.getByRole("link", { name: "Categorias de Chamados", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      if (width === 360) await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", {
          name: /^Editar |^Arquivar |^Excluir |^Restaurar |^Novo cadastro$/,
        }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await expect(pager(page).getByRole("combobox")).toHaveCount(0);
      await page.screenshot({
        path: `/tmp/iga-categories-${width}-${dark ? "dark" : "light"}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Filtros", exact: true }).click();
      const panel = page.getByRole("dialog", { name: "Filtros de categorias", exact: true });
      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Filtros", exact: true })).toBeFocused();
      expect(await page.evaluate(() => window.testWrites)).toEqual([]);
    });

test("paleta salva cores próprias e empresas apresentam cada pai antes de seus filhos", async ({
  page,
}) => {
  await page.goto("/categories");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Editar Sistema sintético", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("group", { name: "Cor da categoria", exact: true }).getByRole("button"),
  ).toHaveCount(7);
  await dialog.getByRole("button", { name: "Cor amarelo", exact: true }).click();
  await expect(
    dialog.getByLabel("Prévia da categoria").locator("[data-category-color]"),
  ).toHaveAttribute("data-category-color", "#eab308");
  await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator("tbody .category-chip").filter({ hasText: "Sistema sintético" }),
  ).toHaveAttribute("data-category-color", "#eab308");
  await page.getByRole("button", { name: "Editar Subcategoria Alfa", exact: true }).click();
  await page.getByRole("button", { name: "Cor roxo", exact: true }).click();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Empresas / Clientes", exact: true }).click();
  const chips = page
    .locator("tbody tr")
    .filter({ hasText: "Empresa Alfa" })
    .locator(".category-chip");
  await expect(chips).toHaveText([
    "Sistema sintético — Padrão",
    "Subcategoria Alfa",
    "Treinamento sintético",
  ]);
  await expect(chips.nth(0)).toHaveAttribute("data-category-color", "#eab308");
  await expect(chips.nth(1)).toHaveAttribute("data-category-color", "#8b5cf6");
});

test("novo cadastro oferece sete cores abaixo do nome e conserva a escolha ao editar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/categories");
  await page.getByRole("button", { name: "Novo cadastro", exact: true }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Comercial");
  await page.getByRole("button", { name: "Cor rosa", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cor rosa", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({ path: "/tmp/iga-category-palette-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Editar Comercial", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cor rosa", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Categoria superior (opcional)", { exact: true })).toHaveValue("");
});
