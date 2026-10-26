// Synthetic in-memory services. No credentials, production client or network calls.
type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: Error | { code: string; message: string } | null };
interface Query {
  then(resolve: (value: Result) => void): Promise<void>;
  select(): Query;
  order(): Query;
  limit(): Query;
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
    { id: "cat-a", name: "Sistema sintético", status: "active", parent_id: null },
    { id: "cat-b", name: "Treinamento sintético", status: "active", parent_id: null },
    { id: "sub-a", name: "Subcategoria Alfa", status: "active", parent_id: "cat-a" },
    { id: "sub-b", name: "Subcategoria Beta", status: "active", parent_id: "cat-a" },
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
  notifications: [],
};
if (params.has("empty")) database.companies = [];
export const writes: { table: string; operation: string; payload: unknown }[] = [];
let failOnce = params.has("error");
Object.assign(window, { testDatabase: database, testWrites: writes });
function query(table: string) {
  let operation = "select";
  let payload: Row | Row[] = {};
  const filters: ((row: Row) => boolean)[] = [];
  const api: Query = {
    select: () => api,
    order: () => api,
    limit: () => api,
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
      if (params.has("loading")) await new Promise((r) => setTimeout(r, 1200));
      if (
        failOnce &&
        table === (params.has("category-error") ? "company_ticket_categories" : "companies")
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
      resolve({ data: selected, error: null });
    },
  };
  return api;
}
export const supabase = {
  from: query,
  rpc: async () => ({ data: [], error: null }),
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
  }
}
