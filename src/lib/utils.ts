/** Área: Composição de classes visuais utilizadas pelos componentes. */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combina classes condicionais e resolve conflitos entre utilitários Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
