/** Área: Paleta de categorias e contraste das etiquetas compartilhadas pelos cadastros. */
export const categoryColors = [
  {
    value: "#0ea5e9",
    label: "Azul",
    light: "#bae6fd",
    dark: "#0c4a6e",
    text: "#075985",
    darkText: "#7dd3fc",
  },
  {
    value: "#eab308",
    label: "Amarelo",
    light: "#fef08a",
    dark: "#624613",
    text: "#854d0e",
    darkText: "#fde047",
  },
  {
    value: "#ec4899",
    label: "Rosa",
    light: "#fbcfe8",
    dark: "#641d41",
    text: "#9d174d",
    darkText: "#f9a8d4",
  },
  {
    value: "#8b5cf6",
    label: "Roxo",
    light: "#ddd6fe",
    dark: "#43266b",
    text: "#5b21b6",
    darkText: "#c4b5fd",
  },
  {
    value: "#10b981",
    label: "Verde",
    light: "#a7f3d0",
    dark: "#124c3a",
    text: "#065f46",
    darkText: "#6ee7b7",
  },
  {
    value: "#f97316",
    label: "Laranja",
    light: "#fed7aa",
    dark: "#5c3519",
    text: "#9a3412",
    darkText: "#fdba74",
  },
  {
    value: "#ef4444",
    label: "Vermelho",
    light: "#fecaca",
    dark: "#60252d",
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
