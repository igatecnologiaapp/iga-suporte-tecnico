// Interpretação pura (sem acesso a rede/banco) do payload oficial do webhook
// da WhatsApp Cloud API. Mantida isolada para ser testável sem credenciais.

export type WaKind = "text" | "image" | "document" | "audio" | "video" | "other";

export type ParsedInbound = {
  kind: "message";
  externalId: string;
  phone: string;
  displayName: string | null;
  sentAt: string | null;
  messageType: WaKind;
  originalType: string;
  content: string | null;
  mediaId: string | null;
  mimeType: string | null;
  fileName: string | null;
  supported: boolean;
};

export type ParsedStatus = { kind: "status"; externalId: string; status: string };
export type ParsedOther = { kind: "other"; eventType: string };
export type ParsedEvent = ParsedInbound | ParsedStatus | ParsedOther;

const str = (v: unknown, max = 4096): string | null => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : null);
const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {});
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

const mediaKinds: Record<string, WaKind> = { image: "image", document: "document", audio: "audio", video: "video", sticker: "image" };

export function parseWebhookPayload(body: unknown): ParsedEvent[] {
  const root = obj(body);
  if (root.object !== "whatsapp_business_account") return [{ kind: "other", eventType: `object:${str(root.object, 60) ?? "desconhecido"}` }];
  const events: ParsedEvent[] = [];
  for (const entry of arr(root.entry)) {
    for (const change of arr(obj(entry).changes)) {
      const field = str(obj(change).field, 60) ?? "desconhecido";
      const value = obj(obj(change).value);
      if (field !== "messages") { events.push({ kind: "other", eventType: field }); continue; }
      const names = new Map<string, string>();
      for (const c of arr(value.contacts)) { const wa = str(obj(c).wa_id, 32); const n = str(obj(obj(c).profile).name, 120); if (wa && n) names.set(wa, n); }
      for (const s of arr(value.statuses)) {
        const id = str(obj(s).id, 256); const st = str(obj(s).status, 40);
        if (id && st) events.push({ kind: "status", externalId: id, status: st });
      }
      for (const raw of arr(value.messages)) {
        const m = obj(raw);
        const id = str(m.id, 256); const from = str(m.from, 32);
        if (!id || !from || !/^\+?\d{6,20}$/.test(from)) { events.push({ kind: "other", eventType: "message_invalid" }); continue; }
        const type = str(m.type, 40) ?? "unknown";
        const ts = Number(m.timestamp);
        const sentAt = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null;
        const base = { kind: "message" as const, externalId: id, phone: from.startsWith("+") ? from : `+${from}`, displayName: names.get(from) ?? null, sentAt, originalType: type };
        if (type === "text") {
          events.push({ ...base, messageType: "text", content: str(obj(m.text).body), mediaId: null, mimeType: null, fileName: null, supported: true });
        } else if (mediaKinds[type]) {
          const media = obj(m[type]);
          events.push({ ...base, messageType: mediaKinds[type], content: str(media.caption), mediaId: str(media.id, 128), mimeType: str(media.mime_type, 120), fileName: str(media.filename, 200), supported: true });
        } else {
          events.push({ ...base, messageType: "other", content: `[Tipo de mensagem ainda não suportado: ${type}]`, mediaId: null, mimeType: null, fileName: null, supported: false });
        }
      }
    }
  }
  return events;
}

export async function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const expected = Array.from(sig, b => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7).toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
