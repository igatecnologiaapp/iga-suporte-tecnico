import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };
export type RecordEntity = "companies" | "contacts" | "technicians" | "categories";

const tables: Record<RecordEntity, string> = {
  companies: "companies",
  contacts: "contacts",
  technicians: "technicians",
  categories: "ticket_categories",
};
const entityLabels: Record<RecordEntity, string> = {
  companies: "Empresa / Cliente", contacts: "Contato", technicians: "Técnico", categories: "Categoria",
};

async function assertManager(context: Ctx, requireAdmin = false) {
  const [{ data: isAdmin }, { data: isSupervisor }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
  ]);
  if (requireAdmin ? !isAdmin : !isAdmin && !isSupervisor) {
    throw new Error(requireAdmin ? "Apenas administradores podem excluir registros." : "Seu perfil não permite esta ação.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function count(admin: any, table: string, column: string, value: string, extra?: { column: string; value: string }) {
  let query = admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (extra) query = query.eq(extra.column, extra.value);
  const { count: total } = await query;
  return total ?? 0;
}

async function references(admin: any, entity: RecordEntity, id: string) {
  const items: { label: string; total: number }[] = [];
  if (entity === "companies") {
    items.push({ label: "contatos", total: await count(admin, "contacts", "company_id", id) });
    items.push({ label: "chamados", total: await count(admin, "tickets", "company_id", id) });
    items.push({ label: "conversas", total: await count(admin, "conversations", "company_id", id) });
  }
  if (entity === "contacts") {
    items.push({ label: "chamados", total: await count(admin, "tickets", "contact_id", id) });
    items.push({ label: "conversas", total: await count(admin, "conversations", "contact_id", id) });
  }
  if (entity === "technicians") {
    items.push({ label: "chamados atribuídos", total: await count(admin, "tickets", "assigned_technician_id", id) });
    items.push({ label: "agendamentos", total: await count(admin, "ticket_schedules", "technician_id", id) });
  }
  if (entity === "categories") {
    items.push({ label: "chamados na categoria", total: await count(admin, "tickets", "category_id", id) });
    items.push({ label: "chamados na subcategoria", total: await count(admin, "tickets", "subcategory_id", id) });
    items.push({ label: "subcategorias", total: await count(admin, "ticket_categories", "parent_id", id) });
  }
  return items.filter(item => item.total > 0);
}

async function activeTickets(admin: any, entity: RecordEntity, id: string) {
  if (entity !== "technicians") return 0;
  const { count: total } = await admin.from("tickets").select("id", { count: "exact", head: true })
    .eq("assigned_technician_id", id).not("status", "in", "(closed,cancelled,resolved,duplicate)");
  return total ?? 0;
}

async function logAudit(admin: any, actorId: string, entity: RecordEntity, id: string, action: string, reason: string | null, oldValue: unknown, newValue: unknown) {
  await admin.from("admin_audit_logs").insert({
    actor_id: actorId, entity, entity_id: id, action, reason: reason || null,
    old_value: oldValue ?? null, new_value: newValue ?? null,
  } as never);
}

export const inspectRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entity: RecordEntity; id: string }) => input)
  .handler(async ({ data, context }) => {
    const admin = await assertManager(context as Ctx);
    const refs = await references(admin, data.entity, data.id);
    return {
      label: entityLabels[data.entity],
      references: refs,
      canDelete: refs.length === 0,
      activeTickets: await activeTickets(admin, data.entity, data.id),
    };
  });

export const archiveRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entity: RecordEntity; id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const admin = await assertManager(ctx);
    if (!data.reason.trim()) throw new Error("Informe o motivo do arquivamento.");
    const table = tables[data.entity];
    const { data: current } = await admin.from(table).select("*").eq("id", data.id).single();
    if (current?.status === "inactive") throw new Error("Este registro já está arquivado.");
    const { error } = await admin.from(table).update({ status: "inactive" } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(admin, ctx.userId, data.entity, data.id, "record_archived", data.reason, { status: current?.status ?? null }, { status: "inactive" });
    return { ok: true, pendingTickets: await activeTickets(admin, data.entity, data.id) };
  });

export const restoreRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entity: RecordEntity; id: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const admin = await assertManager(ctx);
    const table = tables[data.entity];
    const { error } = await admin.from(table).update({ status: "active" } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(admin, ctx.userId, data.entity, data.id, "record_restored", null, { status: "inactive" }, { status: "active" });
    return { ok: true };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entity: RecordEntity; id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const admin = await assertManager(ctx, true);
    const table = tables[data.entity];
    const { data: current } = await admin.from(table).select("*").eq("id", data.id).single();
    const refs = await references(admin, data.entity, data.id);
    if (refs.length > 0) {
      await logAudit(admin, ctx.userId, data.entity, data.id, "record_delete_blocked", data.reason, current, { references: refs });
      throw new Error(`Registro com histórico (${refs.map(r => `${r.total} ${r.label}`).join(", ")}). Use Arquivar para preservar a auditoria.`);
    }
    const { error } = await admin.from(table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(admin, ctx.userId, data.entity, data.id, "record_deleted", data.reason, current, null);
    return { ok: true };
  });
