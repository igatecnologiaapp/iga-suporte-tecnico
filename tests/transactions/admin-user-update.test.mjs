import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../..");
const require = createRequire(resolve(repo, "package.json"));
const postgres = require("postgres");
const url = new URL(process.env.IGA_ATOMIC_TEST_DB || "");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Loopback required");
assert.ok(["55432", "55422"].includes(url.port), "Dedicated local test port required");
assert.match(
  url.pathname,
  /^\/iga_atomic_test_[a-zA-Z0-9_]+$/,
  "Disposable database name required",
);
const sql = postgres(url.href, { max: 6, onnotice() {} });
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const primary = id(1),
  ordinary = id(2),
  target = id(3),
  other = id(4),
  inactive = id(5),
  viewer = id(6);
const oldTech = id(10),
  newTech = id(11),
  occupiedTech = id(12);

before(async () => {
  const [{ count }] =
    await sql`SELECT count(*)::int FROM information_schema.tables WHERE table_schema IN ('public','auth','storage')`;
  assert.equal(count, 0, "Refusing any database that already contains application tables");
  await sql.unsafe(readFileSync(resolve(import.meta.dirname, "bootstrap.sql"), "utf8"));
  const directory = resolve(repo, "drizzle/migrations");
  const files = readdirSync(directory)
    .filter((name) => /^00(?:0\d|1\d|20)_.*\.sql$/.test(name))
    .sort();
  assert.equal(files.length, 21);
  for (const file of files)
    await sql.begin((tx) => tx.unsafe(readFileSync(resolve(directory, file), "utf8")));
});

beforeEach(async () => {
  for (const table of ["profiles", "user_roles", "user_modules", "technicians", "admin_audit_logs"])
    await sql.unsafe(`DROP TRIGGER IF EXISTS atomic_test_fail ON public.${table}`);
  await sql`TRUNCATE auth.users, public.profiles CASCADE`;
  for (let n = 1; n <= 6; n++)
    await sql`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${id(n)},${`user${n}@iga-test.example`},'{}')`;
  await sql`UPDATE public.user_roles SET role = 'admin' WHERE user_id IN (${ordinary},${inactive})`;
  await sql`UPDATE public.profiles SET status = 'inactive' WHERE id = ${inactive}`;
  await sql`INSERT INTO public.primary_admin(user_id) VALUES(${primary})`;
  for (const user of [ordinary, inactive, viewer])
    await sql`INSERT INTO public.user_modules(user_id,module) VALUES(${user},'users')`;
  for (const module of ["tickets", "companies"])
    await sql`INSERT INTO public.user_modules(user_id,module) VALUES(${target},${module})`;
  await sql`INSERT INTO public.technicians(id,user_id,name,email) VALUES
    (${oldTech},${target},'Old','old@iga-test.example'),
    (${newTech},NULL,'New','new@iga-test.example'),
    (${occupiedTech},${other},'Occupied','occupied@iga-test.example')`;
});

after(async () => {
  await sql.end();
});

