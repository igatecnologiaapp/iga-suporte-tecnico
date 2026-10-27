/** Área: Verificações isoladas da hidratação e do envio seguro das credenciais. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../..");
const require = createRequire(resolve(repo, "tests/package.json"));
const { chromium } = require("@playwright/test");
const base = new URL(process.env.IGA_AUTH_TEST_URL || "http://127.0.0.1:4180");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
assert.equal(base.protocol, "http:");
assert.ok(["4180", "4182"].includes(base.port));
const email = "security-regression@iga-test.example";
const password = "Synthetic-Regression-Only-91827";
const results = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
});

/** Executa o cenário e registra seu resultado de forma identificável. */
async function check(id, run) {
  try {
    await run();
    results.push({ id, status: "passed" });
  } catch (error) {
    results.push({
      id,
      status: "failed",
      detail: error.message.split(password).join("[synthetic password]").slice(0, 500),
    });
  }
}

try {
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  try {
    await check("actual-auth-route.javascript-disabled", async () => {
      const page = await noScript.newPage();
      await page.goto(new URL("/auth", base).href);
      await page.getByRole("button", { name: "Entrar", exact: true }).waitFor();
      assert.equal(await page.locator('input[name="email"]').isDisabled(), true);
      assert.equal(await page.locator('input[name="password"]').isDisabled(), true);
      assert.equal(await page.locator("form").getAttribute("method"), "post");
      await page.keyboard.press("Enter");
      assert.equal(new URL(page.url()).search, "");
    });
  } finally {
    await noScript.close();
  }

  const context = await browser.newContext();
  let tokenRequest;
  let nativeRequest;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) return route.abort("blockedbyclient");
    if (url.pathname === "/auth/v1/token") {
      tokenRequest = request;
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "invalid_credentials", message: "Synthetic login rejected" }),
      });
    }
    if (url.pathname === "/auth" && request.method() === "POST") {
      nativeRequest = request;
      return route.fulfill({ status: 405, body: "Synthetic native fallback rejected" });
    }
    return route.continue();
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await check("actual-auth-route.hydrated-supabase-json-request", async () => {
      await page.goto(new URL("/auth", base).href);
      await page.waitForFunction(() =>
        document.querySelector('input[name="password"]')?.matches(":enabled"),
      );
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.getByText("Synthetic login rejected", { exact: true }).waitFor();
      assert.ok(tokenRequest);
      assert.equal(tokenRequest.method(), "POST");
      assert.equal(new URL(tokenRequest.url()).searchParams.has("password"), false);
      assert.equal(new URL(tokenRequest.url()).searchParams.has("email"), false);
      assert.equal(tokenRequest.postDataJSON().password, password);
      assert.equal(tokenRequest.postDataJSON().email, email);
      assert.equal(new URL(page.url()).search, "");
    });
    await check("actual-auth-route.native-fallback-no-query", async () => {
      await page.waitForFunction(() =>
        document.querySelector('input[name="password"]')?.matches(":enabled"),
      );
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      const submission = page.waitForRequest(
        (request) => new URL(request.url()).pathname === "/auth" && request.method() === "POST",
      );
      await page.evaluate(() =>
        HTMLFormElement.prototype.submit.call(document.querySelector("form")),
      );
      nativeRequest = await submission;
      assert.ok(nativeRequest);
      assert.equal(new URL(nativeRequest.url()).search, "");
      assert.equal(new URLSearchParams(nativeRequest.postData()).get("password"), password);
    });
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(
  resolve(repo, "docs/phase-1/homologation/auth-security-results.json"),
  JSON.stringify(
    {
      target: "Actual application /auth route on loopback",
      backend: "Auth response and native POST intercepted; no database access",
      results,
    },
    null,
    2,
  ) + "\n",
);
for (const result of results) console.log(result.id, result.status, result.detail || "");
if (results.some((result) => result.status === "failed")) process.exitCode = 1;
