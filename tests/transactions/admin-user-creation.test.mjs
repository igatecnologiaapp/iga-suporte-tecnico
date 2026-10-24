import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const repo = resolve(import.meta.dirname, "../..");
const require = createRequire(resolve(repo, "package.json"));
const postgres = require("postgres");
const url = new URL(process.env.IGA_CREATION_TEST_DB || "");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.port, "55432");
assert.match(url.pathname, /^\/iga_creation_test_[a-zA-Z0-9_]+$/);
const sql = postgres(url.href, { max: 6, onnotice() {} });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const primary = id(1),
  ordinary = id(2),
  technician = id(3),
  operation = id(10),
  otherOperation = id(11),
  token = id(12);
const payload = {
  fullName: "New User",
  email: "new@iga-test.example",
  phone: null,
  role: "technician",
  status: "active",
  technicianId: null,
  createTechnician: true,
  modules: ["tickets"],
};
before(async () => {
  assert.equal(
    (
      await sql`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema IN ('public','auth','storage')`
    )[0].count,
    0,
  );
  await sql.unsafe(readFileSync(resolve(import.meta.dirname, "bootstrap.sql"), "utf8"));
  const directory = resolve(repo, "drizzle/migrations");
  const files = readdirSync(directory)
    .filter((name) => /^00(?:0\d|1\d|2[012])_.*\.sql$/.test(name))
    .sort();
  assert.equal(files.length, 23);
  for (const name of files)
    await sql.begin((tx) => tx.unsafe(readFileSync(resolve(directory, name), "utf8")));
});
beforeEach(async () => {
  for (const table of ["profiles", "user_roles", "user_modules", "technicians", "admin_audit_logs"])
    await sql.unsafe(`DROP TRIGGER IF EXISTS creation_test_fail ON public.${table}`);
  await sql`TRUNCATE auth.users, public.profiles, public.admin_user_creation_operations CASCADE`;
  for (const [n, email] of [
    [1, "primary@iga-test.example"],
    [2, "ordinary@iga-test.example"],
  ])
    await sql`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${id(n)},${email},'{}')`;
  await sql`UPDATE public.user_roles SET role='admin' WHERE user_id=${ordinary}`;
  await sql`INSERT INTO public.primary_admin(user_id) VALUES(${primary})`;
  await sql`INSERT INTO public.user_modules(user_id,module) VALUES(${ordinary},'users')`;
  await sql`INSERT INTO public.technicians(id,name,email) VALUES(${technician},'Available','tech@iga-test.example')`;
});
after(() => sql.end());
async function as(actor, callback, role = "authenticated") {
  return sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${role}`);
    await tx`SELECT set_config('request.jwt.claim.sub',${actor || ""},true)`;
    return callback(tx);
  });
}
async function reserve(p = payload, op = operation, actor = primary) {
  return (
    await as(
      actor,
      (tx) => tx`SELECT public.reserve_admin_user_creation(${op},${tx.json(p)}) AS value`,
    )
  )[0].value;
}
async function provision(op = operation, actor = primary) {
  return (
    await as(actor, (tx) => tx`SELECT public.provision_admin_user_creation(${op}) AS value`)
  )[0].value;
}
async function claim(op = operation, deliveryToken = token, resend = false, actor = primary) {
  return (
    await as(
      actor,
      (tx) =>
        tx`SELECT public.claim_admin_user_invitation(${op},${deliveryToken},${resend}) AS value`,
    )
  )[0].value;
}
async function record(outcome, deliveryToken = token) {
  return (
    await as(
      primary,
      (tx) =>
        tx`SELECT public.record_admin_user_invitation(${operation},${deliveryToken},${outcome}) AS value`,
    )
  )[0].value;
}
async function identity(op, patch = {}) {
  await sql`INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES(${op.userId},${patch.email || op.payload.email},'{}',${sql.json({ admin_creation_operation: patch.operation || op.operationId })})`;
}
async function snapshot() {
  const state = {};
  for (const table of [
    "profiles",
    "user_roles",
    "user_modules",
    "technicians",
    "admin_audit_logs",
    "admin_user_creation_operations",
  ])
    state[table] = await sql.unsafe(`SELECT * FROM public.${table} ORDER BY id`);
  return JSON.stringify(state);
}
async function inject(table) {
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.creation_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic creation failure'; END $$;
  CREATE TRIGGER creation_test_fail AFTER INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.creation_test_fail()`);
}
test("reservation is authorized, canonical and idempotent", async () => {
  const op = await reserve({
    ...payload,
    fullName: " New User ",
    email: "NEW@iga-test.example",
    modules: ["tickets", "tickets"],
  });
  assert.equal(op.payload.email, payload.email);
  assert.equal(op.payload.fullName, payload.fullName);
  assert.deepEqual(await reserve(), op);
  assert.equal(
    (await sql`SELECT count(*)::int AS count FROM public.admin_user_creation_operations`)[0].count,
    1,
  );
  assert.equal((await sql`SELECT count(*)::int AS count FROM public.admin_audit_logs`)[0].count, 1);
});
for (const actor of [ordinary, null])
  test(`unauthorized reservation has no effects ${actor}`, async () => {
    const previous = await snapshot();
    await assert.rejects(reserve(payload, operation, actor));
    assert.equal(await snapshot(), previous);
  });
