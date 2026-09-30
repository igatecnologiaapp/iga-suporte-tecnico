import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AdminContext = { supabase: any; userId: string };

const VALID_MODULES = ["inbox","tickets","companies","contacts","categories","sla","technicians","users","integrations","settings"];

async function assertAdmin(context: AdminContext) {
  const [{ data, error }, { data: hasUsers }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_module", { _user_id: context.userId, _module: "users" }),
  ]);
  if (error || !data || !hasUsers) throw new Error("Apenas administradores podem gerenciar usuários.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Ponto único de autorização para ações administrativas sensíveis.
// Hoje: exclusivas do Administrador Principal. Futuro: delegar por ação sem reconstruir o RBAC.
async function assertPrimary(admin: any, actorId: string, _action: "create_user" | "change_role" | "change_modules") {
  const { data } = await admin.rpc("is_primary_admin", { _user_id: actorId });
  if (!data) throw new Error("Somente o Administrador Principal pode realizar esta ação.");
}

async function primaryId(admin: any): Promise<string | null> {
  const { data } = await admin.from("primary_admin").select("user_id").maybeSingle();
  return data?.user_id ?? null;
}

function cleanModules(modules: string[] | undefined) {
  return Array.from(new Set((modules ?? []).filter(m => VALID_MODULES.includes(m)))).sort();
}

async function logAudit(admin: any, actorId: string, targetUserId: string | null, action: string, oldValue: unknown, newValue: unknown) {
  await admin.from("admin_audit_logs").insert({ actor_id: actorId, target_user_id: targetUserId, action, old_value: oldValue ?? null, new_value: newValue ?? null } as never);
}

export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context as AdminContext);
    const [{ data: profiles }, { data: roles }, { data: technicians }, authUsers, { data: mods }, primary] = await Promise.all([
      admin.from("profiles").select("id,full_name,phone,status,created_at").order("full_name"),
      admin.from("user_roles").select("user_id,role"),
      admin.from("technicians").select("id,name,user_id,status"),
      admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      admin.from("user_modules").select("user_id,module"),
      primaryId(admin),
    ]);
    const byId = new Map((authUsers.data?.users ?? []).map((u: any) => [u.id, u]));
    return (profiles ?? []).map((p: any) => {
      const authUser: any = byId.get(p.id);
      const technician = (technicians ?? []).find((t: any) => t.user_id === p.id);
      return {
        id: p.id, full_name: p.full_name, phone: p.phone, status: p.status, created_at: p.created_at,
        email: authUser?.email ?? null, last_sign_in_at: authUser?.last_sign_in_at ?? null,
        role: (roles ?? []).find((r: any) => r.user_id === p.id)?.role ?? "viewer",
        technician_id: technician?.id ?? null, technician_name: technician?.name ?? null,
        is_primary: p.id === primary,
        modules: (mods ?? []).filter((m: any) => m.user_id === p.id).map((m: any) => m.module).sort(),
      };
    });
  });

export const listTechnicianOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context as AdminContext);
    const { data } = await admin.from("technicians").select("id,name,user_id").order("name");
    return data ?? [];
  });

export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fullName: string; email: string; phone?: string; role: string; status: string; technicianId?: string | null; createTechnician?: boolean; modules?: string[] }) => input)
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context as AdminContext);
    await assertPrimary(admin, context.userId, "create_user");
    const modules = cleanModules(data.modules);
    if (modules.length === 0) throw new Error("Selecione ao menos um módulo permitido.");
    const email = data.email.trim().toLowerCase();
    if (!email || !data.fullName.trim()) throw new Error("Informe nome e e-mail.");

    let userId: string | null = null;
    let emailSent = false;
    let actionLink: string | null = null;

    const invited = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: data.fullName.trim() } });
    if (!invited.error && invited.data?.user) { userId = invited.data.user.id; emailSent = true; }
    else {
      const created = await admin.auth.admin.createUser({ email, email_confirm: false, user_metadata: { full_name: data.fullName.trim() } });
      if (created.error || !created.data?.user) throw new Error(created.error?.message ?? "Não foi possível criar o usuário.");
      userId = created.data.user.id;
      const link = await admin.auth.admin.generateLink({ type: "recovery", email });
      actionLink = link.data?.properties?.action_link ?? null;
    }

    await admin.from("profiles").update({ full_name: data.fullName.trim(), phone: data.phone?.trim() || null, status: data.status } as never).eq("id", userId);
    await admin.from("user_roles").upsert({ user_id: userId, role: data.role } as never, { onConflict: "user_id" });

    let technicianId = data.technicianId ?? null;
    if (data.role === "technician") {
      if (technicianId) await admin.from("technicians").update({ user_id: userId } as never).eq("id", technicianId);
      else if (data.createTechnician) {
        const tech = await admin.from("technicians").insert({ user_id: userId, name: data.fullName.trim(), email, phone: data.phone?.trim() || null, status: "active" } as never).select("id").single();
        if (tech.error) throw new Error(tech.error.message);
        technicianId = tech.data.id;
      }
    }
    const { error: modError } = await admin.from("user_modules").insert(modules.map(m => ({ user_id: userId, module: m })) as never);
    if (modError) throw new Error(modError.message);
    await logAudit(admin, context.userId, userId, "user_created", null, { email, role: data.role, status: data.status, technician_id: technicianId, modules });
    return { userId, emailSent, actionLink };
  });

