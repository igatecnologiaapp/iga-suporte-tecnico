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
  await phone.pressSequentially("912345678");
  await expect(phone).toHaveValue("(11) 91234-5678");
  await phone.evaluate((input: HTMLInputElement) => input.setSelectionRange(5, 6));
  await phone.pressSequentially("8");
  await expect(phone).toHaveValue("(11) 81234-5678");
  await phone.press("End");
  for (let n = 0; n < 11; n++) await phone.press("Backspace");
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

test("WhatsApp accepts country code paste and preserves international or legacy values", async ({
  page,
}) => {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Editar Contato 02", exact: true }).click();
  const whatsapp = page.getByLabel("WhatsApp", { exact: true });
  await whatsapp.fill("5511912345678");
  await expect(whatsapp).toHaveValue("+55 (11) 91234-5678");
  await whatsapp.fill("+351 912 345 678");
  await expect(whatsapp).toHaveValue("+351 912 345 678");
  await whatsapp.fill("(11) 3333-4444 ramal 12");
  await expect(whatsapp).toHaveValue("(11) 3333-4444 ramal 12");
  await whatsapp.press("End");
  await whatsapp.pressSequentially("3");
  await expect(whatsapp).toHaveValue("(11) 3333-4444 ramal 123");
  await whatsapp.fill("+55 11 912345678");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr").nth(1)).toContainText("+55 (11) 91234-5678WhatsApp");
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
  await phone.fill("11912345678");
  await expect(phone).toHaveValue("(11) 91234-5678");
  await phone.evaluate((input: HTMLInputElement) => {
    const point = input.value.indexOf("-");
    input.setSelectionRange(point, point);
  });
  await phone.press("Delete");
  expect((await phone.inputValue()).replace(/\D/g, "")).toBe("1191234678");
  await phone.fill("1133334444");
  await page.getByLabel("WhatsApp", { exact: true }).fill("11987654321");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = await page.evaluate(() => window.testDatabase.companies[0]);
  expect(row?.phone).toBe("(11) 3333-4444");
  expect(row?.whatsapp).toBe("(11) 98765-4321");
});