test("inactive principal is denied", async () => {
  // The existing primary guard disallows deactivation; emulate a stale role instead.
  await sql`DELETE FROM public.primary_admin`;
  await sql`UPDATE public.profiles SET status='inactive' WHERE id=${primary}`;
  await sql`INSERT INTO public.primary_admin(user_id) VALUES(${primary})`;
  await assert.rejects(reserve(), /Principal ativo/);
});
for (const patch of [
  { role: "root" },
  { modules: ["bad"] },
  { modules: [] },
  { actorId: primary },
  { technicianId: "new" },
  { role: "viewer" },
  { createTechnician: true, technicianId: technician },
])
  test(`SQL validates before reservation ${JSON.stringify(patch)}`, async () => {
    const previous = await snapshot();
    await assert.rejects(reserve({ ...payload, ...patch }));
    assert.equal(await snapshot(), previous);
  });
test("same key with changed data or same email with another key is refused", async () => {
  await reserve();
  await assert.rejects(reserve({ ...payload, fullName: "Changed" }), /outros dados/);
  await assert.rejects(reserve(payload, otherOperation), /E-mail/);
});
test("preexisting Auth account is never adopted", async () => {
  await assert.rejects(reserve({ ...payload, email: "ordinary@iga-test.example" }), /E-mail/);
});
test("Auth trigger creates inert identity and rejects bypasses", async () => {
  const op = await reserve();
  await identity(op);
  assert.equal(
    (await sql`SELECT status FROM public.profiles WHERE id=${op.userId}`)[0].status,
    "inactive",
  );
  await sql`UPDATE public.profiles SET status='active' WHERE id=${op.userId}`;
  assert.equal(
    (await sql`SELECT status FROM public.profiles WHERE id=${op.userId}`)[0].status,
    "inactive",
  );
  await assert.rejects(
    sql`UPDATE public.user_roles SET role='admin' WHERE user_id=${op.userId}`,
    /pendente/,
  );
  await assert.rejects(
    sql`INSERT INTO public.user_modules(user_id,module) VALUES(${op.userId},'tickets')`,
    /pendente/,
  );
  await assert.rejects(claim(), /concluído/);
});
test("full provision commits role, profile, modules, technician and audit once", async () => {
  const op = await reserve();
  await identity(op);
  const done = await provision();
  assert.equal(done.stage, "provisioned");
  assert.equal(
    (await sql`SELECT status FROM public.profiles WHERE id=${op.userId}`)[0].status,
    "active",
  );
  assert.equal(
    (await sql`SELECT role FROM public.user_roles WHERE user_id=${op.userId}`)[0].role,
    "technician",
  );
  assert.equal(
    (await sql`SELECT count(*)::int AS count FROM public.technicians WHERE user_id=${op.userId}`)[0]
      .count,
    1,
  );
  assert.deepEqual(await provision(), done);
  assert.equal(
    (
      await sql`SELECT count(*)::int AS count FROM public.admin_audit_logs WHERE action='user_created'`
    )[0].count,
    1,
  );
});
for (const table of ["profiles", "user_roles", "user_modules", "technicians", "admin_audit_logs"])
  test(`provision rollback includes operation stage when ${table} fails`, async () => {
    const op = await reserve();
    await identity(op);
    const before = await snapshot();
    await inject(table);
    await assert.rejects(provision(), /synthetic creation/);
    assert.equal(await snapshot(), before);
  });
