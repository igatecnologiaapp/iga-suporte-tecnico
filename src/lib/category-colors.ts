/** Área: Paleta de categorias e contraste das etiquetas compartilhadas pelos cadastros. */
export const categoryColors = [
  {
    value: "#0ea5e9",
    label: "Azul",
    light: "#e0f2fe",
    dark: "#082f49",
    text: "#075985",
    darkText: "#7dd3fc",
  },
  {
    value: "#eab308",
    label: "Amarelo",
    light: "#fef9c3",
    dark: "#422f0c",
    text: "#854d0e",
    darkText: "#fde047",
  },
  {
    value: "#ec4899",
    label: "Rosa",
    light: "#fce7f3",
    dark: "#421528",
    text: "#9d174d",
    darkText: "#f9a8d4",
  },
  {
    value: "#8b5cf6",
    label: "Roxo",
    light: "#ede9fe",
    dark: "#2d1b46",
    text: "#5b21b6",
    darkText: "#c4b5fd",
  },
  {
    value: "#10b981",
    label: "Verde",
    light: "#d1fae5",
    dark: "#0d3328",
    text: "#065f46",
    darkText: "#6ee7b7",
  },
  {
    value: "#f97316",
    label: "Laranja",
    light: "#ffedd5",
    dark: "#3e2513",
    text: "#9a3412",
    darkText: "#fdba74",
  },
  {
    value: "#ef4444",
    label: "Vermelho",
    light: "#fee2e2",
    dark: "#401b20",
    text: "#991b1b",
    darkText: "#fca5a5",
  },
] as const;
export type CategoryColor = (typeof categoryColors)[number]["value"];
export const defaultCategoryColor: CategoryColor = "#0ea5e9";

/** Aceita somente a paleta cadastrável e mantém o azul como apresentação padrão. */
export function categoryColor(value: unknown): CategoryColor {
  return categoryColors.find((color) => color.value === value)?.value ?? defaultCategoryColor;
}
