/** Área: Etiqueta de cor compartilhada pelas categorias e pelos vínculos nas empresas. */
import type { CSSProperties } from "react";
import { categoryColor, categoryColors } from "../../lib/category-colors";

/** Mantém cor e contraste consistentes nos dois temas e identifica o padrão da empresa. */
export function CategoryChip({
  name,
  color,
  isDefault = false,
}: {
  name: string;
  color?: string | null | undefined;
  isDefault?: boolean;
}) {
  const palette = categoryColors.find((item) => item.value === categoryColor(color))!;
  const style = {
    "--category-color": palette.value,
    "--category-light": palette.light,
    "--category-dark": palette.dark,
    "--category-text": palette.text,
    "--category-dark-text": palette.darkText,
  } as CSSProperties;
  return (
    <span
      className="category-chip"
      style={style}
      data-category-color={palette.value}
      data-default={isDefault || undefined}
    >
      {name}
      {isDefault ? " — Padrão" : ""}
    </span>
  );
}
