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

test("disabled invitation explains itself on hover and keyboard focus without sending", async ({
  page,
}) => {
  await page.goto("/creation-operations");
  await expect(page.locator("[data-ready=true]")).toBeVisible();
  const hint = page.getByRole("group", {
    name: "E-mail já confirmado. Use a recuperação de senha na lista de usuários.",
    exact: true,
  });
  await hint.hover();
  await expect(page.getByRole("tooltip")).toContainText("E-mail já confirmado");
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
  await hint.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).not.toHaveAttribute("data-action", /.+/);
});
for (const theme of ["light", "dark"])
  for (const width of [360, 1440])
    test(`audit and explanations fit ${width}px in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/creation-operations?theme=${theme}`);
      await expect(page.locator("[data-ready=true]")).toBeVisible();
      const audit = page.getByRole("region", { name: "Auditoria administrativa" });
      await expect(audit.locator("li").first()).toContainText("Alteração nas últimas 24 horas");
      await expect(audit.locator("li").last()).not.toContainText("Alteração nas últimas 24 horas");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/iga-admin-visual-${theme}-${width}.png`,
        fullPage: true,
      });
    });
