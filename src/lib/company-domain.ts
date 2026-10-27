/** Área: Preservação do domínio opcional e preparação segura de links de exibição. */
/** Keep Lovable's free-text storage contract; normalize only links for display. */
export function domainFromForm(form: FormData, current?: string | null): string | null {
  if (!form.has("domain")) return current ?? null;
  return String(form.get("domain") ?? "").trim() || null;
}

/** Extrai um domínio utilizável como link sem descartar o texto cadastrado. */
export function normalizeDomain(raw: string): string | null {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  if (!value) return null;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(value) ? value : null;
}
