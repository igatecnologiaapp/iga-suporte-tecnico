import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { resolve } from "node:path";
const repo = resolve(import.meta.dirname, "../..");
const require = createRequire(resolve(repo, "package.json"));
const ts = require("typescript");
const source = ts.transpileModule(
  readFileSync(resolve(repo, "tests/homologation/invitation-preflight.mjs"), "utf8")
    .replace('new URL("../..", import.meta.url)', JSON.stringify(repo))
    .replace("main().catch(", "globalThis.finished = main().catch("),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
async function run(options = {}) {
  const calls = [],
    logs = [],
    files = new Map();
  const operation = "00000000-0000-4000-8000-000000000001";
  const id = "00000000-0000-4000-8000-000000000002";
  const email = `invitation-probe-${operation}@iga-homologation.example`;
  let sequence = 0;
  const environment = { IGA_HOMO_PRIVATE: "/tmp/iga-private-invitation" };
  const process = { env: environment, exitCode: 0 };
  const context = vm.createContext({
    exports: {},
    process,
    URL,
    setTimeout,
    console: {
      log: (...args) => logs.push(args.join(" ")),
      error: (...args) => logs.push(args.join(" ")),
    },
    require(name) {
      if (name === "node:fs")
        return {
          realpathSync: (path) => path,
          readFileSync() {
            return JSON.stringify({
              API_URL: options.remote ? "https://remote.example.test" : "http://127.0.0.1:55421",
              SERVICE_ROLE_KEY: "synthetic-secret-never-print",
            });
          },
          writeFileSync(path, value, flags) {
            assert.equal(flags.mode, 0o600);
            if (flags.flag === "wx" && (options.existingJournal || files.has(path)))
              throw Error("exists");
            files.set(path, JSON.parse(value));
          },
        };
      if (name === "node:crypto")
        return {
          randomUUID: () => (sequence++ === 0 ? operation : id),
          randomBytes: () => ({ toString: () => "synthetic-password-never-print" }),
        };
      return require(name);
    },
    async fetch(url, request = {}) {
      url = new URL(url);
      calls.push({
        path: url.pathname,
        method: request.method || "GET",
        redirect: request.redirect,
      });
      let data;
      const user = {
        id,
        email,
        email_confirmed_at: null,
        app_metadata: { invitation_preflight: operation },
      };
      if (url.pathname === "/rest/v1/primary_admin") data = [{ user_id: "other-primary" }];
      else if (url.pathname === "/auth/v1/admin/users") {
        if (options.creationTimeout) throw Error("synthetic timeout with secret");
        data = {
          ...user,
          ...(options.wrongId ? { id: "wrong" } : {}),
          ...(options.confirmed ? { email_confirmed_at: "synthetic" } : {}),
        };
      } else if (url.pathname === `/rest/v1/profiles`)
        data =
          request.method === "PATCH"
            ? [{ id, status: options.profileFailure ? "active" : "inactive" }]
            : [{ status: "inactive" }];
      else if (url.pathname === "/rest/v1/user_roles")
        data = [{ role: options.adminRole ? "admin" : "viewer" }];
      else if (url.pathname === "/rest/v1/user_modules") data = [];
      else if (url.pathname === "/auth/v1/invite")
        data = { ...user, id: options.inviteWrongId ? "different" : id, invited_at: "synthetic" };
      else if (url.pathname === `/auth/v1/admin/users/${id}`) data = user;
      else if (url.pathname === "/api/v1/messages")
        data = { messages: [{ To: [{ Address: email }] }] };
      else throw Error(`Unexpected request ${url.pathname}`);
      return {
        ok: !(options.inviteFailure && url.pathname === "/auth/v1/invite"),
        status: 400,
        async json() {
          return data;
        },
      };
    },
  });
  vm.runInContext(source, context);
  await context.finished;
  return { calls, logs, files, code: process.exitCode };
}
test("local capability probe isolates a new UUID before invitation and preserves identity", async () => {
  const result = await run();
  assert.equal(result.code, 0);
  const patches = result.calls.filter((call) => call.method !== "GET");
  assert.deepEqual(
    patches.map((call) => call.path),
    ["/auth/v1/admin/users", "/rest/v1/profiles", "/auth/v1/invite"],
  );
  assert.ok(result.calls.every((call) => call.redirect === "error"));
  assert.equal([...result.files.values()][0].status, "passed");
  assert.equal(JSON.stringify(result.logs).includes("never-print"), false);
  assert.equal(JSON.stringify([...result.files.values()]).includes("never-print"), false);
});
for (const options of [
  { remote: true },
  { existingJournal: true },
  { creationTimeout: true },
  { wrongId: true },
  { confirmed: true },
  { profileFailure: true },
  { adminRole: true },
])
  test(`probe fails closed before invitation ${JSON.stringify(options)}`, async () => {
    const result = await run(options);
    assert.equal(result.code, 1);
    assert.equal(
      result.calls.some((call) => call.path === "/auth/v1/invite"),
      false,
    );
    assert.equal(JSON.stringify(result.logs).includes("never-print"), false);
    if (options.remote || options.existingJournal)
      assert.equal(
        result.calls.some((call) => call.method !== "GET"),
        false,
      );
  });
for (const options of [{ inviteFailure: true }, { inviteWrongId: true }])
  test(`uncertain invitation never reports success ${JSON.stringify(options)}`, async () => {
    const result = await run(options);
    assert.equal(result.code, 1);
    assert.equal([...result.files.values()][0].status, "invitation_started");
    assert.equal(
      result.logs.some((log) => log.startsWith("APROVADO")),
      false,
    );
  });
