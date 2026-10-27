/** Área: Formatação de exibição, posição do cursor e limites nacionais de cada campo. */
/** Presentation only: every digit, including an explicit country code, is preserved. */
export function formatPhone(value: string | null | undefined, partial = false): string {
  if (!value?.trim()) return "";
  const raw = value.trim();
  if (!/^\+?[\d\s().-]*$/.test(raw)) return value;
  const digits = raw.replace(/\D/g, "");
  const explicitCountry = raw.startsWith("+");
  if (explicitCountry && !/^\+\s*55/.test(raw)) return value;
  const country = explicitCountry || (digits.startsWith("55") && [12, 13].includes(digits.length));
  const local = country ? digits.slice(2) : digits;
  if (local.length > 11) return value;
  if (!partial && local.length < 10) {
    if (!country && [8, 9].includes(local.length))
      return `${local.slice(0, -4)}-${local.slice(-4)}`;
    return value;
  }
  const prefix = country ? "+55" : "";
  if (!local) return prefix;
  let result = `(${local.slice(0, 2)}`;
  if (local.length >= 2) result += ")";
  const number = local.slice(2);
  if (number) {
    const group = number.length > 8 ? 5 : 4;
    result += ` ${number.slice(0, group)}`;
    if (number.length > group) result += `-${number.slice(group)}`;
  }
  return prefix ? `${prefix} ${result}` : result;
}

/** Keep edits near the same digit even when punctuation moves around them. */
export function phoneCaret(value: string, digitCount: number) {
  if (!digitCount) return value.startsWith("+") ? 1 : 0;
  let count = 0;
  for (let index = 0; index < value.length; index++)
    if (/\d/.test(value[index]!) && ++count === digitCount) return index + 1;
  return value.length;
}

export type PhoneKind = "phone" | "whatsapp";
export const phoneLimits = { phone: 10, whatsapp: 11 } as const;
/** Aplica o limite nacional específico de Telefone ou WhatsApp, contando o DDD. */
export function phoneFieldError(value: string, kind: PhoneKind): string | null {
  const label = kind === "phone" ? "Telefone" : "WhatsApp";
  if (value.replace(/\D/g, "").length > phoneLimits[kind])
    return `${label} aceita no máximo ${phoneLimits[kind]} dígitos, incluindo o DDD.`;
  if (value.trim().startsWith("+")) return "Informe apenas o DDD e o número, sem código do país.";
  return null;
}
/** Fixed national field masks. Oversized existing values are never shortened. */
export function formatPhoneField(value: string, kind: PhoneKind) {
  if (!/^\+?[\d\s().-]*$/.test(value.trim())) return value;
  if (phoneFieldError(value, kind)) return formatPhone(value);
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const subscriber = digits.slice(2);
  const group = kind === "phone" ? 4 : 5;
  return `(${digits.slice(0, 2)}${digits.length >= 2 ? ")" : ""}${subscriber ? ` ${subscriber.slice(0, group)}` : ""}${subscriber.length > group ? `-${subscriber.slice(group)}` : ""}`;
}
