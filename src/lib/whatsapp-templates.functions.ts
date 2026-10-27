/** Área: Entradas autenticadas para consultar e enviar modelos de mensagem. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/** Confere as permissões operacionais necessárias para atuar na Caixa de Entrada. */
async function assertInbox(ctx: Ctx) {
  const [{ data: ops }, { data: inbox }] = await Promise.all([
    ctx.supabase.rpc("can_manage_operations", { _user_id: ctx.userId }),
    ctx.supabase.rpc("has_module", { _user_id: ctx.userId, _module: "inbox" }),
  ]);
  if (!ops || !inbox) throw new Error("Seu perfil não permite enviar modelos pela Caixa de Entrada.");
}

/** Lista apenas modelos APROVADOS de texto. Nenhuma credencial é devolvida. */
export const listApprovedTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertInbox(context as Ctx);
    const { fetchApprovedTemplates } = await import("./whatsapp-templates.server");
    return fetchApprovedTemplates();
  });

/** Valida o modelo e as variáveis e executa o envio autorizado pela integração. */
export const sendTemplateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; name: string; language: string; values: Record<string, string> }) => {
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(input?.values ?? {})) {
      const s = String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {5,}/g, "    ").trim();
      if (s.length > 1024) throw new Error("Uma variável excede 1024 caracteres.");
      values[String(k).slice(0, 60)] = s;
    }
    return { conversationId: String(input?.conversationId ?? ""), name: String(input?.name ?? "").slice(0, 512), language: String(input?.language ?? "").slice(0, 20), values };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertInbox(ctx);
    const { data: conversation, error } = await ctx.supabase.from("conversations").select("id,channel,phone").eq("id", data.conversationId).single();
    if (error || !conversation) throw new Error("Conversa não encontrada.");
    if (conversation.channel !== "whatsapp") throw new Error("Esta conversa não é do WhatsApp.");
    const to = String(conversation.phone ?? "").replace(/\D/g, "");
    if (to.length < 10 || to.length > 15) throw new Error("Telefone do destinatário inválido.");
    const { data: lastIn } = await ctx.supabase.from("messages").select("external_id").eq("conversation_id", data.conversationId).eq("direction", "inbound").order("sent_at", { ascending: false }).limit(1).maybeSingle();
    if (String(lastIn?.external_id ?? "").startsWith("sim:")) throw new Error("Conversa simulada: envio real não permitido.");

    const { fetchApprovedTemplates, renderTemplate } = await import("./whatsapp-templates.server");
    const list = await fetchApprovedTemplates();
    if (!list.ok) return { ok: false as const, error: list.error };
    const template = list.templates.find(t => t.name === data.name && t.language === data.language);
    if (!template) return { ok: false as const, error: "Modelo não está aprovado ou não está disponível neste idioma." };
    const missing = template.variables.filter(v => !data.values[v.key]);
    if (missing.length) return { ok: false as const, error: `Preencha todas as variáveis (${missing.map(v => `{{${v.key}}}`).join(", ")}).` };
    const content = renderTemplate(template, data.values);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db: any = supabaseAdmin;
    const { data: recent } = await db.from("messages").select("id").eq("conversation_id", data.conversationId).eq("direction", "outbound").eq("template_name", template.name).eq("content", content).gte("created_at", new Date(Date.now() - 15000).toISOString()).limit(1);
    if (recent?.length) return { ok: false as const, error: "Este modelo acabou de ser enviado. Envio duplicado bloqueado." };

    const token = process.env["WHATSAPP_ACCESS_TOKEN"];
    const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
    const { logIntegrationEvent, GRAPH_BASE, graphVersion } = await import("./whatsapp.server");
    if (!token || !phoneId) throw new Error("Integração WhatsApp não configurada.");
    const parameters = template.variables.map(v => template.format === "NAMED"
      ? { type: "text", parameter_name: v.key, text: data.values[v.key] }
      : { type: "text", text: data.values[v.key] });
    const payload = {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
      template: { name: template.name, language: { code: template.language }, ...(parameters.length ? { components: [{ type: "body", parameters }] } : {}) },
    };
    let res: Response;
    try {
      res = await fetch(`${GRAPH_BASE}/${graphVersion()}/${encodeURIComponent(phoneId)}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
      });
    } catch {
      await logIntegrationEvent("send:template", "error", null, "Falha de rede ao contatar a API.");
      return { ok: false as const, error: "Não foi possível contatar o WhatsApp. O modelo não foi enviado." };
    }
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = body?.error ?? {};
      const msg = `HTTP ${res.status}${e.code ? ` código ${e.code}` : ""}${e.error_subcode ? `/${e.error_subcode}` : ""}: ${String(e.error_user_msg ?? e.message ?? "erro").slice(0, 200)}`;
      await logIntegrationEvent("send:template", "error", null, msg);
      return { ok: false as const, error: `O WhatsApp recusou o modelo (${msg}). Nada foi registrado no histórico.` };
    }
    const externalId: string | null = body?.messages?.[0]?.id ?? null;
    const { data: inserted, error: insError } = await db.from("messages").insert({
      conversation_id: data.conversationId, direction: "outbound", channel: "whatsapp", phone: conversation.phone,
      content, message_type: "text", status: "sent", external_id: externalId, sent_at: new Date().toISOString(),
      template_name: template.name, template_language: template.language, sent_by: ctx.userId,
    }).select("*").single();
    await logIntegrationEvent("send:template", insError ? "error" : "processed", externalId, insError?.message ?? null);
    if (insError) throw new Error("Modelo aceito pela Meta, mas houve falha ao registrá-lo no histórico.");
    return { ok: true as const, message: inserted };
  });
