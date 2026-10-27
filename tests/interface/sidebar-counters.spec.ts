import { expect, test } from "@playwright/test";

for (const dark of [false, true])
  test(`quick counters use native inactive fill and white selected fill, dark=${dark}`, async ({
    page,
  }) => {
    await page.goto("/companies?pagination");
    if (dark) await page.getByRole("button", { name: "Ativar modo escuro", exact: true }).click();
    const active = page.getByRole("button", { name: "Ativas 12", exact: true });
    const all = page.getByRole("button", { name: "Todas 13", exact: true });
    await expect(active).toBeEnabled();
    await active.click();
    const colors = async (button: typeof active) =>
      button.locator(".company-filter-count").evaluate((el) => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, text: style.color };
      });
    const before = await colors(all);
    expect(before.background).not.toBe("rgb(255, 255, 255)");
    expect(await colors(active)).toEqual({
      background: "rgb(255, 255, 255)",
      text: "rgb(8, 119, 201)",
    });
    const green = await active
      .locator(".record-state-dot")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    await all.click();
    await expect(all).toBeEnabled();
    await expect(all).toHaveAttribute("aria-pressed", "true");
    expect(await colors(active)).toEqual(before);
    expect(await colors(all)).toEqual({
      background: "rgb(255, 255, 255)",
      text: "rgb(8, 119, 201)",
    });
    expect(
      await active
        .locator(".record-state-dot")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe(green);
  });

test("shared inbox badge sums beyond one batch, polls new arrivals and clears after read", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/companies?inbox-badge");
  await page.getByRole("button", { name: "OPERAÇÃO", exact: true }).click();
  const inbox = page.getByRole("link", {
    name: "Caixa de Entrada, 501 mensagens não lidas",
    exact: true,
  });
  await expect(inbox).toBeVisible();
  await expect(inbox.locator(".inbox-unread-badge")).toHaveText("99+");
  expect(await page.evaluate(() => window.testInboxReads)).toContainEqual({ start: 500, end: 999 });
  await page.evaluate(() => {
    window.testDatabase.conversations.forEach((row, index) => {
      row.unread_count = index === 0 ? 2 : 0;
    });
    window.dispatchEvent(new Event("iga-inbox-unread-changed"));
  });
  const two = page.getByRole("link", {
    name: "Caixa de Entrada, 2 mensagens não lidas",
    exact: true,
  });
  await expect(two.locator(".inbox-unread-badge")).toHaveText("2");
  const color = await two.locator(".inbox-unread-badge").evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    text: getComputedStyle(el).color,
  }));
  expect(color).toEqual({ background: "rgb(229, 46, 70)", text: "rgb(255, 255, 255)" });
  await page.getByRole("button", { name: "Recolher menu", exact: true }).click();
  await expect(two).toHaveClass(/nav-item-compact/);
  await expect(two.locator(".inbox-unread-badge")).toBeVisible();
  const current = page.getByRole("link", { name: "Empresas / Clientes", exact: true });
  await expect(current).toHaveAttribute("aria-current", "page");
  expect(await current.evaluate((el) => getComputedStyle(el, "::after").width)).toBe("3px");
  await page.evaluate(() => {
    window.testDatabase.conversations[500]!.unread_count = 5;
  });
  await page.clock.runFor(10_001);
  await expect(
    page.getByRole("link", { name: "Caixa de Entrada, 7 mensagens não lidas", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.testDatabase.conversations.forEach((row, index) => {
      row.unread_count = index === 0 ? 1 : 0;
    });
    window.dispatchEvent(new Event("iga-inbox-unread-changed"));
  });
  await expect(
    page.getByRole("link", { name: "Caixa de Entrada, 1 mensagem não lida", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.testDatabase.conversations.forEach((row) => {
      row.unread_count = 0;
    });
    window.dispatchEvent(new Event("iga-inbox-unread-changed"));
  });
  await expect(page.locator(".inbox-unread-badge")).toHaveCount(0);
  expect(await page.evaluate(() => window.testWrites)).toEqual([]);
});

test("mobile inbox badge is visible in expanded navigation", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/companies?inbox-badge");
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("button", { name: "OPERAÇÃO", exact: true }).click();
  const inbox = page.getByRole("link", {
    name: "Caixa de Entrada, 501 mensagens não lidas",
    exact: true,
  });
  await expect(inbox.locator(".inbox-unread-badge")).toBeVisible();
});

test("without inbox module the shell makes no unread queries", async ({ page }) => {
  await page.goto("/companies?viewer");
  await expect(
    page.getByRole("navigation", { name: "Paginação de Empresas / Clientes" }),
  ).toContainText("1 a 4 de 4");
  expect(await page.evaluate(() => window.testInboxReads)).toEqual([]);
  await expect(page.getByRole("link", { name: /^Caixa de Entrada/ })).toHaveCount(0);
});
