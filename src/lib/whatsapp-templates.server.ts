/** Área: Consulta de modelos aprovados e preparação de suas variáveis. */
// Modelos (templates) aprovados da Meta — somente servidor. Nenhum token sai daqui.
import { GRAPH_BASE, graphVersion } from "./whatsapp.server";

export type TemplateVar = { key: string; example: string | null };
export type ApprovedTemplate = {
  name: string; language: string; category: string;
  header: string | null; body: string; footer: string | null;
  format: "POSITIONAL" | "NAMED"; variables: TemplateVar[];
};

const VAR_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Extrai os identificadores de variáveis exigidas pelos componentes do modelo. */
function varsOf(text: string) {
  const seen: string[] = [];
  for (const m of text.matchAll(VAR_RE)) { const k = m[1] ?? ""; if (k && !seen.includes(k)) seen.push(k); }
  return seen;
}

/** Busca modelos na conta conectada e devolve só os APROVADOS de texto suportados nesta versão. */
export async function fetchApprovedTemplates(): Promise<{ ok: true; templates: ApprovedTemplate[]; skipped: number } | { ok: false; error: string }> {
  const token = process.env["WHATSAPP_ACCESS_TOKEN"];
  const waba = process.env["WHATSAPP_BUSINESS_ACCOUNT_ID"];
  if (!token || !waba) return { ok: false, error: "Integração WhatsApp não configurada." };
  let res: Response;
  try {
    res = await fetch(`${GRAPH_BASE}/${graphVersion()}/${encodeURIComponent(waba)}/message_templates?fields=name,language,status,category,components,parameter_format&limit=250`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    });
  } catch { return { ok: false, error: "Não foi possível contatar o WhatsApp para consultar os modelos." }; }
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = body?.error?.code;
    const reason = res.status === 401 || code === 190 ? "credencial do WhatsApp inválida ou expirada"
      : res.status === 403 || code === 10 || code === 200 ? "a conta não tem permissão para ler modelos (whatsapp_business_management)"
      : String(body?.error?.message ?? "erro").slice(0, 200);
    return { ok: false, error: `Consulta de modelos recusada (HTTP ${res.status}${code ? ` código ${code}` : ""}): ${reason}.` };
  }
  const templates: ApprovedTemplate[] = []; let skipped = 0;
  for (const t of (body?.data ?? []) as any[]) {
    if (t?.status !== "APPROVED") continue;
    const comps: any[] = t.components ?? [];
    const header = comps.find(c => c.type === "HEADER");
    const bodyC = comps.find(c => c.type === "BODY");
    const footer = comps.find(c => c.type === "FOOTER");
    const unsupported = !bodyC?.text || comps.some(c => c.type === "BUTTONS" || c.type === "CAROUSEL")
      || (header && (header.format !== "TEXT" || varsOf(header.text ?? "").length > 0));
    if (unsupported) { skipped++; continue; }
    const keys = varsOf(bodyC.text);
    const named = t.parameter_format === "NAMED";
    const examples: any[] = named ? (bodyC.example?.body_text_named_params ?? []) : (bodyC.example?.body_text?.[0] ?? []);
    templates.push({
      name: String(t.name), language: String(t.language), category: String(t.category ?? ""),
      header: header?.text ?? null, body: String(bodyC.text), footer: footer?.text ?? null,
      format: named ? "NAMED" : "POSITIONAL",
      variables: keys.map((key, i) => ({ key, example: named ? (examples.find(e => e?.param_name === key)?.example ?? null) : (examples[i] ?? null) })),
    });
  }
  templates.sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
  return { ok: true, templates, skipped };
}

/** Prepara a apresentação de um modelo com os valores informados. */
export function renderTemplate(t: ApprovedTemplate, values: Record<string, string>) {
  /** Substitui as variáveis do texto pelos valores associados a cada posição. */
  const fill = (s: string) => s.replace(VAR_RE, (_, k) => values[k] ?? `{{${k}}}`);
  return [t.header, fill(t.body), t.footer].filter(Boolean).join("\n\n");
}
