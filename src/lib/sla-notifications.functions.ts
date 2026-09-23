import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeSla, type SlaPolicy } from "@/lib/sla";

/** Gera notificações internas de SLA próximo do vencimento e vencido para os técnicos responsáveis. */
export const syncSlaNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: policies }, { data: tickets }] = await Promise.all([
      context.supabase.from("sla_policies").select("*"),
      context.supabase
        .from("tickets")
        .select("id,number,subject,priority,status,opened_at,acknowledged_at,first_response_at,resolved_at,closed_at,assigned_technician_id,technicians!tickets_assigned_technician_id_fkey(user_id)")
        .not("assigned_technician_id", "is", null)
        .not("status", "in", "(resolved,closed,cancelled,duplicate)"),
    ]);
    const rows = (tickets ?? []) as any[];
    const pending: Array<{ user_id: string; ticket_id: string; event_type: string; title: string; body: string }> = [];
    for (const ticket of rows) {
      const userId = ticket.technicians?.user_id;
      if (!userId) continue;
      const sla = computeSla(ticket, (policies ?? []) as SlaPolicy[]);
      if (sla.state !== "warning" && sla.state !== "breached") continue;
      pending.push({
        user_id: userId, ticket_id: ticket.id,
        event_type: sla.state === "warning" ? "sla_warning" : "sla_breached",
        title: sla.state === "warning" ? "SLA próximo do vencimento" : "SLA vencido",
        body: `${ticket.number} — ${ticket.subject} · ${sla.detail}`,
      });
    }
    if (pending.length === 0) return { created: 0 };
    const existing = (await supabaseAdmin
      .from("notifications")
      .select("user_id,ticket_id,event_type")
      .in("ticket_id", pending.map(p => p.ticket_id))
      .in("event_type", ["sla_warning", "sla_breached"])).data ?? [];
    const key = (r: { user_id: string; ticket_id: string | null; event_type: string }) => `${r.user_id}|${r.ticket_id}|${r.event_type}`;
    const seen = new Set(existing.map(key as never));
    const inserts = pending.filter(p => !seen.has(key(p)));
    if (inserts.length === 0) return { created: 0 };
    const { error } = await supabaseAdmin.from("notifications").insert(inserts as never);
    if (error) return { created: 0, error: error.message };
    return { created: inserts.length };
  });
