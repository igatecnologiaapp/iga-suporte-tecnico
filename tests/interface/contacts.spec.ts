import { expect, test, type Page } from "@playwright/test";

const pager = (page: Page) => page.getByRole("navigation", { name: "Paginação de Contatos" });
async function filters(page: Page) {
  await page.getByRole("button", { name: /^Filtros/ }).click();
  const panel = page.getByRole("dialog", { name: "Filtros de contatos", exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

test("contacts display linked company, email, job title and phone without inventing missing values", async ({
  page,
}) => {
  await page.goto("/contacts?admin");
  await expect(pager(page)).toContainText("1 a 5 de 11");
  const summary = page.getByRole("definition");
  await expect(summary).toHaveText(["12", "11", "1"]);
  const first = page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: "Editar Contato 01", exact: true }) });
  await expect(first).toContainText("contact1@iga-test.example");
  await expect(first).toContainText("Alfa Sintética");
  await expect(first).toContainText("Proprietário");
  await expect(first).toContainText("(11) 90000-0001");
  const second = page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: "Editar Contato 02", exact: true }) });
  await expect(second).toContainText("(11) 90000-0002WhatsApp");
  await expect(second.getByRole("cell").nth(2)).toHaveText("—");
  await expect(page.getByRole("columnheader")).toHaveText([
    "Contato",
    "Empresa",
    "Cargo / Função",
    "Telefone",
    "Status",
    "Ações",
  ]);
  expect(
    (await page.evaluate(() => window.testPageReads)).every((read) => read["_page_size"] === 5),
  ).toBe(true);
  expect(
    (await page.evaluate(() => window.testPageReads)).some(
      (read) => read["_rpc"] === "list_paged_contacts",
    ),
  ).toBe(true);
});

test("company and status filters share full counters, include archived companies and preserve selected status on clear", async ({
  page,
}) => {
  await page.goto("/contacts");
  await expect(pager(page)).toContainText("1 a 5 de 11");
  await pager(page).getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(pager(page)).toContainText("6 a 10 de 11");
  const panel = await filters(page);
  await panel.getByLabel("Empresa", { exact: true }).selectOption("company-b");
  await expect(pager(page)).toContainText("1 a 3 de 3");
  await expect(page.getByRole("button", { name: "Todos 3", exact: true })).toBeVisible();
  await expect(page.getByRole("definition")).toHaveText(["12", "11", "1"]);
  await panel.getByLabel("Empresa", { exact: true }).selectOption("company-c");
  await expect(pager(page)).toContainText("1 a 1 de 1");
  await expect(page.locator("tbody")).toContainText("Arquivo SintéticoInativa / arquivada");
  await panel.getByRole("button", { name: "Concluir", exact: true }).click();
  await page.getByRole("button", { name: "Inativos / Arquivados 1", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Contato 12");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Inativos / Arquivados 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Todos 12", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.testWrites)).toEqual([]);
});

test("contact sorting and phone/email searches run before pagination", async ({ page }) => {
  await page.goto("/contacts");
  await expect(pager(page)).toContainText("1 a 5 de 11");
  const panel = await filters(page);
  await panel.getByLabel("Ordenar por", { exact: true }).selectOption("name_desc");
  await expect(page.locator("tbody tr").first()).toContainText("Contato 11");
  await panel.getByRole("button", { name: "Concluir", exact: true }).click();
  const search = page.getByRole("textbox", {
    name: "Pesquisar contatos por nome, telefone ou e-mail",
  });
  await search.fill("contact8@");
  await expect(pager(page)).toContainText("1 a 1 de 1");
  await expect(page.locator("tbody")).toContainText("Contato 08");
  await search.fill("90000-0001");
  await expect(page.locator("tbody")).toContainText("Contato 01");
  await search.fill("11900000001");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const read = window.testPageReads.at(-1);
        return (read?.["_filters"] as Record<string, string> | undefined)?.["search"];
      }),
    )
    .toBe("11900000001");
  await expect(pager(page)).toContainText("1 a 1 de 1");
  await expect(page.locator("tbody")).toContainText("Contato 01");
  await search.fill("Contato inexistente");
  await expect(page.getByRole("status")).toContainText("Nenhum cadastro encontrado");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(page.locator("tbody tr").first()).toContainText("Contato 01");
});

test("editing a contact preserves inactive company and optional fields", async ({ page }) => {
  await page.goto("/contacts");
  await expect(pager(page)).toContainText("1 a 5 de 11");
  const panel = await filters(page);
  await panel.getByLabel("Empresa", { exact: true }).selectOption("company-c");
  await panel.getByRole("button", { name: "Concluir", exact: true }).click();
  await page.getByRole("button", { name: "Editar Contato 11", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Empresa / Cliente")).toHaveValue("company-c");
  await dialog.getByLabel("Cargo / Função").fill("Gerente");
  await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Gerente");
  const row = await page.evaluate(() => window.testDatabase.contacts[10]);
  expect(row?.company_id).toBe("company-c");
  expect(row?.email).toBe("contact11@iga-test.example");
});

for (const width of [360, 1440])
  for (const dark of [false, true])
    test(`contacts layout and filters fit ${width}px dark=${dark}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/contacts?viewer");
      await expect(pager(page)).toContainText("1 a 5 de 11");
      if (dark) await page.getByRole("button", { name: "Ativar modo escuro", exact: true }).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await expect(pager(page).getByRole("combobox")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Editar |^Arquivar |^Excluir / })).toHaveCount(
        0,
      );
      await page.screenshot({
        path: `/tmp/iga-contacts-${width}-${dark ? "dark" : "light"}.png`,
        fullPage: true,
        animations: "disabled",
      });
      const panel = await filters(page);
      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await expect(panel.getByLabel("Empresa", { exact: true })).toBeVisible();
      await expect(panel.getByText("Tipo de contato", { exact: true })).toHaveCount(0);
      await page.screenshot({
        path: `/tmp/iga-contacts-filters-${width}-${dark ? "dark" : "light"}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /^Filtros/ })).toBeFocused();
    });