async function call(actor, patch, user = target) {
  return sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`SELECT set_config('request.jwt.claim.sub', ${actor || ""}, true)`;
    return tx`SELECT public.update_admin_user_atomic(${user}::uuid,${tx.json(patch)}::jsonb) AS result`;
  });
}
async function snapshot() {
  const rows = {};
  for (const table of ["profiles", "user_roles", "user_modules", "technicians", "admin_audit_logs"])
    rows[table] = await sql.unsafe(`SELECT * FROM public.${table} ORDER BY id`);
  return JSON.stringify(rows);
}
async function denied(actor, patch, pattern, user) {
  const before = await snapshot();
  await assert.rejects(call(actor, patch, user), pattern);
  assert.equal(await snapshot(), before, "Rejected request must not change any table or audit");
}
async function inject(table, condition = "true") {
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.atomic_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF ${condition} THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER atomic_test_fail AFTER INSERT OR UPDATE ON public.${table}
    FOR EACH ROW EXECUTE FUNCTION public.atomic_test_fail()`);
}

test("ordinary administrator may update basic data with unchanged permissions", async () => {
  await call(ordinary, {
    fullName: "Updated",
    phone: "123",
    role: "viewer",
    modules: ["tickets", "companies"],
  });
  const [profile] = await sql`SELECT full_name,phone FROM public.profiles WHERE id=${target}`;
  assert.deepEqual(profile, { full_name: "Updated", phone: "123" });
  const [{ count }] = await sql`SELECT count(*)::int FROM public.admin_audit_logs`;
  assert.equal(count, 1);
});
test("audit records the actor and normalized database field names", async () => {
  await call(ordinary, { fullName: " Updated ", phone: " " });
  const [entry] = await sql`SELECT actor_id,target_user_id,new_value FROM public.admin_audit_logs`;
  assert.equal(entry.actor_id, ordinary);
  assert.equal(entry.target_user_id, target);
  assert.deepEqual(entry.new_value, { full_name: "Updated", phone: null });
});

test("ordinary admin may deactivate a non-primary user with matching audit", async () => {
  await call(ordinary, { status: "inactive" });
  assert.equal(
    (await sql`SELECT status FROM public.profiles WHERE id=${target}`)[0].status,
    "inactive",
  );
  assert.equal(
    (await sql`SELECT action FROM public.admin_audit_logs`)[0].action,
    "user_deactivated",
  );
});

test("last active administrator cannot deactivate itself without a primary", async () => {
  await sql`DELETE FROM public.primary_admin`;
  await sql`UPDATE public.profiles SET status='inactive' WHERE id=${primary}`;
  await denied(ordinary, { fullName: "Forbidden", status: "inactive" }, /pelo menos um/, ordinary);
});

test("explicit unlink and empty module list preserve existing supported operations", async () => {
  await call(primary, { technicianId: null, modules: [] });
  assert.equal(
    (await sql`SELECT count(*)::int AS count FROM public.technicians WHERE user_id=${target}`)[0]
      .count,
    0,
  );
  assert.equal(
    (await sql`SELECT count(*)::int AS count FROM public.user_modules WHERE user_id=${target}`)[0]
      .count,
    0,
  );
});

test("forbidden role rejects the whole mixed request", () =>
  denied(ordinary, { fullName: "Forbidden", role: "admin" }, /Principal/));
test("forbidden modules reject the whole mixed request", () =>
  denied(ordinary, { fullName: "Forbidden", modules: ["inbox"] }, /Principal/));
test("ordinary administrator cannot edit the principal", () =>
  denied(ordinary, { fullName: "Forbidden" }, /Principal/, primary));
test("principal cannot be demoted or disabled", async () => {
  await denied(primary, { fullName: "Forbidden", role: "viewer" }, /reduzido/, primary);
  await denied(primary, { status: "inactive" }, /desativado/, primary);
});
test("principal keeps full access and may edit own basic data", async () => {
  await call(primary, { fullName: "Principal", modules: [] }, primary);
  const [{ full_name }] = await sql`SELECT full_name FROM public.profiles WHERE id=${primary}`;
  assert.equal(full_name, "Principal");
  assert.equal(
    (await sql`SELECT public.has_module(${primary},'users') AS allowed`)[0].allowed,
    true,
  );
});
test("actor identity cannot be forged and direct anonymous/service-role execution is denied", async () => {
  await denied(ordinary, { fullName: "Forbidden", actorId: primary }, /Campo/);
  for (const role of ["anon", "service_role"])
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL ROLE ${role}`);
        return tx`SELECT public.update_admin_user_atomic(${target},'{}')`;
      }),
      /permission denied/,
    );
  await denied(null, {}, /Autenticação/);
});
test("inactive and non-admin accounts cannot use the RPC", async () => {
  await denied(inactive, { fullName: "Forbidden" }, /administradores/);
  await denied(viewer, { fullName: "Forbidden" }, /administradores/);
  await sql`DELETE FROM public.user_modules WHERE user_id=${ordinary}`;
  await denied(ordinary, { fullName: "Forbidden" }, /administradores/);
});
test("nonexistent target or invalid inputs never write", async () => {
  await denied(primary, { fullName: "Forbidden" }, /não encontrado/, id(99));
  for (const patch of [
    { role: null },
    { role: "root" },
    { modules: ["unknown"] },
    { status: "bad" },
    { technicianId: 4 },
  ])
    await denied(primary, patch, /inválid/);
});
test("invalid or occupied technician is rejected before basic data writes", async () => {
  await denied(primary, { fullName: "Forbidden", technicianId: id(99) }, /não encontrado/);
  await denied(primary, { fullName: "Forbidden", technicianId: occupiedTech }, /outro usuário/);
});
test("successful update commits profile, role, modules, technician and audit", async () => {
  await call(primary, {
    fullName: "All",
    role: "technician",
    modules: ["inbox"],
    technicianId: newTech,
  });
  assert.equal(
    (await sql`SELECT role FROM public.user_roles WHERE user_id=${target}`)[0].role,
    "technician",
  );
  assert.deepEqual(
    (await sql`SELECT module FROM public.user_modules WHERE user_id=${target}`).map(
      (row) => row.module,
    ),
    ["inbox"],
  );
  assert.equal(
    (await sql`SELECT id FROM public.technicians WHERE user_id=${target}`)[0].id,
    newTech,
  );
  assert.equal((await sql`SELECT count(*)::int AS count FROM public.admin_audit_logs`)[0].count, 4);
});
for (const [table, condition, patch] of [
  ["profiles", "true", { fullName: "Failure" }],
  ["user_roles", "true", { fullName: "Failure", role: "technician" }],
  ["user_modules", "NEW.module = 'inbox'", { fullName: "Failure", modules: ["inbox"] }],
  ["technicians", `NEW.id = '${newTech}'::uuid`, { fullName: "Failure", technicianId: newTech }],
  [
    "admin_audit_logs",
    "NEW.action = 'modules_changed'",
    { fullName: "Failure", role: "technician", technicianId: newTech, modules: ["inbox"] },
  ],
])
  test(`failure in ${table} rolls back all previous data and audit`, async () => {
    await inject(table, condition);
    await denied(primary, patch, /synthetic failure/);
  });

