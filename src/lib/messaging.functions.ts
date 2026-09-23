import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertOperations(context: Ctx) {
  const { data, error } = await context.supabase.rpc("can_manage_operations", { _user_id: context.userId });
  if (error || !data) throw new Error("Seu perfil não permite operar a caixa de entrada.");
}

/** Mecanismo de desenvolvimento/teste: simula uma mensagem recebida. */
export const simulateInboundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string; content: string; messageType?: string; displayName?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    const { data: isSupervisor } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "supervisor" });
    if (!isAdmin && !isSupervisor) throw new Error("Apenas Administrador ou Supervisor pode simular mensagens.");
    const { ingestInboundMessage } = await import("./messaging.server");
    return ingestInboundMessage({
      phone: data.phone,
      content: data.content,
      messageType: (data.messageType as any) ?? "text",
      displayName: data.displayName ?? null,
    });
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertOperations(ctx);
    const { error } = await ctx.supabase.from("conversations").update({ unread_count: 0 }).eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createTicketFromConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; subject: string; description: string; priority: string; categoryId?: string | null; subcategoryId?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertOperations(ctx);
    const { data: conversation, error: readError } = await ctx.supabase.from("conversations").select("*").eq("id", data.conversationId).single();
    if (readError) throw new Error(readError.message);
    if (conversation.ticket_id) throw new Error("Esta conversa já está vinculada a um chamado.");
    if (!conversation.contact_id || !conversation.company_id) throw new Error("Identifique o contato e a empresa antes de abrir o chamado.");

    const { data: ticket, error } = await ctx.supabase.from("tickets").insert({
      company_id: conversation.company_id,
      contact_id: conversation.contact_id,
      requester_phone: conversation.phone,
      channel: "whatsapp",
      category_id: data.categoryId || null,
      subcategory_id: data.subcategoryId || null,
      subject: data.subject.trim(),
      description: data.description.trim(),
      priority: data.priority,
      created_by: ctx.userId,
    }).select("id,number").single();
    if (error) throw new Error(error.message);

    const { error: linkError } = await ctx.supabase.from("conversations").update({ ticket_id: ticket.id, status: "linked" }).eq("id", data.conversationId);
    if (linkError) throw new Error(linkError.message);
    return { ticketId: ticket.id as string, number: ticket.number as string };
  });

export const linkConversationToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; ticketId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertOperations(ctx);
    const { data: ticket, error: ticketError } = await ctx.supabase.from("tickets").select("id,number,company_id,contact_id").eq("id", data.ticketId).single();
    if (ticketError) throw new Error(ticketError.message);
    const { data: conversation } = await ctx.supabase.from("conversations").select("contact_id,company_id").eq("id", data.conversationId).single();
    const { error } = await ctx.supabase.from("conversations").update({
      ticket_id: ticket.id,
      status: "linked",
      company_id: conversation?.company_id ?? ticket.company_id,
      contact_id: conversation?.contact_id ?? ticket.contact_id,
    }).eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { number: ticket.number as string };
  });

export const setConversationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; status: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertOperations(ctx);
    const { error } = await ctx.supabase.from("conversations").update({ status: data.status }).eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const identifyConversationContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; contactId?: string | null; newContact?: { name: string; companyId: string; phone: string } }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertOperations(ctx);
    let contactId = data.contactId ?? null;
    let companyId: string | null = null;
    if (!contactId && data.newContact) {
      const { data: created, error } = await ctx.supabase.from("contacts").insert({
        company_id: data.newContact.companyId,
        name: data.newContact.name.trim(),
        phone: data.newContact.phone,
        whatsapp: data.newContact.phone,
        created_by: ctx.userId,
      }).select("id,company_id").single();
      if (error) throw new Error(error.message);
      contactId = created.id; companyId = created.company_id;
    }
    if (!contactId) throw new Error("Selecione um contato existente ou cadastre um novo.");
    if (!companyId) {
      const { data: contact, error } = await ctx.supabase.from("contacts").select("company_id").eq("id", contactId).single();
      if (error) throw new Error(error.message);
      companyId = contact.company_id;
    }
    const { error: updateError } = await ctx.supabase.from("conversations").update({ contact_id: contactId, company_id: companyId }).eq("id", data.conversationId);
    if (updateError) throw new Error(updateError.message);
    return { contactId, companyId };
  });