export const updateAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; fullName?: string; phone?: string | null; role?: string; status?: string; technicianId?: string | null; modules?: string[] }) => input)
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context as AdminContext);
    const primary = await primaryId(admin);
    const actorIsPrimary = primary === context.userId;
    if (data.userId === primary) {
      if (!actorIsPrimary) throw new Error("O Administrador Principal só pode ser alterado por ele mesmo.");
      if (data.status !== undefined && data.status !== "active") throw new Error("O Administrador Principal não pode ser desativado.");
      if (data.role !== undefined && data.role !== "admin") throw new Error("O papel do Administrador Principal não pode ser reduzido.");
      delete (data as { modules?: string[] }).modules; // acesso integral fixo
    }
    const current = await admin.from("profiles").select("full_name,phone,status").eq("id", data.userId).single();
    const currentRole = await admin.from("user_roles").select("role").eq("user_id", data.userId).maybeSingle();
    const currentTech = await admin.from("technicians").select("id,name").eq("user_id", data.userId).maybeSingle();

    const losesAdmin = currentRole.data?.role === "admin" && ((data.status !== undefined && data.status !== "active") || (data.role !== undefined && data.role !== "admin"));
    if (losesAdmin) {
      const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
      const others = (admins ?? []).map((r: any) => r.user_id).filter((id: string) => id !== data.userId);
      const { data: activeOthers } = others.length
        ? await admin.from("profiles").select("id").in("id", others).eq("status", "active")
        : { data: [] };
      if (!activeOthers || activeOthers.length === 0) throw new Error("É necessário manter pelo menos um Administrador ativo no sistema.");
    }


    if (data.fullName !== undefined || data.phone !== undefined || data.status !== undefined) {
      const patch: Record<string, unknown> = {};
      if (data.fullName !== undefined) patch["full_name"] = data.fullName.trim();
      if (data.phone !== undefined) patch["phone"] = data.phone?.trim() || null;
      if (data.status !== undefined) patch["status"] = data.status;
      const { error } = await admin.from("profiles").update(patch as never).eq("id", data.userId);
      if (error) throw new Error(error.message);
      if (data.status !== undefined && data.status !== current.data?.status)
        await logAudit(admin, context.userId, data.userId, data.status === "active" ? "user_activated" : "user_deactivated", { status: current.data?.status }, { status: data.status });
      else await logAudit(admin, context.userId, data.userId, "user_updated", current.data, patch);
    }

    if (data.role !== undefined && data.role !== currentRole.data?.role) {
      await assertPrimary(admin, context.userId, "change_role");
      if (data.userId === context.userId) throw new Error("Não é possível alterar o próprio perfil de acesso.");
      const { error } = await admin.from("user_roles").upsert({ user_id: data.userId, role: data.role } as never, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await logAudit(admin, context.userId, data.userId, "role_changed", { role: currentRole.data?.role ?? null }, { role: data.role });
    }

    if (data.technicianId !== undefined && (data.technicianId ?? null) !== (currentTech.data?.id ?? null)) {
      if (currentTech.data?.id) { await admin.from("technicians").update({ user_id: null } as never).eq("id", currentTech.data.id); }
      if (data.technicianId) {
        const { error } = await admin.from("technicians").update({ user_id: data.userId } as never).eq("id", data.technicianId);
        if (error) throw new Error(error.message);
      }
      await logAudit(admin, context.userId, data.userId, data.technicianId ? "technician_linked" : "technician_unlinked", { technician_id: currentTech.data?.id ?? null }, { technician_id: data.technicianId ?? null });
    }
    if (data.modules !== undefined) {
      const next = cleanModules(data.modules);
      const { data: cur } = await admin.from("user_modules").select("module").eq("user_id", data.userId);
      const prev = (cur ?? []).map((m: any) => m.module).sort();
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        await assertPrimary(admin, context.userId, "change_modules");
        const toAdd = next.filter(m => !prev.includes(m)); const toRemove = prev.filter((m: string) => !next.includes(m));
        if (toRemove.length) { const { error } = await admin.from("user_modules").delete().eq("user_id", data.userId).in("module", toRemove); if (error) throw new Error(error.message); }
        if (toAdd.length) { const { error } = await admin.from("user_modules").insert(toAdd.map(m => ({ user_id: data.userId, module: m })) as never); if (error) throw new Error(error.message); }
        await logAudit(admin, context.userId, data.userId, "modules_changed", { modules: prev }, { modules: next });
      }
    }
    return { ok: true };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => input)
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context as AdminContext);
    const email = data.email.trim().toLowerCase();
    const link = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (link.error) throw new Error(link.error.message);
    await logAudit(admin, context.userId, null, "password_reset_requested", null, { email });
    return { actionLink: link.data?.properties?.action_link ?? null };
  });

export const listAdminAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context as AdminContext);
    const { data } = await admin.from("admin_audit_logs").select("id,action,old_value,new_value,created_at,actor_id,target_user_id").order("created_at", { ascending: false }).limit(50);
    const ids = Array.from(new Set((data ?? []).flatMap((r: any) => [r.actor_id, r.target_user_id]).filter(Boolean)));
    const names = ids.length ? (await admin.from("profiles").select("id,full_name").in("id", ids)).data ?? [] : [];
    const nameOf = (id: string | null) => names.find((p: any) => p.id === id)?.full_name ?? "—";
    return (data ?? []).map((r: any) => ({ ...r, actor_name: nameOf(r.actor_id), target_name: nameOf(r.target_user_id) }));
  });
