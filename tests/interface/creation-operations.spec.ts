import { expect, test } from "@playwright/test";
test("pending creation resumes the operation and blocks concurrent actions", async ({ page }) => {
  await page.goto("/creation-operations");
  await expect(page.locator("[data-ready=true]")).toBeVisible();
  await expect(page.getByText("Cadastro pendente — acesso ainda bloqueado")).toBeVisible();
  await page.getByRole("button", { name: "Retomar cadastro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-action", "resume:pending");
  await expect(page.getByRole("button", { name: "Retomar cadastro" })).toBeDisabled();
  for (const button of await page.getByRole("button", { name: "Reenviar convite" }).all())
    await expect(button).toBeDisabled();
});
test("delivery pending stays distinct from creation and offers explicit resend", async ({
  page,
}) => {
  await page.goto("/creation-operations");
  await expect(page.locator("[data-ready=true]")).toBeVisible();
  await expect(page.getByText("Resultado do envio não confirmado")).toBeVisible();
  await expect(page.getByText("Retome cadastros pendentes", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Reenviar convite" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-action", "resend:failed");
});
test("confirmed identity does not offer another invitation", async ({ page }) => {
  await page.goto("/creation-operations");
  await expect(page.locator("[data-ready=true]")).toBeVisible();
  await expect(page.getByText("E-mail já confirmado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reenviar convite" }).last()).toBeDisabled();
  await expect(page.locator('a[href*="token"], input[type="password"]')).toHaveCount(0);
});
