import { expect, test } from "@playwright/test";

test("contact phone typing formats progressively, supports middle edits and erases completely", async ({
  page,
}) => {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Editar Contato 01", exact: true }).click();
  const phone = page.getByLabel("Telefone", { exact: true });
  await phone.clear();
  await phone.pressSequentially("11");
  await expect(phone).toHaveValue("(11)");
  await phone.pressSequentially("91234567");
  await expect(phone).toHaveValue("(11) 9123-4567");
  await phone.evaluate((input: HTMLInputElement) => input.setSelectionRange(5, 6));
  await phone.pressSequentially("8");
  await expect(phone).toHaveValue("(11) 8123-4567");
  await phone.press("End");
  for (let n = 0; n < 10; n++) await phone.press("Backspace");
  await expect(phone).toHaveValue("");
  await phone.pressSequentially("1133334444");
  await expect(phone).toHaveValue("(11) 3333-4444");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr").first()).toContainText("(11) 3333-4444");
  expect(await page.evaluate(() => window.testDatabase.contacts[0]!.phone.replace(/\D/g, ""))).toBe(
    "1133334444",
  );
});

test("phone and WhatsApp block extra typing, middle insertion and oversized paste independently", async ({
  page,
}) => {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Editar Contato 01", exact: true }).click();
  const phone = page.getByLabel("Telefone", { exact: true });
  const whatsapp = page.getByLabel("WhatsApp", { exact: true });
  await phone.fill("1199999999");
  await expect(phone).toHaveValue("(11) 9999-9999");
  await phone.press("End");
  await phone.pressSequentially("99999");
  await expect(phone).toHaveValue("(11) 9999-9999");
  await phone.evaluate((input: HTMLInputElement) => input.setSelectionRange(6, 6));
  await phone.pressSequentially("8");
  await expect(phone).toHaveValue("(11) 9999-9999");
  await phone.fill("11987654321");
  await expect(phone).toHaveValue("(11) 9999-9999");
  await expect(page.getByRole("alert")).toContainText("Telefone aceita no máximo 10 dígitos");
  await whatsapp.fill("11987654321");
  await expect(whatsapp).toHaveValue("(11) 98765-4321");
  await whatsapp.press("End");
  await whatsapp.pressSequentially("999999");
  await expect(whatsapp).toHaveValue("(11) 98765-4321");
  await whatsapp.fill("5511987654321");
  await expect(whatsapp).toHaveValue("(11) 98765-4321");
  await expect(page.getByRole("alert").last()).toContainText(
    "WhatsApp aceita no máximo 11 dígitos",
  );
  await phone.fill("1133334444");
  await whatsapp.fill("11987654321");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = await page.evaluate(() => window.testDatabase.contacts[0]);
  expect(row?.phone).toBe("(11) 3333-4444");
  expect(row?.whatsapp).toBe("(11) 98765-4321");
});

test("oversized existing phone stays intact and requires correction before saving", async ({
  page,
}) => {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Editar Contato 01", exact: true }).click();
  const phone = page.getByLabel("Telefone", { exact: true });
  await expect(phone).toHaveValue("(11) 90000-0001");
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => window.testWrites)).toEqual([]);
  await phone.fill("1133334444");
  await expect(phone).not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("formatting old unformatted numbers on screen does not write records", async ({ page }) => {
  await page.goto("/contacts?unformatted-phones");
  await expect(page.locator("tbody tr").first()).toContainText("(11) 90000-0001");
  await expect(page.locator("tbody tr").nth(1)).toContainText("(11) 90000-0002WhatsApp");
  expect(await page.evaluate(() => window.testWrites)).toEqual([]);
  expect(await page.evaluate(() => window.testDatabase.contacts[0]!.phone)).toBe("11900000001");
});

test("company phone and WhatsApp use the same input formatting and separator deletion works", async ({
  page,
}) => {
  await page.goto("/companies");
  await page.getByRole("button", { name: "Editar Alfa Sintética", exact: true }).click();
  const phone = page.getByLabel("Telefone", { exact: true });
  await phone.fill("1191234567");
  await expect(phone).toHaveValue("(11) 9123-4567");
  await phone.evaluate((input: HTMLInputElement) => {
    const point = input.value.indexOf("-");
    input.setSelectionRange(point, point);
  });
  await phone.press("Delete");
  expect((await phone.inputValue()).replace(/\D/g, "")).toBe("119123567");
  await phone.fill("1133334444");
  await page.getByLabel("WhatsApp", { exact: true }).fill("11987654321");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = await page.evaluate(() => window.testDatabase.companies[0]);
  expect(row?.phone).toBe("(11) 3333-4444");
  expect(row?.whatsapp).toBe("(11) 98765-4321");
});
