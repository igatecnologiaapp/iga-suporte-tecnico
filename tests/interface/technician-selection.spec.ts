import { expect, test } from "@playwright/test";

test("editing a technician user without a linked record sends no creation sentinel", async ({
  page,
}) => {
  await page.goto("/technician-selection");
  const field = page.getByLabel("Cadastro de técnico");
  await expect(field).toHaveValue("");
  await expect(field.locator('option[value="new"]')).toHaveCount(0);
  await page.getByLabel("Contatos").check();
  const value = await page
    .locator("form")
    .evaluate((form) => new FormData(form).get("technician_id"));
  expect(value).toBe("");
});

test("editing another field preserves an existing technician link", async ({ page }) => {
  await page.goto("/technician-selection?mode=linked");
  await page.getByLabel("Contatos").check();
  await expect(page.getByLabel("Cadastro de técnico")).toHaveValue(
    "00000000-0000-4000-8000-000000000010",
  );
  await expect(page.getByRole("option", { name: "Técnico de outro usuário" })).toHaveCount(0);
});

test("creation retains its explicit create-technician option", async ({ page }) => {
  await page.goto("/technician-selection?mode=create");
  await expect(page.getByLabel("Cadastro de técnico")).toHaveValue("new");
  await expect(
    page.getByRole("option", { name: "Criar cadastro a partir deste usuário" }),
  ).toHaveCount(1);
});
