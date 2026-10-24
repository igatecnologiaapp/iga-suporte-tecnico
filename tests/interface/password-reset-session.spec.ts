import { expect, test, type Page } from "@playwright/test";
const primary = "00000000-0000-4000-8000-000000000001",
  invited = "00000000-0000-4000-8000-000000000002";
const expires = Math.floor(Date.now() / 1000) + 3600;
const jwt = (sub: string) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub, exp: expires, iat: expires - 3600, aud: "authenticated", role: "authenticated" })).toString("base64url")}.synthetic-signature`;
const primaryToken = jwt(primary),
  invitedToken = jwt(invited);
const user = (id: string) => ({
  id,
  email: id === primary ? "primary@iga-test.example" : "invited@iga-test.example",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
});
const saved = JSON.stringify({
  access_token: primaryToken,
  refresh_token: "primary-synthetic-refresh",
  expires_at: expires,
  expires_in: 3600,
  token_type: "bearer",
  user: user(primary),
});
async function prepare(page: Page, reject = false) {
  const updates: string[] = [];
  await page.addInitScript((value) => localStorage.setItem("iga-primary-fixture", value), saved);
  await page.route("http://127.0.0.1:55421/auth/v1/**", async (route) => {
    const request = route.request();
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:4175",
      "access-control-allow-headers":
        "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
      "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const auth = request.headers()["authorization"] || "";
    if (request.method() === "PUT") updates.push(auth);
    if (reject && auth === `Bearer ${invitedToken}`)
      return route.fulfill({
        status: 401,
        headers,
        contentType: "application/json",
        body: JSON.stringify({ code: "bad_jwt", message: "Synthetic token rejected" }),
      });
    const body = new URL(request.url()).pathname.endsWith("/logout")
      ? {}
      : user(auth === `Bearer ${primaryToken}` ? primary : invited);
    return route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return updates;
}
const link = (type: string) =>
  `/reset-password#access_token=${invitedToken}&refresh_token=invited-synthetic-refresh&token_type=bearer&type=${type}`;
async function primaryPreserved(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-main-user", primary);
  expect(await page.evaluate(() => localStorage.getItem("iga-primary-fixture"))).toBe(saved);
  expect(await page.evaluate(() => localStorage.getItem("iga-password-reset-memory"))).toBeNull();
}
for (const path of [
  "/reset-password",
  "/reset-password#error=access_denied&error_code=otp_expired",
])
  test(`stored primary cannot turn invalid callback into password update: ${path}`, async ({
    page,
  }) => {
    const updates = await prepare(page);
    await page.goto(path);
    await expect(page.getByRole("alert")).toHaveText(
      "Link inválido ou expirado. Solicite novas instruções de recuperação.",
    );
    await expect(page.getByLabel("Nova senha")).toHaveCount(0);
    await primaryPreserved(page);
    expect(updates).toEqual([]);
    expect(new URL(page.url()).hash).toBe("");
  });
for (const type of ["invite", "recovery"])
  test(`valid ${type} changes only its isolated account and preserves primary`, async ({
    page,
  }) => {
    const updates = await prepare(page);
    await page.goto(link(type));
    await expect(page.getByText("Defina a senha para invited@iga-test.example.")).toBeVisible();
    await page.getByLabel("Nova senha").fill("Synthetic-New-Password-91827");
    await page.getByRole("button", { name: "Atualizar senha" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-completed", "true");
    await primaryPreserved(page);
    expect(updates).toEqual([`Bearer ${invitedToken}`]);
    await expect(page.getByLabel("Nova senha")).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe("");
  });
test("provider rejects token without using primary session", async ({ page }) => {
  const updates = await prepare(page, true);
  await page.goto(link("invite"));
  await expect(page.getByRole("alert")).toContainText("Link inválido ou expirado");
  await expect(page.getByLabel("Nova senha")).toHaveCount(0);
  await primaryPreserved(page);
  expect(updates).toEqual([]);
});
