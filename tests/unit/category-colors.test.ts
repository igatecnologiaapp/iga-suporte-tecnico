/** Área: Contratos da paleta e da apresentação das categorias vinculadas às empresas. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categoryColor,
  categoryColors,
  defaultCategoryColor,
} from "../../src/lib/category-colors.ts";
import { buildCompanyCategoryChips } from "../../src/lib/company-category-chips.ts";

/** Calcula luminância relativa para verificar contraste dos textos nos dois temas. */
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
/** Compara a legibilidade entre primeiro plano e fundo de uma etiqueta. */
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}
test("paleta limita escolhas às sete cores e mantém textos legíveis em ambos os temas", () => {
  assert.equal(categoryColors.length, 7);
  for (const color of categoryColors) {
    assert.equal(categoryColor(color.value), color.value);
    assert.ok(contrast(color.text, color.light) >= 4.5, color.label + " claro");
    assert.ok(contrast(color.darkText, color.dark) >= 4.5, color.label + " escuro");
    assert.ok(contrast("#000000", color.value) >= 4.5, color.label + " seleção");
  }
  for (const value of [null, undefined, "#ffffff", "url(test)", {}, "#EF4444"])
    assert.equal(categoryColor(value), defaultCategoryColor);
});
test("agrupa pais antes de filhos mesmo quando os vínculos chegam fora de ordem", () => {
  const categories = [
    { id: "a", name: "Alpha", parent_id: null, color: "#ef4444", status: "active" },
    { id: "b", name: "Beta", parent_id: null, color: "#eab308", status: "active" },
    { id: "a1", name: "Filho", parent_id: "a", color: "#8b5cf6", status: "inactive" },
    { id: "b1", name: "Outro", parent_id: "b", color: "#10b981", status: "active" },
  ];
  const links = ["b1", "a1", "a", "b"].map((category_id) => ({
    company_id: "c",
    category_id,
    is_default: category_id === "b",
  }));
  const before = JSON.stringify({ links, categories });
  const chips = buildCompanyCategoryChips(links, categories, "c");
  assert.deepEqual(
    chips.map((chip) => chip.category_id),
    ["b", "b1", "a", "a1"],
  );
  assert.equal(chips[3]!.name, "Filho (inativa)");
  assert.equal(chips[3]!.color, "#8b5cf6");
  assert.equal(JSON.stringify({ links, categories }), before);
  assert.deepEqual(buildCompanyCategoryChips(links, categories, "other"), []);
});
test("filho sem vínculo do pai mostra somente seu nome sem inventar associação", () => {
  const result = buildCompanyCategoryChips(
    [{ company_id: "c", category_id: "child", is_default: false }],
    [{ id: "child", name: "Filha", parent_id: "missing", status: "active" }],
    "c",
  );
  assert.equal(result.length, 1);
  assert.equal(result[0]!.name, "Filha");
  assert.equal(result[0]!.color, defaultCategoryColor);
});
