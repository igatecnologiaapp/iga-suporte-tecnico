import { createFileRoute } from "@tanstack/react-router";

// Endpoint público exclusivo do webhook oficial da Meta (WhatsApp Cloud API).
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      // Verificação oficial: hub.mode=subscribe + hub.verify_token + hub.challenge
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { logIntegrationEvent } = await import("@/lib/whatsapp.server");
        const expected = process.env["WHATSAPP_VERIFY_TOKEN"];
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        if (!expected) { await logIntegrationEvent("webhook:verify", "error", null, "WHATSAPP_VERIFY_TOKEN não configurado."); return new Response("Not configured", { status: 503 }); }
        if (mode === "subscribe" && token === expected && /^[\w-]{1,200}$/.test(challenge)) {
          await logIntegrationEvent("webhook:verify", "processed");
          return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
        }
        await logIntegrationEvent("webhook:verify", "error", null, "Token de verificação inválido.");
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const { logIntegrationEvent, processEvents, downloadMedia } = await import("@/lib/whatsapp.server");
        const { parseWebhookPayload, verifyMetaSignature } = await import("@/lib/whatsapp-parser");
        const secret = process.env["WHATSAPP_APP_SECRET"];
        if (!secret) { await logIntegrationEvent("webhook:event", "error", null, "WHATSAPP_APP_SECRET não configurado."); return new Response("Not configured", { status: 503 }); }
        const raw = await request.text();
        if (raw.length > 1_000_000) return new Response("Payload too large", { status: 413 });
        if (!(await verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret))) {
          await logIntegrationEvent("webhook:signature", "error", null, "Assinatura X-Hub-Signature-256 inválida ou ausente.");
          return new Response("Invalid signature", { status: 401 });
        }
        let body: unknown;
        try { body = JSON.parse(raw); } catch { await logIntegrationEvent("webhook:event", "error", null, "JSON inválido."); return new Response("ok", { status: 200 }); }
        const pending = await processEvents(parseWebhookPayload(body));
        // Mídia: tentativa curta e limitada; falhas ficam pendentes para reprocessamento, sem derrubar o webhook.
        if (pending.length) {
          const work = Promise.allSettled(pending.map(p => downloadMedia(p.messageId, p.conversationId, p.event.mediaId!, p.event.fileName)));
          await Promise.race([work, new Promise(r => setTimeout(r, 9000))]);
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
