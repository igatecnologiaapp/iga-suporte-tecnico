import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };
async function assertAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Apenas Administrador pode acessar as integrações.");
}

/** Somente dados operacionais seguros. Nenhum secret sai do backend. */
export const getWhatsAppStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { test?: boolean }) => input ?? {})
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx; await assertAdmin(ctx);
    const env = (k: string) => Boolean(process.env[k]);
    const secrets = {
      WHATSAPP_ACCESS_TOKEN: env("WHATSAPP_ACCESS_TOKEN"), WHATSAPP_APP_SECRET: env("WHATSAPP_APP_SECRET"),
      WHATSAPP_VERIFY_TOKEN: env("WHATSAPP_VERIFY_TOKEN"), WHATSAPP_PHONE_NUMBER_ID: env("WHATSAPP_PHONE_NUMBER_ID"),
      WHATSAPP_BUSINESS_ACCOUNT_ID: env("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    };
    const configured = Object.values(secrets).every(Boolean);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db: any = supabaseAdmin;
    const [{ data: events }, { data: lastError }, { data: lastVerify }, { data: lastMessage }] = await Promise.all([
      db.from("integration_events").select("created_at,event_type,external_id,result,error_message").eq("provider", "whatsapp").order("created_at", { ascending: false }).limit(20),
      db.from("integration_events").select("created_at,event_type,error_message").eq("provider", "whatsapp").eq("result", "error").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("integration_events").select("created_at,result").eq("provider", "whatsapp").eq("event_type", "webhook:verify").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("messages").select("sent_at,created_at").eq("channel", "whatsapp").not("external_id", "is", null).not("external_id", "like", "sim:%").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    let test: { ok: boolean; displayPhone?: string; verifiedName?: string; error?: string } | null = null;
    if (data?.test && configured) {
      try {
        const { GRAPH_BASE, graphVersion } = await import("./whatsapp.server");
        const res = await fetch(`${GRAPH_BASE}/${graphVersion()}/${encodeURIComponent(process.env["WHATSAPP_PHONE_NUMBER_ID"]!)}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${process.env["WHATSAPP_ACCESS_TOKEN"]}` }, signal: AbortSignal.timeout(8000) });
        const body = await res.json().catch(() => ({})) as any;
        test = res.ok ? { ok: true, displayPhone: body.display_phone_number, verifiedName: body.verified_name } : { ok: false, error: `HTTP ${res.status}: ${String(body?.error?.message ?? "falha").slice(0, 200)}` };
      } catch (e) { test = { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 200) }; }
    }
    const status = !configured ? "not_configured" : test ? (test.ok ? "connected" : "error") : lastVerify?.result === "processed" ? "connected" : "configured";
    return {
      status, secrets, test,
      phoneNumberId: process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? null,
      wabaId: process.env["WHATSAPP_BUSINESS_ACCOUNT_ID"] ?? null,
      webhookVerifiedAt: lastVerify?.result === "processed" ? lastVerify.created_at : null,
      lastMessageAt: lastMessage?.created_at ?? null,
      lastEvent: events?.[0] ?? null, lastError: lastError ?? null, events: events ?? [],
    };
  });

export const retryWhatsAppMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { retryPendingMedia } = await import("./whatsapp.server");
    return retryPendingMedia();
  });

/** Reprocessa a mídia de uma única mensagem (operação da Caixa de Entrada). */
export const retryMessageMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string }) => ({ messageId: String(input?.messageId ?? "") }))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: allowed } = await ctx.supabase.rpc("can_manage_operations", { _user_id: ctx.userId });
    if (!allowed) throw new Error("Seu perfil não permite reprocessar mídias.");
    const { data: m, error } = await ctx.supabase.from("messages").select("id,conversation_id,media_id,attachment_name,processing_status").eq("id", data.messageId).single();
    if (error || !m) throw new Error("Mensagem não encontrada.");
    if (!m.media_id || !["media_pending", "media_failed"].includes(m.processing_status)) throw new Error("Esta mensagem não possui mídia pendente.");
    const { downloadMedia } = await import("./whatsapp.server");
    return { ok: await downloadMedia(m.id, m.conversation_id, m.media_id, m.attachment_name) };
  });
