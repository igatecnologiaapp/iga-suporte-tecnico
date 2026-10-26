import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompanyList, type CompanyListFilters } from "../../src/lib/company-list.ts";

test("company list uses natural Portuguese ordering without mutating authorized data", () => {
  const rows = Object.freeze([
    Object.freeze({ id: "b", trade_name: "Beta", status: "active", domain: null }),
    Object.freeze({
      id: "a10",
      trade_name: "Alfa 10",
      status: "inactive",
      domain: "Sem site / interno",
    }),
    Object.freeze({ id: "a2", trade_name: "Álfa 2", status: "active", domain: " alfa.example " }),
  ]);
  const filters: CompanyListFilters = {
    search: "",
    categoryId: "",
    status: "all",
    sort: "name_asc",
    domain: "all",
  };
  const original = JSON.stringify(rows);
  const view = buildCompanyList(rows, [], filters);
  assert.deepEqual(
    view.rows.map((row) => row.id),
    ["a2", "a10", "b"],
  );
  assert.deepEqual(view.counts, { all: 3, active: 2, inactive: 1 });
  const inactive = buildCompanyList(rows, [], {
    ...filters,
    status: "inactive",
    domain: "present",
  });
  assert.deepEqual(
    inactive.rows.map((row) => row.id),
    ["a10"],
  );
  assert.deepEqual(inactive.counts, { all: 2, active: 1, inactive: 1 });
  assert.equal(inactive.rows[0]?.domain, "Sem site / interno");
  assert.equal(JSON.stringify(rows), original);
});
