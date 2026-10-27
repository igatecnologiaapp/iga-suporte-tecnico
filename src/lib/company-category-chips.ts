/** Área: Apresentação dos vínculos de categorias da empresa, agrupados por categoria superior. */
import { categoryColor } from "./category-colors.ts";
type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  status: string;
  color?: string | null;
};
type Link = { company_id: string; category_id: string; is_default: boolean };
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Agrupa cada pai antes de seus filhos; cada etiqueta mostra somente seu próprio nome. */
export function buildCompanyCategoryChips(
  links: readonly Link[],
  categories: readonly Category[],
  companyId: string,
) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const own = links.filter((link) => link.company_id === companyId);
  const defaultFamilies = new Set(
    own
      .filter((link) => link.is_default)
      .map((link) => byId.get(link.category_id)?.parent_id ?? link.category_id),
  );
  return own
    .map((link) => {
      const category = byId.get(link.category_id);
      const familyId = category?.parent_id ?? link.category_id;
      const parent = category?.parent_id ? byId.get(category.parent_id) : null;
      const familyName = category?.parent_id
        ? (parent?.name ?? "Categoria indisponível")
        : (category?.name ?? "Categoria indisponível");
      return {
        ...link,
        color: categoryColor(category?.color),
        name: `${category?.name ?? "Categoria indisponível"}${category?.status === "inactive" ? " (inativa)" : ""}`,
        familyId,
        familyName,
        child: Boolean(category?.parent_id),
        rawName: category?.name ?? "",
      };
    })
    .sort(
      (a, b) =>
        Number(defaultFamilies.has(b.familyId)) - Number(defaultFamilies.has(a.familyId)) ||
        collator.compare(a.familyName, b.familyName) ||
        collator.compare(a.familyId, b.familyId) ||
        Number(a.child) - Number(b.child) ||
        collator.compare(a.rawName, b.rawName) ||
        collator.compare(a.category_id, b.category_id),
    );
}
