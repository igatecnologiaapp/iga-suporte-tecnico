import { expect, test } from "@playwright/test";

test("contato principal seleciona WhatsApp e desmarcar volta ao telefone, mantendo ambos", async ({
  page,
}) => {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Editar Contato 01", exact: true }).click();
  await page.getByLabel("Telefone", { exact: true }).fill("1133334444");
  await page.getByLabel("WhatsApp", { exact: true }).fill("11999999999");
  await page.getByLabel("Contato principal", { exact: true }).check();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr").first()).toContainText("(11) 99999-9999WhatsApp");
  await page.getByRole("button", { name: "Editar Contato 01", exact: true }).click();
  await page.getByLabel("Contato principal", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr").first()).toContainText("(11) 3333-4444");
  await expect(page.locator("tbody tr").first()).not.toContainText("WhatsApp");
  const row = await page.evaluate(() => window.testDatabase.contacts[0]);
  expect(row?.whatsapp).toBe("(11) 99999-9999");
  expect(row?.is_primary).toBe(false);
});

for (const [route, fields] of [
  ["companies", ["legal_name", "trade_name", "tax_id"]],
  ["contacts", ["company_id", "name"]],
  ["categories", ["name"]],
  ["technicians", ["user_id", "name", "email"]],
] as const)
  test(`somente campos obrigatórios recebem asterisco no cadastro ${route}`, async ({ page }) => {
    await page.goto(`/${route}`);
    await page.getByRole("button", { name: "Novo cadastro", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("[data-required-indicator]")).toHaveCount(fields.length);
    for (const id of fields) {
      const indicator = dialog.locator(`label[for="${id}"] + [data-required-indicator]`);
      await expect(indicator).toHaveText("*");
      await expect(indicator).toHaveAttribute("aria-hidden", "true");
    }
    await expect(dialog.locator('label[for="phone"] + [data-required-indicator]')).toHaveCount(0);
    await expect(
      dialog.locator('label[for="record-status"] + [data-required-indicator]'),
    ).toHaveCount(0);
    expect(await page.evaluate(() => window.testWrites)).toEqual([]);
  });

test("abertura de chamado marca somente empresa, contato, assunto e descrição", async ({
  page,
}) => {
  await page.goto("/tickets");
  await page.getByRole("button", { name: "Novo chamado", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("[data-required-indicator]")).toHaveCount(4);
  for (const id of ["company_id", "contact_id", "subject", "description"])
    await expect(dialog.locator(`label[for="${id}"] + [data-required-indicator]`)).toBeVisible();
  await expect(dialog.locator('label[for="category_id"] + [data-required-indicator]')).toHaveCount(
    0,
  );
});