for (const patch of [{ email: "other@iga-test.example" }, { operation: otherOperation }])
  test(`identity provenance mismatch is rejected ${JSON.stringify(patch)}`, async () => {
    const op = await reserve();
    await identity(op, patch);
    const before = await snapshot();
    await assert.rejects(provision(), /Identidade/);
    assert.equal(await snapshot(), before);
  });
test("linked technician is rechecked and never reassigned", async () => {
  const op = await reserve({ ...payload, technicianId: technician, createTechnician: false });
  await identity(op);
  await sql`UPDATE public.technicians SET user_id=${ordinary} WHERE id=${technician}`;
  const before = await snapshot();
  await assert.rejects(provision(), /indisponível/);
  assert.equal(await snapshot(), before);
});
test("concurrent reservation/provision/delivery each has one winner", async () => {
  const reservations = await Promise.all([reserve(), reserve()]);
  assert.equal(reservations[0].userId, reservations[1].userId);
  await identity(reservations[0]);
  await Promise.all([provision(), provision()]);
  const claims = await Promise.all([claim(), claim(operation, id(13))]);
  assert.equal(claims.filter((result) => result.claimed).length, 1);
  assert.equal(
    (
      await sql`SELECT count(*)::int AS count FROM public.admin_audit_logs WHERE action='user_created'`
    )[0].count,
    1,
  );
});
test("delivery requires durable intent; failed outcome is explicit; no implicit resend", async () => {
  const op = await reserve();
  await identity(op);
  await provision();
  const first = await claim();
  assert.equal(first.claimed, true);
  assert.equal((await record("failed")).deliveryState, "failed");
  assert.equal((await claim()).claimed, false);
  assert.equal((await claim(operation, id(13), true)).claimed, false);
  await sql`UPDATE public.admin_user_creation_operations SET delivery_started_at=now()-interval '61 seconds' WHERE id=${operation}`;
  assert.equal((await claim(operation, id(13), true)).claimed, true);
  await assert.rejects(record("accepted"), /substituída/);
  assert.equal((await record("accepted", id(13))).deliveryState, "accepted");
});
test("delivery intent audit failure rolls back the claim", async () => {
  const op = await reserve();
  await identity(op);
  await provision();
  const before = await snapshot();
  await inject("admin_audit_logs");
  await assert.rejects(claim(), /synthetic/);
  assert.equal(await snapshot(), before);
});
test("delivery result audit failure preserves sending for explicit review", async () => {
  const op = await reserve();
  await identity(op);
  await provision();
  await claim();
  await inject("admin_audit_logs");
  await assert.rejects(record("accepted"), /synthetic/);
  assert.equal(
    (await sql`SELECT delivery_state FROM public.admin_user_creation_operations`)[0].delivery_state,
    "sending",
  );
  assert.equal((await claim()).claimed, false);
});
test("ordinary admin cannot provision, claim, list or read operation", async () => {
  await reserve();
  await assert.rejects(provision(operation, ordinary), /Principal/);
  await assert.rejects(claim(operation, token, false, ordinary), /Principal/);
  await assert.rejects(
    as(ordinary, (tx) => tx`SELECT public.list_admin_user_creations()`),
    /Principal/,
  );
  await assert.rejects(
    as(ordinary, (tx) => tx`SELECT public.get_admin_user_creation(${operation})`),
    /Principal/,
  );
});
test("private operation table and RPC grants reject anonymous/service writes", async () => {
  for (const role of ["anon", "authenticated"])
    await assert.rejects(
      as(primary, (tx) => tx`SELECT * FROM public.admin_user_creation_operations`, role),
      /permission denied/,
    );
  for (const role of ["anon", "service_role"])
    await assert.rejects(
      as(
        primary,
        (tx) => tx`SELECT public.reserve_admin_user_creation(${operation},${tx.json(payload)})`,
        role,
      ),
      /permission denied/,
    );
});
test("primary list/read operation matches immutable request", async () => {
  const op = await reserve();
  const listed = (
    await as(primary, (tx) => tx`SELECT public.list_admin_user_creations() AS value`)
  )[0].value;
  assert.deepEqual(listed, [op]);
  assert.deepEqual(
    (await as(primary, (tx) => tx`SELECT public.get_admin_user_creation(${operation}) AS value`))[0]
      .value,
    op,
  );
});

