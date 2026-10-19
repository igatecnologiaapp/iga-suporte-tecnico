import { expect, test } from "@playwright/test";

const email = "security@iga-test.example";
const password = "Synthetic-Only-91827";

test("without JavaScript credential controls and Enter remain inert", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const response = await page.goto("/auth-security");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeDisabled();
  await expect(page.getByLabel("Email")).toBeDisabled();
  await expect(page.getByLabel("Password")).toBeDisabled();
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
  await page.route("**/auth-security.client.tsx", async (route) => {
    await gate;
    await route.continue();
  });
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/auth-security", { waitUntil: "commit" });
  try {
    await expect(page.getByLabel("Password")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(new URL(page.url()).search).toBe("");
  } finally {
    release();
  }
  await expect(page.getByLabel("Password")).toBeEnabled();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-submitted", "true");
  await page.evaluate(() => delete document.documentElement.dataset.submitted);
  await page.getByLabel("Password").press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-submitted", "true");
  expect(new URL(page.url()).search).toBe("");
  expect(requests.some((url) => url.includes("password=") || url.includes(password))).toBe(false);
});

test("native fallback uses POST body and never a credential query string", async ({ page }) => {
  await page.goto("/auth-security");
  await expect(page.getByLabel("Password")).toBeEnabled();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const requestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/auth-security" && request.method() === "POST",
  );
  // Explicitly bypass React, reproducing loss of the submit interception.
  await page.evaluate(() => HTMLFormElement.prototype.submit.call(document.querySelector("form")));
  const request = await requestPromise;
  expect(new URL(request.url()).search).toBe("");
  expect(request.postData()).toContain("password=");
  expect(request.url()).not.toContain(password);
});
