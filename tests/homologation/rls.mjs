import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { admin, userClient, privateDir, repo, requireOk } from "./local-support.mjs";
const fixtures = JSON.parse(readFileSync(resolve(privateDir, "fixtures.json"), "utf8"));
const results = [];
async function check(id, fn) {
  try {
    await fn();
    results.push({ id, status: "passed" });
  } catch (error) {
    results.push({ id, status: "failed", detail: String(error.message).slice(0, 400) });
  }
}
const clients = {};
for (const [key, user] of Object.entries(fixtures.users)) {
  await check(`auth.login.${key}`, async () => {
    const client = userClient();
    requireOk(
      await client.auth.signInWithPassword({ email: user.email, password: user.password }),
      "synthetic login",
    );
    clients[key] = client;
  });
}
for (const key of ["primary", "admin", "supervisor", "technician"]) {
  const client = clients[key];
  await check(`rls.company.create-edit.${key}`, async () => {
    const data = requireOk(
      await client
        .from("companies")
        .insert({
          legal_name: `RLS ${key}`,
          trade_name: `RLS ${key}`,
          tax_id: `RLS-${key}`,
          domain: "rls.example",
          created_by: fixtures.users[key].id,
        })
        .select("id"),
      "company insert",
    );
    assert.equal(data.length, 1);
    const id = data[0].id;
    try {
      const edited = requireOk(
        await client
          .from("companies")
          .update({ domain: "Texto livre RLS" })
          .eq("id", id)
          .select("id"),
        "company update",
      );
      assert.equal(edited.length, 1);
    } finally {
      requireOk(await admin.from("companies").delete().eq("id", id), "local cleanup");
    }
  });
}
for (const key of ["viewer", "restricted", "inactive"]) {
  await check(`rls.company.insert-denied.${key}`, async () => {
    const r = await clients[key]
      .from("companies")
      .insert({
        legal_name: "Negado",
        trade_name: "Negado",
        tax_id: `denied-${key}`,
        created_by: fixtures.users[key].id,
      })
      .select("id");
    assert.ok(r.error, "An unauthorized company insert was accepted");
  });
  await check(`rls.company.update-denied.${key}`, async () => {
    const before = requireOk(
      await admin.from("companies").select("domain").eq("id", fixtures.companies[0].id).single(),
      "before",
    );
    const r = await clients[key]
      .from("companies")
      .update({ domain: "UNAUTHORIZED" })
      .eq("id", fixtures.companies[0].id)
      .select("id");
    const after = requireOk(
      await admin.from("companies").select("domain").eq("id", fixtures.companies[0].id).single(),
      "after",
    );
    assert.ok(r.error || r.data.length === 0, "Unauthorized update returned a row");
    assert.equal(after.domain, before.domain);
  });
}
await check("rls.anon.companies-denied", async () => {
  const r = await userClient().from("companies").select("id");
  assert.ok(r.error || r.data.length === 0);
});
await check("rls.primary.distinction", async () => {
  for (const key of ["primary", "admin", "supervisor", "technician", "viewer"]) {
    const value = requireOk(
      await clients[key].rpc("is_primary_admin", { _user_id: fixtures.users[key].id }),
      "primary RPC",
    );
    assert.equal(value, key === "primary");
  }
});
await check("rls.modules.inactive-denied", async () => {
  assert.equal(
    requireOk(
      await clients.inactive.rpc("has_module", {
        _user_id: fixtures.users.inactive.id,
        _module: "companies",
      }),
      "module check",
    ),
    false,
  );
});
await check("rls.viewer.category-link-denied", async () => {
  const r = await clients.viewer.from("company_ticket_categories").insert({
    company_id: fixtures.companies[1].id,
    category_id: fixtures.categories[0].id,
    created_by: fixtures.users.viewer.id,
  });
  assert.ok(r.error);
});
await check("trigger.0019.child-needs-parent", async () => {
  const r = await clients.primary.from("company_ticket_categories").insert({
    company_id: fixtures.companies[1].id,
    category_id: fixtures.subcategories[0].id,
    created_by: fixtures.users.primary.id,
  });
  assert.ok(r.error);
  assert.match(r.error.message, /principal/);
});
await check("trigger.0019.parent-then-child", async () => {
  const company = fixtures.companies[1].id;
  try {
    requireOk(
      await clients.primary.from("company_ticket_categories").insert({
        company_id: company,
        category_id: fixtures.categories[0].id,
        created_by: fixtures.users.primary.id,
      }),
      "parent",
    );
    requireOk(
      await clients.primary.from("company_ticket_categories").insert({
        company_id: company,
        category_id: fixtures.subcategories[0].id,
        created_by: fixtures.users.primary.id,
      }),
      "child",
    );
  } finally {
    await admin.from("company_ticket_categories").delete().eq("company_id", company);
  }
});
await check("constraint.single-default-category", async () => {
  const r = await clients.primary
    .from("company_ticket_categories")
    .update({ is_default: true })
    .eq("company_id", fixtures.companies[0].id)
    .eq("category_id", fixtures.categories[1].id);
  assert.ok(r.error);
});
await check("rls.primary-role-protected", async () => {
  const r = await admin
    .from("user_roles")
    .update({ role: "viewer" })
    .eq("user_id", fixtures.users.primary.id);
  assert.ok(r.error);
});
await check("rls.viewer.storage-upload-denied", async () => {
  const r = await clients.viewer.storage
    .from("ticket-attachments")
    .upload(`${fixtures.tickets[0].id}/viewer-denied.txt`, Buffer.from("synthetic"));
  assert.ok(r.error);
});
await check("storage.operational-upload-read", async () => {
  const path = `${fixtures.tickets[0].id}/homologation-rls.txt`;
  try {
    requireOk(
      await clients.technician.storage
        .from("ticket-attachments")
        .upload(path, Buffer.from("Synthetic local storage payload"), {
          contentType: "text/plain",
          upsert: false,
        }),
      "upload",
    );
    requireOk(
      await clients.technician.from("ticket_attachments").insert({
        ticket_id: fixtures.tickets[0].id,
        storage_path: path,
        file_name: "homologation-rls.txt",
        uploaded_by: fixtures.users.technician.id,
      }),
      "metadata",
    );
    const downloaded = requireOk(
      await clients.viewer.storage.from("ticket-attachments").download(path),
      "viewer read",
    );
    assert.equal(await downloaded.text(), "Synthetic local storage payload");
  } finally {
    await admin.from("ticket_attachments").delete().eq("storage_path", path);
    await admin.storage.from("ticket-attachments").remove([path]);
  }
});
writeFileSync(
  resolve(repo, "docs/phase-1/homologation/rls-results.json"),
  JSON.stringify({ backend: "real local Supabase", results }, null, 2) + "\n",
);
console.log(
  "RLS/API tests:",
  results.filter((r) => r.status === "passed").length,
  "passed;",
  results.filter((r) => r.status === "failed").length,
  "failed",
);
for (const r of results.filter((r) => r.status === "failed")) console.log(r.id, r.detail);

if (results.some((result) => result.status === "failed")) process.exitCode = 1;
