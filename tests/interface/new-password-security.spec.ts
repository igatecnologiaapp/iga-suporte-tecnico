import { expect, test } from "@playwright/test";

const password = "Synthetic-Only-91827";

test("without JavaScript credential controls and Enter remain inert", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const response = await page.goto("/new-password-security");
  await expect(page.getByRole("button", { name: "Atualizar senha" })).toBeDisabled();
  await expect(page.getByLabel("Nova senha")).toBeDisabled();
  await expect(page.locator("form")).toHaveAttribute("method", "post");
  expect(await response!.text()).toContain("Ative o JavaScript");
  await page.keyboard.press("Enter");
  expect(new URL(page.url()).search).toBe("");
  expect(requests.some((url) => url.includes("password="))).toBe(false);
  await context.close();
});

test("delayed hydration keeps controls disabled, then handles click and Enter", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/new-password-security.client.tsx", async (route) => {
    await gate;
    await route.continue();
  });
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/new-password-security", { waitUntil: "commit" });
  try {
    await expect(page.getByLabel("Nova senha")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Atualizar senha" })).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(new URL(page.url()).search).toBe("");
  } finally {
    release();
  }
  await expect(page.getByLabel("Nova senha")).toBeEnabled();
  await page.getByLabel("Nova senha").fill(password);
  await page.getByRole("button", { name: "Atualizar senha" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-submitted", "true");
  await page.evaluate(() => delete document.documentElement.dataset.submitted);
  await page.getByLabel("Nova senha").press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-submitted", "true");
  expect(new URL(page.url()).search).toBe("");
  expect(requests.some((url) => url.includes("password=") || url.includes(password))).toBe(false);
});

test("native fallback uses POST body and never a credential query string", async ({ page }) => {
  await page.goto("/new-password-security");
  await expect(page.getByLabel("Nova senha")).toBeEnabled();
  await page.getByLabel("Nova senha").fill(password);
  const requestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/new-password-security" && request.method() === "POST",
  );
  // Explicitly bypass React, reproducing loss of the submit interception.
  await page.evaluate(() => HTMLFormElement.prototype.submit.call(document.querySelector("form")));
  const request = await requestPromise;
  expect(new URL(request.url()).search).toBe("");
  expect(request.postData()).toContain("password=");
  expect(request.url()).not.toContain(password);
});

test("submission failure releases busy controls", async ({ page }) => {
  await page.goto("/new-password-security");
  await expect(page.getByLabel("Nova senha")).toBeEnabled();
  await page.evaluate(() => {
    document.documentElement.dataset.reject = "true";
  });
  await page.getByLabel("Nova senha").fill(password);
  await page.getByRole("button", { name: "Atualizar senha" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-failed", "true");
  await expect(page.getByLabel("Nova senha")).toBeEnabled();
});
