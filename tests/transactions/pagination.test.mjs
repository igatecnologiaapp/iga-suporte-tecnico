import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const postgres = createRequire(resolve(root, "package.json"))("postgres");
const url = new URL(process.env.IGA_PAGINATION_TEST_DB || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55432");
assert.match(url.pathname, /^\/iga_pagination_test_[a-z0-9_]+$/);
const sql = postgres(url.href, { max: 3, onnotice() {} });
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
before(async () => {
  assert.equal(
    (
      await sql`select count(*)::int n from information_schema.tables where table_schema in ('public','auth','storage')`
    )[0].n,
    0,
  );
  await sql.unsafe(readFileSync(resolve(import.meta.dirname, "bootstrap.sql"), "utf8"));
  for (const name of readdirSync(resolve(root, "drizzle/migrations"))
    .filter((n) => /^00(?:0\d|1\d|2[0-3])_.*\.sql$/.test(n))
    .sort())
    await sql.begin((tx) =>
      tx.unsafe(readFileSync(resolve(root, "drizzle/migrations", name), "utf8")),
    );
  for (let n = 1; n <= 4; n++)
    await sql`insert into auth.users(id,email,raw_user_meta_data) values(${id(n)},${`user${n}@iga-test.example`},'{}')`;
  await sql`insert into public.primary_admin(user_id) values(${id(1)})`;
  await sql`insert into public.user_modules(user_id,module) values(${id(2)},'companies'),(${id(3)},'tickets'),(${id(4)},'companies')`;
  await sql`update public.profiles set status='inactive' where id=${id(4)}`;
  await sql`insert into public.ticket_categories(id,name) values(${id(30)},'Sistema')`;
  await sql`insert into public.ticket_categories(id,name,parent_id) values(${id(31)},'Subcategoria',${id(30)})`;
  for (let n = 1; n <= 12; n++) {
    await sql`insert into public.companies(id,legal_name,trade_name,tax_id,domain,status,created_by,created_at) values(${id(100 + n)},${`Empresa ${n}`},${`Empresa ${n}`},${`tax-${n}`},${n % 2 ? "company.example" : null},${n > 9 ? "inactive" : "active"},${id(1)},${new Date(Date.UTC(2026, 0, n))})`;
    await sql`insert into public.contacts(id,company_id,name,created_by) values(${id(200 + n)},${id(101)},${`Contato ${n}`},${id(1)})`;
    await sql`insert into public.technicians(id,user_id,name,email,phone) values(${id(300 + n)},${n === 1 ? id(3) : null},${`Técnico ${n}`},${`tech${n}@iga-test.example`},'private-phone')`;
    await sql`insert into public.tickets(id,company_id,contact_id,subject,description,status,solution,assigned_technician_id,created_by,opened_at) values(${id(400 + n)},${id(101)},${id(201)},${`Chamado ${n}`},'Synthetic',${n <= 6 ? "new" : "resolved"},'Synthetic solution',${n % 2 ? id(301) : null},${id(1)},${new Date(Date.UTC(2026, 0, 20 - n))})`;
  }
  await sql`insert into public.company_ticket_categories(company_id,category_id,created_by) values(${id(101)},${id(30)},${id(1)}),(${id(106)},${id(30)},${id(1)})`;
  await sql`insert into public.company_ticket_categories(company_id,category_id,created_by) values(${id(101)},${id(31)},${id(1)}),(${id(106)},${id(31)},${id(1)})`;
});
after(() => sql.end());
async function call(
  entity = "companies",
  page = 1,
  size = 5,
  filters = {},
  actor = id(1),
  role = "authenticated",
) {
  return sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    await tx`select set_config('request.jwt.claim.sub',${actor || ""},true)`;
    return (
      await tx`select public.list_paged_records(${entity},${page},${size},${tx.json(filters)}) value`
    )[0].value;
  });
}
test("resource pages return five records with global totals and stable natural order", async () => {
  const a = await call(),
    b = await call("companies", 2),
    c = await call("companies", 3);
  assert.equal(a.rows.length, 5);
  assert.equal(b.rows.length, 4);
  assert.equal(c.page, 2);
  assert.equal(a.total, 9);
  assert.deepEqual(a.counts, { all: 12, active: 9, inactive: 3 });
  assert.deepEqual(a.summary, a.counts);
  assert.deepEqual(
    a.rows.map((r) => r.trade_name),
    [1, 2, 3, 4, 5].map((n) => `Empresa ${n}`),
  );
  assert.equal(new Set([...a.rows, ...b.rows].map((r) => r.id)).size, 9);
  const all = await call("companies", 3, 5, { status: "all" });
  assert.equal(all.rows.length, 2);
  assert.equal(all.total, 12);
});
test("search category domain and status share counters without truncating to current page", async () => {
  const all = await call("companies", 1, 5, { status: "all", categoryId: id(31) });
  assert.equal(all.total, 2);
  assert.ok(all.rows[0].category_links.some((link) => link.category_id === id(31)));
  const missing = await call("companies", 1, 5, { status: "all", domain: "missing" });
  assert.equal(missing.total, 6);
  assert.equal(missing.counts.all, 6);
  const empty = await call("companies", 1, 5, { status: "inactive", search: "Empresa 1" });
  assert.equal(empty.total, 3);
  assert.equal(empty.counts.active, 1);
  assert.equal(
    (await call("companies", 1, 5, { status: "all", search: "%' OR true --" })).total,
    0,
  );
});
test("contacts technicians and categories use their caller-scoped pages", async () => {
  assert.equal((await call("contacts", 2)).rows.length, 5);
  const tech = await call("technicians", 3);
  assert.equal(tech.rows.length, 2);
  assert.equal(tech.rows[0].phone, "private-phone");
  assert.equal((await call("categories")).rows.length, 2);
});
test("ticket queues and mine retain totals beyond a five-row page", async () => {
  const all = await call("tickets", 1);
  assert.equal(all.total, 12);
  assert.equal(all.rows.length, 5);
  assert.equal(all.queues.intake, 6);
  assert.equal(all.queues.resolved, 6);
  const mine = await call("tickets", 1, 5, { queue: "mine" }, id(3));
  assert.equal(mine.total, 6);
  assert.equal(mine.queues.mine, 6);
  assert.ok(mine.rows.every((row) => row.assigned_technician_id === id(301)));
  assert.equal((await call("tickets", 2, 5, { queue: "resolved" })).rows.length, 1);
  assert.equal((await call("tickets", 1, 5, { status: "new", queue: "resolved" })).total, 0);
});
test("module denial inactive identity and anonymous requests fail closed", async () => {
  for (const fn of [
    () => call("contacts", 1, 5, {}, id(2)),
    () => call("companies", 1, 5, {}, id(4)),
    () => call("companies", 1, 5, {}, null),
    () => call("companies", 1, 5, {}, null, "anon"),
  ])
    await assert.rejects(fn(), (error) => error.code === "42501");
  assert.equal((await call("companies", 1, 5, {}, id(2))).rows.length, 5);
});
test("invalid pagination or filter values cannot expand the result or inject SQL", async () => {
  for (const args of [
    ["companies", 0, 5, {}],
    ["companies", 1, 500, {}],
    ["companies", 1, 5, { unknown: "x" }],
    ["companies", 1, 5, { sort: "arbitrary" }],
    ["companies", 1, 5, { search: "x".repeat(301) }],
  ])
    await assert.rejects(call(...args), (error) => error.code === "22023");
  const [definition] =
    await sql`select prosecdef from pg_proc where oid='public.list_paged_records(text,integer,integer,jsonb)'::regprocedure`;
  assert.equal(definition.prosecdef, false);
  assert.equal(
    (
      await sql`select has_function_privilege('anon','public.list_paged_records(text,integer,integer,jsonb)','execute') allowed`
    )[0].allowed,
    false,
  );
});
