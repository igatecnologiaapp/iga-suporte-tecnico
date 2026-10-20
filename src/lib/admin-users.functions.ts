import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { adminUserUpdateSchema, planAdminUserUpdate, userModules } from "./admin-user-update";

import { passwordRecoveryRequestSchema } from "./password-recovery";

type AdminContext = { supabase: any; userId: string };

const VALID_MODULES: readonly string[] = userModules;

async function assertAdmin(context: AdminContext) {
  const [{ data, error }, { data: hasUsers, error: moduleError }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_module", { _user_id: context.userId, _module: "users" }),
  ]);
  if (error || moduleError || !data || !hasUsers) throw new Error("Apenas administradores podem gerenciar usuários.");
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
  .inputValidator((input: unknown) => adminUserUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as AdminContext;
    const admin = await assertAdmin(ctx);
    const [profile, role, modules, primary] = await Promise.all([
      admin.from("profiles").select("id").eq("id", data.userId).single(),
      admin.from("user_roles").select("role").eq("user_id", data.userId).single(),
      admin.from("user_modules").select("module").eq("user_id", data.userId),
      admin.from("primary_admin").select("user_id").maybeSingle(),
    ]);
    for (const result of [profile, role, modules, primary]) {
      if (result.error) throw new Error(result.error.message);
    }
    if (!profile.data || !role.data || !modules.data)
      throw new Error("Usuário ou permissões não encontrados.");
    const plan = planAdminUserUpdate(data, {
      actorId: ctx.userId,
      primaryId: primary.data?.user_id ?? null,
      currentRole: role.data.role,
      currentModules: modules.data.map((item: { module: string }) => item.module),
    });
    if (plan.role !== undefined && plan.role !== role.data.role)
      await assertPrimary(admin, ctx.userId, "change_role");
    if (
      plan.modules !== undefined &&
      JSON.stringify(plan.modules) !==
        JSON.stringify(modules.data.map((item: { module: string }) => item.module).sort())
    )
      await assertPrimary(admin, ctx.userId, "change_modules");
    const { userId, ...patch } = plan;
    // Use the authenticated caller, never a client-supplied actor or a service-role RPC.
    // The RPC repeats authorization under locks and commits data + audit together.
    const result = await ctx.supabase.rpc("update_admin_user_atomic", {
      _target_id: userId,
      _patch: patch,
    });
    if (result.error) throw new Error(result.error.message);
    if (result.data?.ok !== true) throw new Error("A atualização não foi confirmada.");
    return { ok: true };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => passwordRecoveryRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context as AdminContext);
    const { requestAdministrativePasswordRecovery } = await import("./password-recovery.server");
    return requestAdministrativePasswordRecovery(admin, context.userId, data.userId, {
      siteUrl: process.env["APP_SITE_URL"],
      supabaseUrl: process.env["SUPABASE_URL"],
    });
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
