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
    .filter((n) => /^00(?:0\d|1\d|2[0-5])_.*\.sql$/.test(n))
    .sort()) {
    // Um registro anterior à coluna comprova o padrão sem perder nome ou situação.
    if (name.startsWith("0025_"))
      await sql`insert into public.ticket_categories(id,name,status) values(${id(999)},'Categoria anterior à paleta','inactive')`;
    await sql.begin((tx) =>
      tx.unsafe(readFileSync(resolve(root, "drizzle/migrations", name), "utf8")),
    );
  }
  const [legacy] =
    await sql`select name,status,color from public.ticket_categories where id=${id(999)}`;
  assert.deepEqual(legacy, {
    name: "Categoria anterior à paleta",
    status: "inactive",
    color: "#0ea5e9",
  });
  await sql`delete from public.ticket_categories where id=${id(999)}`;
  for (let n = 1; n <= 5; n++)
    await sql`insert into auth.users(id,email,raw_user_meta_data) values(${id(n)},${`user${n}@iga-test.example`},'{}')`;
  await sql`insert into public.primary_admin(user_id) values(${id(1)})`;
  await sql`insert into public.user_modules(user_id,module) values(${id(2)},'companies'),(${id(3)},'tickets'),(${id(4)},'companies'),(${id(5)},'contacts')`;
  await sql`update public.profiles set status='inactive' where id=${id(4)}`;
  await sql`insert into public.ticket_categories(id,name) values(${id(30)},'Sistema')`;
  await sql`insert into public.ticket_categories(id,name,parent_id) values(${id(31)},'Subcategoria',${id(30)})`;
  for (let n = 1; n <= 12; n++) {
    await sql`insert into public.companies(id,legal_name,trade_name,tax_id,domain,status,created_by,created_at) values(${id(100 + n)},${`Empresa ${n}`},${`Empresa ${n}`},${`tax-${n}`},${n % 2 ? "company.example" : null},${n > 9 ? "inactive" : "active"},${id(1)},${new Date(Date.UTC(2026, 0, n))})`;
    await sql`insert into public.contacts(id,company_id,name,job_title,phone,status,created_by) values(${id(200 + n)},${n <= 7 ? id(101) : n <= 10 ? id(102) : id(110)},${`Contato ${n}`},${n === 1 ? "Proprietário" : null},${n === 1 ? "(11) 90000-0001" : null},${n === 12 ? "inactive" : "active"},${id(1)})`;
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

async function contacts(page = 1, filters = {}, actor = id(1), role = "authenticated", size = 5) {
  return sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    await tx`select set_config('request.jwt.claim.sub',${actor || ""},true)`;
    return (
      await tx`select public.list_paged_contacts(${page},${size},${tx.json(filters)}) value`
    )[0].value;
  });
}
test("contact company filters and natural reverse order retain scoped counters and global summary", async () => {
  const a = await contacts(1, { companyId: id(101), sort: "name_desc" });
  assert.equal(a.total, 7);
  assert.equal(a.rows.length, 5);
  assert.deepEqual(
    a.rows.map((row) => row.name),
    [7, 6, 5, 4, 3].map((n) => `Contato ${n}`),
  );
  assert.deepEqual(a.counts, { all: 7, active: 7, inactive: 0 });
  assert.deepEqual(a.summary, { all: 12, active: 11, inactive: 1 });
  assert.ok(
    a.rows.every((row) => row.company_id === id(101) && row.companies.trade_name === "Empresa 1"),
  );
  const b = await contacts(99, { companyId: id(110), status: "inactive" });
  assert.equal(b.page, 1);
  assert.equal(b.total, 1);
  assert.equal(b.rows[0].name, "Contato 12");
  assert.equal(b.rows[0].companies.status, "inactive");
  assert.deepEqual(b.counts, { all: 2, active: 1, inactive: 1 });
  assert.equal((await contacts(1, { companyId: id(102) })).total, 3);
});
test("contact searches include phone email and job title without changing null fields", async () => {
  for (const search of ["Proprietário", "90000-0001", "11900000001", "Contato 1"]) {
    const response = await contacts(1, { search });
    assert.ok(response.total > 0);
  }
  assert.equal((await contacts(1, { search: "Proprietário", companyId: id(102) })).total, 0);
  assert.equal((await contacts(1, { search: "%' OR true --" })).total, 0);
  const row = (await contacts(1, { search: "Contato 2" })).rows[0];
  assert.equal(row.phone, null);
  assert.equal(row.job_title, null);
});
test("contact read model respects module denial and company visibility", async () => {
  const onlyContacts = await contacts(1, {}, id(5));
  assert.equal(onlyContacts.total, 11);
  await sql.begin(async (tx) => {
    await tx.unsafe(
      "CREATE POLICY contact_test_company_scope ON public.companies AS RESTRICTIVE FOR SELECT TO authenticated USING (created_by=auth.uid())",
    );
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`select set_config('request.jwt.claim.sub',${id(5)},true)`;
    const [response] = await tx`select public.list_paged_contacts(1,5,'{}') value`;
    assert.ok(response.value.rows.every((row) => row.companies === null));
    await tx.unsafe("RESET ROLE");
    await tx.unsafe("DROP POLICY contact_test_company_scope ON public.companies");
  });
  for (const fn of [
    () => contacts(1, {}, id(2)),
    () => contacts(1, {}, id(4)),
    () => contacts(1, {}, null),
    () => contacts(1, {}, null, "anon"),
  ])
    await assert.rejects(fn(), (error) => error.code === "42501");
});
test("contact read model validates fixed page size filters and identity inputs", async () => {
  for (const fn of [
    () => contacts(0),
    () => contacts(1, {}, id(1), "authenticated", 10),
    () => contacts(1, { sort: "newest" }),
    () => contacts(1, { status: "archived" }),
    () => contacts(1, { search: "x".repeat(301) }),
    () => contacts(1, { actorId: id(2) }),
    () => contacts(1, { companyId: [] }),
  ])
    await assert.rejects(fn(), (error) => error.code === "22023");
  await assert.rejects(contacts(1, { companyId: "not-a-uuid" }), (error) => error.code === "22P02");
});
test("contact migration preserves the published shared RPC and denies anonymous execution", async () => {
  const oldBody = readFileSync(
    resolve(root, "drizzle/migrations/0023_paginated_record_lists.sql"),
    "utf8",
  ).match(/AS \$\$([\s\S]*?)\$\$;/)[1];
  const [prior] =
    await sql`select prosrc from pg_proc where oid='public.list_paged_records(text,integer,integer,jsonb)'::regprocedure`;
  assert.equal(prior.prosrc, oldBody);
  const [fn] =
    await sql`select prosecdef,provolatile,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where oid='public.list_paged_contacts(integer,integer,jsonb)'::regprocedure`;
  assert.equal(fn.prosecdef, false);
  assert.equal(fn.provolatile, "s");
  assert.equal(fn.anon, false);
  assert.equal(fn.service, false);
  assert.ok(fn.proconfig.includes("search_path=pg_catalog, public"));
});

