// Camada de serviço de mensagens.
// `ingestInboundMessage` é o ponto único de entrada de mensagens recebidas.
// Hoje é usada apenas pela simulação de desenvolvimento; quando a integração
// externa for contratada, o futuro webhook deve apenas validar a origem do
// evento e chamar esta mesma função — sem duplicar regras.

export type InboundMessage = {
  phone: string;
  content?: string | null;
  messageType?: "text" | "image" | "document" | "audio" | "video" | "other";
  channel?: "whatsapp" | "email" | "portal" | "other";
  externalId?: string | null;
  displayName?: string | null;
  sentAt?: string | null;
  attachmentName?: string | null;
  attachmentPath?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  mediaId?: string | null;
  originalType?: string | null;
  processingStatus?: "processed" | "media_pending" | "media_stored" | "media_failed" | "unsupported";
};

export type IngestResult = { conversationId: string; messageId: string; identified: boolean; ticketId: string | null; duplicate: boolean };

export async function ingestInboundMessage(payload: InboundMessage): Promise<IngestResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin: any = supabaseAdmin;
  const channel = payload.channel ?? "whatsapp";
  const rawPhone = payload.phone.trim();
  if (!rawPhone) throw new Error("Informe o telefone do remetente.");

  // Idempotência: mesmo identificador externo nunca gera nova mensagem/conversa.
  if (payload.externalId) {
    const { data: existing } = await admin.from("messages").select("id,conversation_id,conversations(contact_id,ticket_id)")
      .eq("channel", channel).eq("external_id", payload.externalId).maybeSingle();
    if (existing) return { conversationId: existing.conversation_id, messageId: existing.id, identified: Boolean(existing.conversations?.contact_id), ticketId: existing.conversations?.ticket_id ?? null, duplicate: true };
  }

  const { data: normalized } = await admin.rpc("normalize_phone", { value: rawPhone });
  const phoneNormalized: string | null = normalized ?? null;

  const findOpen = async () => {
    if (!phoneNormalized) return null;
    const { data } = await admin.from("conversations").select("*").eq("channel", channel).eq("phone_normalized", phoneNormalized).neq("status", "finished").maybeSingle();
    return data ?? null;
  };
  let conversation: any = await findOpen();

  // Identificação do cliente: telefone -> contato -> empresa
  let contactId: string | null = conversation?.contact_id ?? null;
  let companyId: string | null = conversation?.company_id ?? null;
  if (!contactId && phoneNormalized) {
    const { data: contact } = await admin.from("contacts")
      .select("id,company_id,status")
      .or(`phone_normalized.eq.${phoneNormalized},whatsapp_normalized.eq.${phoneNormalized}`)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (contact) { contactId = contact.id; companyId = contact.company_id; }
  }

  if (!conversation) {
    const { data, error } = await admin.from("conversations").insert({
      channel, phone: rawPhone, contact_id: contactId, company_id: companyId,
      display_name: payload.displayName ?? null, status: "new",
    }).select("*").single();
    if (error) {
      // Corrida entre eventos simultâneos do mesmo telefone: reaproveita a conversa aberta.
      conversation = error.code === "23505" ? await findOpen() : null;
      if (!conversation) throw new Error(error.message);
    } else conversation = data;
  } else if ((contactId && !conversation.contact_id) || (payload.displayName && !conversation.display_name)) {
    const { data } = await admin.from("conversations")
      .update({ contact_id: contactId, company_id: companyId, display_name: conversation.display_name ?? payload.displayName ?? null })
      .eq("id", conversation.id).select("*").single();
    conversation = data ?? conversation;
  }

  const { data: message, error: messageError } = await admin.from("messages").insert({
    conversation_id: conversation.id,
    direction: "inbound",
    channel,
    phone: rawPhone,
    content: payload.content ?? null,
    message_type: payload.messageType ?? "text",
    status: "received",
    external_id: payload.externalId ?? null,
    attachment_name: payload.attachmentName ?? null,
    attachment_path: payload.attachmentPath ?? null,
    attachment_mime: payload.attachmentMime ?? null,
    attachment_size: payload.attachmentSize ?? null,
    media_id: payload.mediaId ?? null,
    original_type: payload.originalType ?? null,
    processing_status: payload.processingStatus ?? "processed",
    sent_at: payload.sentAt ?? new Date().toISOString(),
  }).select("id").single();
  if (messageError) {
    if (messageError.code === "23505" && payload.externalId) {
      const { data: dup } = await admin.from("messages").select("id,conversation_id").eq("channel", channel).eq("external_id", payload.externalId).single();
      return { conversationId: dup.conversation_id, messageId: dup.id, identified: Boolean(contactId), ticketId: conversation.ticket_id ?? null, duplicate: true };
    }
    throw new Error(messageError.message);
  }

  return { conversationId: conversation.id as string, messageId: message.id as string, identified: Boolean(contactId), ticketId: (conversation.ticket_id as string | null) ?? null, duplicate: false };
}
