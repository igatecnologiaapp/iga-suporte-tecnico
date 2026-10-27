/** Área: Escolha das sete cores predefinidas com prévia da etiqueta da categoria. */
import { Check } from "lucide-react";
import { categoryColors, type CategoryColor } from "../../lib/category-colors";
import { CategoryChip } from "./CategoryChip";

/** Apresenta opções circulares abaixo do nome e envia a cor escolhida pelo formulário. */
export function CategoryColorField({
  color,
  name,
  onChange,
}: {
  color: CategoryColor;
  name: string;
  onChange: (color: CategoryColor) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Cor da categoria">
        {categoryColors.map((item) => (
          <button
            key={item.value}
            type="button"
            className="category-color-option"
            title={item.label}
            aria-label={`Cor ${item.label.toLowerCase()}`}
            aria-pressed={color === item.value}
            onClick={() => onChange(item.value)}
          >
            <span
              className="category-color-swatch"
              style={{ backgroundColor: item.value, borderColor: item.value, color: item.value }}
            >
              {color === item.value && <Check aria-hidden="true" className="size-3.5 text-black" />}
            </span>
          </button>
        ))}
      </div>
      <input type="hidden" name="color" value={color} />
      <div aria-label="Prévia da categoria">
        <CategoryChip name={name.trim() || "Categoria"} color={color} />
      </div>
    </div>
  );
}