/** Confere persistência da paleta sem alterar a hierarquia e os contratos de consulta. */
test("category colors reject values outside the palette and preserve links and paging", async () => {
  const before =
    await sql`select * from public.company_ticket_categories order by company_id,category_id`;
  const categories = await call("categories");
  assert.ok(categories.rows.every((row) => row.color === "#0ea5e9"));
  for (const color of [
    "#0ea5e9",
    "#eab308",
    "#ec4899",
    "#8b5cf6",
    "#10b981",
    "#f97316",
    "#ef4444",
  ]) {
    await sql`update public.ticket_categories set color=${color} where id=${id(30)}`;
    assert.equal((await call("categories")).rows.find((row) => row.id === id(30)).color, color);
  }
  for (const color of ["#ffffff", "red", "url(test)"])
    await assert.rejects(
      sql`update public.ticket_categories set color=${color} where id=${id(30)}`,
      (error) => error.code === "23514",
    );
  await assert.rejects(
    sql`update public.ticket_categories set color=null where id=${id(30)}`,
    (error) => error.code === "23502",
  );
  assert.deepEqual(
    await sql`select * from public.company_ticket_categories order by company_id,category_id`,
    before,
  );
  const [constraint] =
    await sql`select pg_get_constraintdef(oid) definition from pg_constraint where conname='ticket_categories_color_palette'`;
  assert.equal(
    constraint.definition,
    "CHECK ((color = ANY (ARRAY['#0ea5e9'::text, '#eab308'::text, '#ec4899'::text, '#8b5cf6'::text, '#10b981'::text, '#f97316'::text, '#ef4444'::text])))",
  );
});
/** Exercita atualização real com papel e módulo exigidos pelas políticas existentes. */
test("category color updates retain module and role restrictions", async () => {
  for (const n of [6, 7, 8])
    await sql`insert into auth.users(id,email,raw_user_meta_data) values(${id(n)},${`user${n}@iga-test.example`},'{}')`;
  await sql`update public.user_roles set role='supervisor' where user_id in (${id(6)},${id(8)})`;
  await sql`insert into public.user_modules(user_id,module) values(${id(6)},'categories'),(${id(7)},'categories')`;
  for (const n of [6, 7, 8]) {
    const updated = await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE authenticated");
      await tx`select set_config('request.jwt.claim.sub',${id(n)},true)`;
      return tx`update public.ticket_categories set color='#10b981' where id=${id(30)} returning id`;
    });
    assert.equal(updated.length, n === 6 ? 1 : 0);
  }
});

/** Reproduz os grants padrão do Supabase e verifica a consulta real do aplicador e a RLS. */
test("category helper accepts Supabase anon grants only when policies block anonymous access", async () => {
  const helper = readFileSync(
    resolve(root, "tests/homologation/apply-category-colors.mjs"),
    "utf8",
  );
  const query = helper.match(/`(SELECT coalesce\(json_agg[\s\S]*?FROM pg_attribute[\s\S]*?;)`/)[1];
  await sql.begin(async (tx) => {
    await tx.unsafe("GRANT SELECT, UPDATE ON public.ticket_categories TO anon");
    let [result] = await tx.unsafe(query);
    assert.equal(result.coalesce[0].anonWrite, true);
    assert.equal(result.coalesce[0].anonRlsProtected, true);
    await tx.unsafe("SET LOCAL ROLE anon");
    await tx`select set_config('request.jwt.claim.sub','',true)`;
    assert.equal((await tx`select * from public.ticket_categories`).length, 0);
    assert.equal(
      (await tx`update public.ticket_categories set color='#ef4444' returning id`).length,
      0,
    );
    await tx.unsafe("RESET ROLE");
    await tx.unsafe(
      "CREATE POLICY category_test_public_read ON public.ticket_categories FOR SELECT TO public USING (true)",
    );
    [result] = await tx.unsafe(query);
    assert.equal(result.coalesce[0].anonRlsProtected, false);
    await tx.unsafe("DROP POLICY category_test_public_read ON public.ticket_categories");
    await tx.unsafe("REVOKE SELECT, UPDATE ON public.ticket_categories FROM anon");
  });
});