test("Auth identity is frozen during reservation and delivery, without blocking confirmation", async () => {
  const op = await reserve();
  await identity(op);
  await assert.rejects(
    sql`UPDATE auth.users SET email='changed@iga-test.example' WHERE id=${op.userId}`,
    /operação pendente/,
  );
  await assert.rejects(sql`DELETE FROM auth.users WHERE id=${op.userId}`, /operação pendente/);
  await provision();
  await claim();
  await assert.rejects(
    sql`UPDATE auth.users SET raw_app_meta_data='{}' WHERE id=${op.userId}`,
    /operação pendente/,
  );
  await sql`UPDATE auth.users SET email_confirmed_at=now() WHERE id=${op.userId}`;
  await record("activated");
});

for (const role of ["admin", "supervisor", "viewer"])
  test(`non-technician role ${role} creates no technician`, async () => {
    const op = await reserve({ ...payload, role, createTechnician: false });
    await identity(op);
    await provision();
    assert.equal(
      (await sql`SELECT role FROM public.user_roles WHERE user_id=${op.userId}`)[0].role,
      role,
    );
    assert.equal(
      (
        await sql`SELECT count(*)::int AS count FROM public.technicians WHERE user_id=${op.userId}`
      )[0].count,
      0,
    );
  });
test("requested inactive status is preserved at provision", async () => {
  const op = await reserve({
    ...payload,
    role: "viewer",
    status: "inactive",
    createTechnician: false,
  });
  await identity(op);
  await provision();
  assert.equal(
    (await sql`SELECT status FROM public.profiles WHERE id=${op.userId}`)[0].status,
    "inactive",
  );
  assert.equal(
    (await sql`SELECT public.has_module(${op.userId},'tickets') AS allowed`)[0].allowed,
    false,
  );
});
test("existing free technician is linked without modifying its identity", async () => {
  const op = await reserve({ ...payload, technicianId: technician, createTechnician: false });
  await identity(op);
  await provision();
  const rows = await sql`SELECT id,user_id,name FROM public.technicians`;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, technician);
  assert.equal(rows[0].user_id, op.userId);
  assert.equal(rows[0].name, "Available");
});
test("unexpected confirmation before provision leaves pending account inactive", async () => {
  const op = await reserve();
  await identity(op);
  await sql`UPDATE auth.users SET email_confirmed_at=now() WHERE id=${op.userId}`;
  const before = await snapshot();
  await assert.rejects(provision(), /Identidade/);
  assert.equal(await snapshot(), before);
});
test("unresolved in-flight delivery needs five-minute wait and explicit resend", async () => {
  const op = await reserve();
  await identity(op);
  await provision();
  await claim();
  await sql`UPDATE public.admin_user_creation_operations SET delivery_started_at=now()-interval '61 seconds'`;
  assert.equal((await claim(operation, id(13), true)).claimed, false);
  await sql`UPDATE public.admin_user_creation_operations SET delivery_started_at=now()-interval '301 seconds'`;
  assert.equal((await claim()).claimed, false);
  assert.equal((await claim(operation, id(13), true)).claimed, true);
  await assert.rejects(record("accepted"), /substituída/);
});

