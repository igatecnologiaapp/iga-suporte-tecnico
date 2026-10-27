/** Área: Processamento de eventos e mídias da integração oficial do WhatsApp. */
// Adaptador da WhatsApp Cloud API. Apenas traduz eventos da Meta e delega
// toda a regra de conversas para `ingestInboundMessage` (mesma camada do simulador).
import { ingestInboundMessage } from "./messaging.server";
import type { ParsedEvent, ParsedInbound } from "./whatsapp-parser";

export const GRAPH_BASE = "https://graph.facebook.com";
/** Obtém a versão da API Graph configurada para os pedidos da integração. */
export function graphVersion() { return process.env["WHATSAPP_GRAPH_API_VERSION"] || "v21.0"; }

/** Disponibiliza o cliente de servidor para persistir eventos da integração. */
async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Prepara a descrição de falha utilizada nos registros técnicos da integração. */
const safeError = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/Bearer\s+\S+/gi, "Bearer ***").slice(0, 500);

/** Registra o resultado de uma etapa da integração para consulta administrativa. */
export async function logIntegrationEvent(eventType: string, result: "processed" | "ignored" | "duplicate" | "error", externalId: string | null = null, error: string | null = null) {
  try { await (await admin()).from("integration_events").insert({ provider: "whatsapp", event_type: eventType.slice(0, 80), external_id: externalId, result, error_message: error ? error.slice(0, 500) : null }); }
  catch (e) { console.error("[whatsapp] falha ao registrar log", safeError(e)); }
}

/** Processa eventos já validados. Retorna mensagens que ainda precisam baixar mídia. */
export async function processEvents(events: ParsedEvent[]) {
  const pendingMedia: { messageId: string; conversationId: string; event: ParsedInbound }[] = [];
  for (const event of events) {
    try {
      if (event.kind === "other") { await logIntegrationEvent(event.eventType, "ignored"); continue; }
      if (event.kind === "status") {
        // Preparado para a etapa de envio: hoje não há mensagens enviadas a atualizar.
        // Não regride a situação (ex.: "sent" atrasado não sobrescreve "read").
        const next = mapStatus(event.status);
        const prior: Record<string, string[]> = { sent: ["pending"], delivered: ["pending", "sent"], read: ["pending", "sent", "delivered"], failed: ["pending", "sent"] };
        const { data } = await (await admin()).from("messages").update({ status: next }).eq("channel", "whatsapp").eq("external_id", event.externalId).eq("direction", "outbound").in("status", prior[next] ?? []).select("id");
        await logIntegrationEvent(`status:${event.status}`, data?.length ? "processed" : "ignored", event.externalId);
        continue;
      }
      const hasMedia = Boolean(event.mediaId);
      const result = await ingestInboundMessage({
        phone: event.phone, content: event.content, messageType: event.messageType, channel: "whatsapp",
        externalId: event.externalId, displayName: event.displayName, sentAt: event.sentAt,
        attachmentName: event.fileName, attachmentMime: event.mimeType, mediaId: event.mediaId, originalType: event.originalType,
        processingStatus: !event.supported ? "unsupported" : hasMedia ? "media_pending" : "processed",
      });
      await logIntegrationEvent(`message:${event.originalType}`, result.duplicate ? "duplicate" : "processed", event.externalId);
      if (hasMedia && !result.duplicate) pendingMedia.push({ messageId: result.messageId, conversationId: result.conversationId, event });
    } catch (e) {
      await logIntegrationEvent(event.kind === "message" ? `message:${event.originalType}` : event.kind, "error", "externalId" in event ? event.externalId : null, safeError(e));
    }
  }
  return pendingMedia;
}

/** Converte o estado recebido da API para o vocabulário utilizado pelo aplicativo. */
function mapStatus(s: string) { return ["sent", "delivered", "read", "failed"].includes(s) ? s : "sent"; }

/** Escolhe a extensão de arquivo correspondente ao tipo de mídia informado. */
const extFromMime = (mime: string | null) => (mime?.split("/")[1]?.split(";")[0] ?? "bin").replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin";
/** Prepara um nome de arquivo apropriado ao armazenamento da mídia. */
const safeName = (n: string) => n.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(0, 120);

/** Baixa mídia pela API oficial e grava no bucket privado. Nunca torna o arquivo público. */
export async function downloadMedia(messageId: string, conversationId: string, mediaId: string, fileName: string | null) {
  const token = process.env["WHATSAPP_ACCESS_TOKEN"];
  const db = await admin();
  try {
    if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN não configurado.");
    const metaRes = await fetch(`${GRAPH_BASE}/${graphVersion()}/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!metaRes.ok) throw new Error(`Consulta da mídia falhou (HTTP ${metaRes.status}).`);
    const meta = await metaRes.json() as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url || !meta.url.startsWith("https://")) throw new Error("URL da mídia inválida.");
    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!fileRes.ok) throw new Error(`Download da mídia falhou (HTTP ${fileRes.status}).`);
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    const mime = meta.mime_type ?? fileRes.headers.get("content-type") ?? "application/octet-stream";
    const name = safeName(fileName || `${mediaId}.${extFromMime(mime)}`);
    const path = `${conversationId}/${messageId}-${name}`;
    const { error } = await db.storage.from("whatsapp-media").upload(path, bytes, { contentType: mime, upsert: true });
    if (error) throw new Error(error.message);
    await db.from("messages").update({ attachment_path: path, attachment_name: fileName ?? name, attachment_mime: mime, attachment_size: meta.file_size ?? bytes.byteLength, processing_status: "media_stored" }).eq("id", messageId);
    await logIntegrationEvent("media:stored", "processed", mediaId);
    return true;
  } catch (e) {
    await db.from("messages").update({ processing_status: "media_failed" }).eq("id", messageId);
    await logIntegrationEvent("media:download", "error", mediaId, safeError(e));
    return false;
  }
}

/** Reprocessa mídias pendentes/falhas (acionado pelo Administrador). */
export async function retryPendingMedia(limit = 10) {
  const db = await admin();
  const { data } = await db.from("messages").select("id,conversation_id,media_id,attachment_name").eq("channel", "whatsapp").in("processing_status", ["media_pending", "media_failed"]).not("media_id", "is", null).order("created_at").limit(limit);
  let ok = 0;
  for (const m of data ?? []) if (await downloadMedia(m.id, m.conversation_id, m.media_id, m.attachment_name)) ok++;
  return { attempted: data?.length ?? 0, stored: ok };
}