async function waitForBlockedRpc() {
  for (let n = 0; n < 100; n++) {
    const rows = await sql`SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock'
      AND query LIKE '%update_admin_user_atomic%' AND pid <> pg_backend_pid()`;
    if (rows.length) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Second RPC did not wait on the administrative write lock");
}

test("concurrent updates serialize complete changes without mixed state", async () => {
  let release, firstReady;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    firstReady = resolve;
  });
  const first = sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`SELECT set_config('request.jwt.claim.sub', ${primary}, true)`;
    await tx`SELECT public.update_admin_user_atomic(${target},'{"fullName":"First","phone":"1"}')`;
    firstReady();
    await hold;
  });
  await ready;
  const second = call(primary, { fullName: "Second", phone: "2" });
  try {
    await waitForBlockedRpc();
  } finally {
    release();
  }
  await Promise.all([first, second]);
  assert.deepEqual((await sql`SELECT full_name,phone FROM public.profiles WHERE id=${target}`)[0], {
    full_name: "Second",
    phone: "2",
  });
});

test("permission revoked by concurrent transaction is rechecked before writes", async () => {
  let release, firstReady;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    firstReady = resolve;
  });
  const first = sql.begin(async (tx) => {
    await tx`UPDATE public.profiles SET status='inactive' WHERE id=${ordinary}`;
    firstReady();
    await hold;
  });
  await ready;
  const second = assert.rejects(call(ordinary, { fullName: "Forbidden" }), /administradores/);
  try {
    await waitForBlockedRpc();
  } finally {
    release();
  }
  await Promise.all([first, second]);
  assert.notEqual(
    (await sql`SELECT full_name FROM public.profiles WHERE id=${target}`)[0].full_name,
    "Forbidden",
  );
  assert.equal((await sql`SELECT count(*)::int AS count FROM public.admin_audit_logs`)[0].count, 0);
});