async function authCreationSteps(tx, op) {
  await tx`INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
    VALUES(${op.userId},${op.payload.email},'{}','{"provider":"email","providers":["email"]}')`;
  await tx`UPDATE auth.users SET role='authenticated' WHERE id=${op.userId}`;
  await tx`UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data || ${tx.json({ admin_creation_operation: op.operationId })}::jsonb WHERE id=${op.userId}`;
}
test("0021 reproduces GoTrue creation rollback; 0022 resumes the same reservation", async () => {
  const op = await reserve();
  const historical = readFileSync(
    resolve(repo, "drizzle/migrations/0021_admin_user_creation_operations.sql"),
    "utf8",
  );
  const originalGuard = historical
    .match(/CREATE FUNCTION public\.guard_admin_creation_auth_identity\(\)[\s\S]*?\$\$;/)[0]
    .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx.unsafe(originalGuard);
      await authCreationSteps(tx, op);
    }),
    /operação pendente/,
  );
  assert.equal(
    (await sql`SELECT count(*)::int AS count FROM auth.users WHERE id=${op.userId}`)[0].count,
    0,
  );
  assert.equal(
    (
      await sql`SELECT stage FROM public.admin_user_creation_operations WHERE id=${op.operationId}`
    )[0].stage,
    "reserved",
  );
  // Failed transaction restores the patched guard as well as rolling back Auth.
  await sql.begin((tx) => authCreationSteps(tx, op));
  assert.equal(
    (await sql`SELECT status FROM public.profiles WHERE id=${op.userId}`)[0].status,
    "inactive",
  );
  assert.equal(
    (
      await sql`SELECT count(*)::int AS count FROM public.user_modules WHERE user_id=${op.userId}`
    )[0].count,
    0,
  );
  assert.equal((await provision()).stage, "provisioned");
  assert.equal(
    (
      await sql`SELECT count(*)::int AS count FROM public.admin_audit_logs WHERE action='user_created'`
    )[0].count,
    1,
  );
});
test("initial missing provenance cannot provision or activate the reserved account", async () => {
  const op = await reserve();
  await sql`INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES(${op.userId},${op.payload.email},'{}','{"provider":"email"}')`;
  await sql`UPDATE auth.users SET role='authenticated' WHERE id=${op.userId}`;
  await sql`UPDATE public.profiles SET status='active' WHERE id=${op.userId}`;
  assert.equal(
    (await sql`SELECT status FROM public.profiles WHERE id=${op.userId}`)[0].status,
    "inactive",
  );
  await assert.rejects(provision(), /Identidade/);
  await assert.rejects(
    sql`INSERT INTO public.user_modules(user_id,module) VALUES(${op.userId},'tickets')`,
    /pendente/,
  );
  await assert.rejects(claim(), /concluído/);
});
test("initialization cannot change email/UUID or set a foreign marker", async () => {
  const op = await reserve();
  await sql`INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES(${op.userId},${op.payload.email},'{}','{"provider":"email"}')`;
  await assert.rejects(
    sql`UPDATE auth.users SET email='changed@iga-test.example' WHERE id=${op.userId}`,
    /operação pendente/,
  );
  await assert.rejects(
    sql`UPDATE auth.users SET id=${id(99)} WHERE id=${op.userId}`,
    /operação pendente/,
  );
  await assert.rejects(
    sql`UPDATE auth.users SET raw_app_meta_data=${sql.json({ admin_creation_operation: otherOperation })} WHERE id=${op.userId}`,
    /operação pendente/,
  );
  await assert.rejects(sql`DELETE FROM auth.users WHERE id=${op.userId}`, /operação pendente/);
});
test("once installed, the operation marker cannot be removed during reservation", async () => {
  const op = await reserve();
  await sql.begin((tx) => authCreationSteps(tx, op));
  await assert.rejects(
    sql`UPDATE auth.users SET raw_app_meta_data='{"provider":"email"}' WHERE id=${op.userId}`,
    /operação pendente/,
  );
  await sql`UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data || '{"additional":"allowed"}'::jsonb WHERE id=${op.userId}`;
  assert.equal(
    (
      await sql`SELECT raw_app_meta_data->>'admin_creation_operation' AS marker FROM auth.users WHERE id=${op.userId}`
    )[0].marker,
    op.operationId,
  );
});

test("0022 patch preserves a failed reservation and reuses its original user UUID", async () => {
  const op = await reserve();
  const historical = readFileSync(
    resolve(repo, "drizzle/migrations/0021_admin_user_creation_operations.sql"),
    "utf8",
  );
  const oldGuard = historical
    .match(/CREATE FUNCTION public\.guard_admin_creation_auth_identity\(\)[\s\S]*?\$\$;/)[0]
    .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
  await sql.begin((tx) => tx.unsafe(oldGuard));
  await assert.rejects(
    sql.begin((tx) => authCreationSteps(tx, op)),
    /operação pendente/,
  );
  const before = await snapshot();
  const patch = readFileSync(
    resolve(repo, "drizzle/migrations/0022_allow_auth_creation_metadata_initialization.sql"),
    "utf8",
  );
  await sql.begin((tx) => tx.unsafe(patch));
  assert.equal(await snapshot(), before);
  await sql.begin((tx) => authCreationSteps(tx, op));
  const done = await provision();
  assert.equal(done.userId, op.userId);
  assert.equal(done.operationId, op.operationId);
  assert.equal(
    (await sql`SELECT count(*)::int AS count FROM public.admin_user_creation_operations`)[0].count,
    1,
  );
});
