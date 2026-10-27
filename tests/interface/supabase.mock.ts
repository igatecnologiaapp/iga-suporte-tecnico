import { buildCompanyList } from "../../src/lib/company-list";
import { ticketQueues, matchesQueue } from "../../src/lib/iga";
// Synthetic in-memory services. No credentials, production client or network calls.
type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: Error | { code: string; message: string } | null };
interface Query {
  then(resolve: (value: Result) => void): Promise<void>;
  select(): Query;
  order(): Query;
  limit(): Query;
  range(start: number, end: number): Query;
  gt(key: string, value: number): Query;
  eq(key: string, value: unknown): Query;
  is(key: string, value: unknown): Query;
  not(key: string, op: string, values: string): Query;
  in(key: string, values: unknown[]): Query;
  update(value: Row): Query;
  insert(value: Row): Query;
  upsert(value: Row[]): Query;
  delete(): Query;
}
const params = new URLSearchParams(location.search);
export const database = {
  companies: [
    {
      id: "company-a",
      created_at: "2026-01-02T12:00:00Z",
      legal_name: "Empresa Alfa Sintética Ltda",
      trade_name: "Alfa Sintética",
      tax_id: "00000000000100",
      domain: "alfa.example",
      status: "active",
      phone: "",
      whatsapp: "",
      email: "contato@alfa.example",
    },
    {
      id: "company-b",
      created_at: "2026-01-03T12:00:00Z",
      legal_name: "Empresa Beta Sintética Ltda",
      trade_name: "Beta Sintética",
      tax_id: "00000000000200",
      domain: "Sem site / interno",
      status: "active",
    },
    {
      id: "company-c",
      created_at: "2026-01-01T12:00:00Z",
      legal_name: "Empresa Arquivada Sintética",
      trade_name: "Arquivo Sintético",
      tax_id: "00000000000300",
      domain: "HTTPS://WWW.ARQUIVO.EXAMPLE/path",
      status: "inactive",
    },
    {
      id: "company-no-domain",
      created_at: "2026-01-04T12:00:00Z",
      legal_name: "Cliente sintético sem domínio",
      trade_name: "Cliente sem domínio",
      tax_id: "00000000000500",
      domain: null,
      status: "active",
    },
  ],
  ticket_categories: [
    { id: "cat-a", name: "Sistema sintético", color: "#0ea5e9", status: "active", parent_id: null },
    {
      id: "cat-b",
      name: "Treinamento sintético",
      color: "#0ea5e9",
      status: "active",
      parent_id: null,
    },
    {
      id: "sub-a",
      name: "Subcategoria Alfa",
      color: "#0ea5e9",
      status: "active",
      parent_id: "cat-a",
    },
    {
      id: "sub-b",
      name: "Subcategoria Beta",
      color: "#0ea5e9",
      status: "active",
      parent_id: "cat-a",
    },
  ],
  company_ticket_categories: [
    {
      company_id: "company-a",
      created_at: "2026-01-02T12:00:00Z",
      category_id: "cat-a",
      is_default: true,
    },
    {
      company_id: "company-a",
      created_at: "2026-01-02T12:00:00Z",
      category_id: "cat-b",
      is_default: false,
    },
    {
      company_id: "company-a",
      created_at: "2026-01-02T12:00:00Z",
      category_id: "sub-a",
      is_default: false,
    },
  ],
  contacts: Array.from({ length: 12 }, (_, index) => ({
    id: `contact-${index + 1}`,
    company_id: index < 7 ? "company-a" : index < 10 ? "company-b" : "company-c",
    job_title: index === 0 ? "Proprietário" : null,
    whatsapp: index === 1 ? "(11) 90000-0002" : null,
    name: `Contato ${String(index + 1).padStart(2, "0")}`,
    phone: index === 0 ? "(11) 90000-0001" : "",
    email: `contact${index + 1}@iga-test.example`,
    status: index === 11 ? "inactive" : "active",
    is_primary: index === 0,
  })),
  technicians: [
    { id: "tech-one", user_id: "synthetic-user", name: "Técnico de teste", status: "active" },
  ],
  sla_policies: [],
  tickets: Array.from({ length: 12 }, (_, index) => ({
    id: `ticket-${index + 1}`,
    number: `CH-${String(index + 1).padStart(6, "0")}`,
    subject: `Chamado sintético ${index + 1}`,
    status: index < 6 ? "new" : "resolved",
    priority: "normal",
    company_id: "company-a",
    assigned_technician_id: index % 2 === 0 ? "tech-one" : null,
    companies: { trade_name: "Alfa Sintética" },
    technicians: index % 2 === 0 ? { name: "Técnico de teste" } : null,
    opened_at: new Date(Date.UTC(2026, 0, 20 - index)).toISOString(),
    last_activity_at: "2026-01-20T12:00:00Z",
    resolved_at: index < 6 ? null : "2026-01-21T12:00:00Z",
  })),
  conversations: params.has("inbox-badge")
    ? Array.from({ length: 501 }, (_, index) => ({ id: `conversation-${index}`, unread_count: 1 }))
    : [],
  notifications: [],
};
if (params.has("pagination")) {
  for (let index = 1; index <= 9; index++)
    database.companies.push({
      id: `company-extra-${index}`,
      created_at: new Date(Date.UTC(2026, 1, index)).toISOString(),
      legal_name: `Empresa extra ${index}`,
      trade_name: `Empresa ${String(index).padStart(2, "0")}`,
      tax_id: `extra-${index}`,
      domain: index % 2 ? "extra.example" : null,
      status: "active",
    });
}
if (params.has("category-list")) {
  for (let index = 1; index <= 8; index++)
    database.ticket_categories.push({
      id: `cat-extra-${index}`,
      color: "#0ea5e9",
      name: `Categoria ${String(index).padStart(2, "0")}`,
      parent_id: null,
      status: index === 8 ? "inactive" : "active",
    });
  database.ticket_categories.push({
    id: "cat-archived",
    color: "#ef4444",
    name: "Z Principal arquivada",
    parent_id: null,
    status: "inactive",
  });
  database.ticket_categories.push({
    id: "sub-archived-parent",
    color: "#8b5cf6",
    name: "Filha de arquivada",
    parent_id: "cat-archived",
    status: "active",
  });
}
if (params.has("unformatted-phones")) {
  database.contacts[0]!.phone = "11900000001";
  database.contacts[1]!.whatsapp = "11900000002";
}
if (params.has("empty")) database.companies = [];
export const writes: { table: string; operation: string; payload: unknown }[] = [];
let failOnce = params.has("error");
let failPageOnce = params.has("page-failure");
Object.assign(window, {
  testDatabase: database,
  testWrites: writes,
  testPageReads: [],
  testPageResponses: [],
  testInboxReads: [],
});
function query(table: string) {
  let operation = "select";
  let payload: Row | Row[] = {};
  const filters: ((row: Row) => boolean)[] = [];
  let start = 0,
    end = Infinity;
  const api: Query = {
    select: () => api,
    order: () => api,
    limit: () => api,
    range: (from, to) => {
      start = from;
      end = to;
      return api;
    },
    gt: (key, value) => {
      filters.push((row) => Number(row[key]) > value);
      return api;
    },
    eq: (key, value) => {
      filters.push((row) => row[key] === value);
      return api;
    },
    is: (key, value) => {
      filters.push((row) => row[key] === value);
      return api;
    },
    not: (key, _op, values) => {
      const ids = values.slice(1, -1).split(",");
      filters.push((row) => !ids.includes(String(row[key])));
      return api;
    },
    in: (key, values) => {
      filters.push((row) => values.includes(row[key]));
      return api;
    },
    update: (value) => {
      operation = "update";
      payload = value;
      return api;
    },
    insert: (value) => {
      operation = "insert";
      payload = value;
      return api;
    },
    upsert: (value) => {
      operation = "upsert";
      payload = value;
      return api;
    },
    delete: () => {
      operation = "delete";
      return api;
    },
    then: async (resolve) => {
      if (table === "conversations") window.testInboxReads.push({ start, end });
      if (params.has("loading")) await new Promise((r) => setTimeout(r, 1200));
      if (
        failOnce &&
        table === (params.has("category-error") ? "ticket_categories" : "companies")
      ) {
        failOnce = false;
        resolve({ data: null, error: new Error("Falha sintética de carregamento") });
        return;
      }
      const store = database as Record<string, Row[]>;
      const rows = store[table] ?? [];
      const selected = rows.filter((row) => filters.every((filter) => filter(row)));
      if (operation !== "select") writes.push({ table, operation, payload });
      if (table === "companies" && (operation === "insert" || operation === "update")) {
        const candidate = (payload as Row)["tax_id"];
        const duplicate = rows.some(
          (row) =>
            row["tax_id"] === candidate && (operation === "insert" || !selected.includes(row)),
        );
        if (duplicate || params.has("duplicate-tax-id") || params.has("other-unique")) {
          resolve({
            data: null,
            error: {
              code: "23505",
              message: params.has("other-unique")
                ? 'duplicate key violates unique constraint "unrelated_key"'
                : 'duplicate key violates unique constraint "companies_tax_id_key"',
            },
          });
          return;
        }
      }
      if (operation === "update") selected.forEach((row) => Object.assign(row, payload));
      if (operation === "delete") store[table] = rows.filter((row) => !selected.includes(row));
      if (operation === "insert") {
        const row = { id: "synthetic-new", ...(payload as Row) };
        rows.push(row);
        resolve({ data: [row], error: null });
        return;
      }
      if (operation === "upsert")
        for (const row of payload as Row[]) {
          if (
            !rows.some(
              (existing) =>
                existing["company_id"] === row["company_id"] &&
                existing["category_id"] === row["category_id"],
            )
          )
            rows.push({ is_default: false, ...row });
        }
      resolve({ data: selected.slice(start, end + 1), error: null });
    },
  };
  return api;
}
export const supabase = {
  from: query,
  rpc: async (name: string, args: Record<string, unknown> = {}) => {
    if (!["list_paged_records", "list_paged_contacts", "list_paged_categories"].includes(name))
      return { data: [], error: null };
    const entity =
      name === "list_paged_contacts"
        ? "contacts"
        : name === "list_paged_categories"
          ? "categories"
          : String(args["_entity"]);
    window.testPageReads.push({ ...args, _entity: entity, _rpc: name });
    if (params.has("loading")) await new Promise((resolve) => setTimeout(resolve, 1200));
    if (failOnce && !params.has("category-error")) {
      failOnce = false;
      return { data: null, error: new Error("Synthetic page failure") };
    }
    const filters = args["_filters"] as Record<string, string>;
    const size = Number(args["_page_size"] ?? 5);
    const requested = Number(args["_page"] ?? 1);
    if (requested === 2 && params.has("page-race"))
      await new Promise((resolve) => setTimeout(resolve, 700));
    if (requested === 2 && failPageOnce) {
      failPageOnce = false;
      return { data: null, error: new Error("Synthetic page failure") };
    }
    let rows: Row[] = [];
    let counts = { all: 0, active: 0, inactive: 0 };
    let summary = counts;
    const queues: Record<string, number> = {};
    const source =
      (database as unknown as Record<string, Row[]>)[
        entity === "categories" ? "ticket_categories" : entity
      ] ?? [];
    summary = {
      all: source.length,
      active: source.filter((row) => row["status"] === "active").length,
      inactive: source.filter((row) => row["status"] === "inactive").length,
    };
    if (entity === "companies") {
      const view = buildCompanyList(
        database.companies,
        database.company_ticket_categories,
        filters as never,
      );
      rows = view.rows.map((row) => ({
        ...row,
        category_links: database.company_ticket_categories.filter(
          (link) => link.company_id === row.id,
        ),
      }));
      counts = view.counts;
    } else if (entity === "contacts") {
      const base = database.contacts.filter(
        (row) =>
          (!filters["companyId"] || row.company_id === filters["companyId"]) &&
          [
            row.name,
            row.email,
            row.phone,
            row.whatsapp,
            (row.phone ?? "").replace(/\D/g, ""),
            (row.whatsapp ?? "").replace(/\D/g, ""),
            row.job_title,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes((filters["search"] ?? "").trim().toLowerCase()),
      );
      counts = {
        all: base.length,
        active: base.filter((row) => row.status === "active").length,
        inactive: base.filter((row) => row.status === "inactive").length,
      };
      rows = base
        .filter((row) => filters["status"] === "all" || row.status === filters["status"])
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name, "pt-BR", { numeric: true }) *
            (filters["sort"] === "name_desc" ? -1 : 1),
        )
        .map((row) => ({
          ...row,
          companies: (() => {
            const company = database.companies.find((company) => company.id === row.company_id);
            return company ? { trade_name: company.trade_name, status: company.status } : null;
          })(),
        }));
    } else if (entity === "tickets") {
      const base = database.tickets.filter(
        (row) =>
          JSON.stringify(row)
            .toLowerCase()
            .includes((filters["search"] ?? "").toLowerCase()) &&
          (!filters["status"] || filters["status"] === "all" || row.status === filters["status"]) &&
          (!filters["priority"] || row.priority === filters["priority"]) &&
          (!filters["companyId"] || row.company_id === filters["companyId"]) &&
          (!filters["technicianId"] || row.assigned_technician_id === filters["technicianId"]),
      );
      for (const queue of ticketQueues)
        queues[queue.id] = base.filter((row) => matchesQueue(queue, row, "tech-one")).length;
      const queue = ticketQueues.find((item) => item.id === filters["queue"])!;
      rows = base
        .filter((row) => matchesQueue(queue, row, "tech-one"))
        .sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at));
      counts = { all: base.length, active: 0, inactive: 0 };
    } else {
      const base = source.filter(
        (row) =>
          (entity !== "categories" ||
            !filters["type"] ||
            filters["type"] === "all" ||
            (filters["type"] === "category" ? !row["parent_id"] : !!row["parent_id"])) &&
          JSON.stringify(row)
            .toLowerCase()
            .includes((filters["search"] ?? "").toLowerCase()),
      );
      counts = {
        all: base.length,
        active: base.filter((row) => row["status"] === "active").length,
        inactive: base.filter((row) => row["status"] === "inactive").length,
      };
      rows = base
        .filter(
          (row) => filters["status"] === "all" || row["status"] === (filters["status"] ?? "active"),
        )
        .sort(
          (a, b) =>
            String(a["name"]).localeCompare(String(b["name"]), "pt-BR", { numeric: true }) *
            (filters["sort"] === "name_desc" ? -1 : 1),
        );
    }
    const total = rows.length;
    const page = Math.max(1, Math.min(requested, Math.ceil(total / size)));
    window.testPageResponses.push({
      ...args,
      rowCount: rows.slice((page - 1) * size, page * size).length,
    });
    return {
      data: {
        rows: rows.slice((page - 1) * size, page * size),
        total,
        page,
        pageSize: size,
        counts,
        summary,
        queues,
      },
      error: null,
    };
  },
  auth: {
    signOut: async () => {
      window.testSignOutCalls = (window.testSignOutCalls ?? 0) + 1;
      if (params.has("logout-delay")) await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        error:
          params.has("logout-error") && window.testSignOutCalls === 1
            ? new Error("Synthetic logout failure")
            : null,
      };
    },
  },
};
declare global {
  interface Window {
    testDatabase: typeof database;
    testWrites: typeof writes;
    testSignOutCalls?: number;
    testPageReads: Record<string, unknown>[];
    testPageResponses: Record<string, unknown>[];
    testInboxReads: { start: number; end: number }[];
  }
}
