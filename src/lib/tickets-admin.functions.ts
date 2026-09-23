import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(context: Ctx) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Apenas administradores podem excluir chamados.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function total(admin: any, table: string, column: string, value: string) {
  const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  return count ?? 0;
}

/** Summary of everything that will be removed or detached with the ticket. */
export const inspectTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string }) => input)
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context as Ctx);
    const { data: ticket } = await admin.from("tickets")
      .select("id,number,subject,companies(trade_name)").eq("id", data.ticketId).single();
    if (!ticket) throw new Error("Chamado não encontrado.");
    const [events, attachments, schedules, notifications, conversations] = await Promise.all([
      total(admin, "ticket_events", "ticket_id", data.ticketId),
      total(admin, "ticket_attachments", "ticket_id", data.ticketId),
      total(admin, "ticket_schedules", "ticket_id", data.ticketId),
      total(admin, "notifications", "ticket_id", data.ticketId),
      total(admin, "conversations", "ticket_id", data.ticketId),
    ]);
    return {
      number: ticket.number as string,
      subject: ticket.subject as string,
      company: (ticket.companies?.trade_name as string) ?? "—",
      related: [
        { label: "eventos da timeline", total: events },
        { label: "anexos", total: attachments },
        { label: "agendamentos", total: schedules },
        { label: "notificações", total: notifications },
        { label: "conversas (serão desvinculadas, mensagens preservadas)", total: conversations },
      ].filter(item => item.total > 0),
    };
  });

/** Definitive deletion: removes dependents, detaches conversations, keeps a minimal audit row. */
export const deleteTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const admin = await assertAdmin(ctx);
    if (!data.reason.trim()) throw new Error("Informe o motivo da exclusão.");

    const { data: files } = await admin.from("ticket_attachments").select("storage_path").eq("ticket_id", data.ticketId);
    const paths = (files ?? []).map((f: { storage_path: string }) => f.storage_path);

    const { data: result, error } = await admin.rpc("admin_delete_ticket", {
      _ticket_id: data.ticketId, _actor_id: ctx.userId, _reason: data.reason.trim(),
    });
    if (error) throw new Error(error.message);

    if (paths.length > 0) await admin.storage.from("ticket-attachments").remove(paths);
    return { deleted: true, number: (result as { number?: string } | null)?.number ?? null };
  });
