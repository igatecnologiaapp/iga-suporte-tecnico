import { test } from "node:test";
import assert from "node:assert/strict";
import { domainFromForm, normalizeDomain } from "../../src/lib/company-domain.ts";
import { companyCategoryOptions, companySubcategoryOptions } from "../../src/lib/iga.ts";

test("display normalization preserves the existing valid-link rules", () => {
  assert.equal(normalizeDomain(" HTTPS://WWW.Exemplo.COM.BR/contato "), "exemplo.com.br");
  assert.equal(normalizeDomain("sub.exemplo.com.br"), "sub.exemplo.com.br");
});
test("invalid link values remain plain text, not an unsafe href", () => {
  for (const value of [
    "localhost",
    "dominio invalido",
    "javascript:alert(1)",
    "-empresa.com",
    "empresa.c",
    "empresa.com:443",
  ])
    assert.equal(normalizeDomain(value), null);
});
test("storage keeps free text and raw valid URLs, trimming only outer spaces", () => {
  const form = new FormData();
  for (const [input, expected] of [
    ["  Sem site / interno  ", "Sem site / interno"],
    ["HTTPS://WWW.Exemplo.COM.BR/path", "HTTPS://WWW.Exemplo.COM.BR/path"],
  ]) {
    form.set("domain", input!);
    assert.equal(domainFromForm(form), expected);
  }
});
test("missing field preserves the exact stored value during partial edits", () => {
  const form = new FormData();
  form.set("trade_name", "Empresa sintética atualizada");
  assert.equal(
    domainFromForm(form, "HTTPS://WWW.EXISTENTE.EXAMPLE/path"),
    "HTTPS://WWW.EXISTENTE.EXAMPLE/path",
  );
  assert.equal(domainFromForm(form, "Sem site"), "Sem site");
  assert.equal(domainFromForm(form, null), null);
});
test("domain stays optional and explicit clearing is retained", () => {
  const form = new FormData();
  form.set("domain", "  ");
  assert.equal(domainFromForm(form, "existente.example"), null);
  assert.equal(domainFromForm(new FormData()), null);
});
const categories = [
  { id: "parent", parent_id: null, status: "active" },
  { id: "sub-a", parent_id: "parent", status: "active" },
  { id: "sub-b", parent_id: "parent", status: "active" },
  { id: "sub-inactive", parent_id: "parent", status: "inactive" },
];
test("default main category remains available through the existing helper", () => {
  const result = companyCategoryOptions(
    categories,
    [{ company_id: "company", category_id: "parent", is_default: true }],
    "company",
  );
  assert.equal(result.defaultId, "parent");
  assert.deepEqual(
    result.options.map((item) => item.id),
    ["parent"],
  );
});
test("a linked subcategory restricts the parent and becomes the default", () => {
  const result = companySubcategoryOptions(
    categories,
    [{ company_id: "company", category_id: "sub-b", is_default: false }],
    "company",
    "parent",
  );
  assert.equal(result.defaultId, "sub-b");
  assert.deepEqual(
    result.options.map((item) => item.id),
    ["sub-b"],
  );
});
test("without linked subcategories all active children stay available", () => {
  const result = companySubcategoryOptions(categories, [], "company", "parent");
  assert.equal(result.defaultId, "");
  assert.deepEqual(
    result.options.map((item) => item.id),
    ["sub-a", "sub-b"],
  );
});
test("multiple linked subcategories do not create an arbitrary default", () => {
  const result = companySubcategoryOptions(
    categories,
    ["sub-a", "sub-b"].map((id) => ({ company_id: "company", category_id: id, is_default: false })),
    "company",
    "parent",
  );
  assert.equal(result.defaultId, "");
  assert.equal(result.options.length, 2);
});
