/** Área: Entradas autenticadas das operações administrativas de usuários e auditoria. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { adminUserUpdateSchema, planAdminUserUpdate } from "./admin-user-update";

import { adminUserCreationSchema, adminCreationOperationIdSchema } from "./admin-user-creation";
import { passwordRecoveryRequestSchema } from "./password-recovery";
import { listPageSchema } from "./list-pagination";

type AdminContext = { supabase: any; userId: string };

/** Confere a autorização administrativa exigida antes de acessar os recursos protegidos. */
async function assertAdmin(context: AdminContext) {
  const [{ data, error }, { data: hasUsers, error: moduleError }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_module", { _user_id: context.userId, _module: "users" }),
  ]);
  if (error || moduleError || !data || !hasUsers)
    throw new Error("Apenas administradores podem gerenciar usuários.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Ponto único de autorização para ações administrativas sensíveis.
// Hoje: exclusivas do Administrador Principal. Futuro: delegar por ação sem reconstruir o RBAC.
/** Restringe criação e mudanças sensíveis ao Administrador Principal. */
async function assertPrimary(
  admin: any,
  actorId: string,
  _action: "create_user" | "change_role" | "change_modules",
) {
  const { data, error } = await admin.rpc("is_primary_admin", { _user_id: actorId });
  if (error || !data) throw new Error("Somente o Administrador Principal pode realizar esta ação.");
}

/** Consulta o identificador do administrador principal para proteger sua conta. */
async function primaryId(admin: any): Promise<string | null> {
  const { data } = await admin.from("primary_admin").select("user_id").maybeSingle();
  return data?.user_id ?? null;
}

/** Consulta os usuários da página e enriquece somente esses IDs com dados de acesso. */
export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listPageSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context as AdminContext);
    const countResult = await admin.from("profiles").select("id", { count: "exact", head: true });
    if (countResult.error) throw new Error("Não foi possível consultar os usuários.");
    const total = countResult.count ?? 0;
    const page = Math.max(1, Math.min(data.page, Math.ceil(total / data.pageSize)));
    const profilesResult = await admin
      .from("profiles")
      .select("id,full_name,phone,status,created_at")
      .order("full_name")
      .order("id")
      .range((page - 1) * data.pageSize, page * data.pageSize - 1);
    if (profilesResult.error)
      throw new Error("Não foi possível consultar esta página de usuários.");
    const profiles = profilesResult.data ?? [];
    const ids = profiles.map((profile) => profile.id);
    if (!ids.length) return { rows: [], total, page, pageSize: data.pageSize };
    const [roles, technicians, mods, primary, authUsers] = await Promise.all([
      admin.from("user_roles").select("user_id,role").in("user_id", ids),
      admin.from("technicians").select("id,name,user_id,status").in("user_id", ids),
      admin.from("user_modules").select("user_id,module").in("user_id", ids),
      primaryId(admin),
      Promise.all(ids.map((id) => admin.auth.admin.getUserById(id))),
    ]);
    if (roles.error || technicians.error || mods.error || authUsers.some((result) => result.error))
      throw new Error("Não foi possível conferir os dados desta página de usuários.");
    const rows = profiles.map((profile, index) => {
      const authUser = authUsers[index]?.data.user;
      const technician = technicians.data?.find((item) => item.user_id === profile.id);
      return {
        ...profile,
        email: authUser?.email ?? null,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
        role: roles.data?.find((item) => item.user_id === profile.id)?.role ?? "viewer",
        technician_id: technician?.id ?? null,
        technician_name: technician?.name ?? null,
        is_primary: profile.id === primary,
        modules: (mods.data ?? [])
          .filter((item) => item.user_id === profile.id)
          .map((item) => item.module)
          .sort(),
      };
    });
    return { rows, total, page, pageSize: data.pageSize };
  });

/** Lista os técnicos disponíveis para vincular no formulário administrativo. */
export const listTechnicianOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context as AdminContext);
    const { data } = await admin.from("technicians").select("id,name,user_id").order("name");
    return data ?? [];
  });

/** Lê a configuração do servidor necessária à criação e ao redirecionamento de convites. */
function creationConfig() {
  return { siteUrl: process.env["APP_SITE_URL"], supabaseUrl: process.env["SUPABASE_URL"] };
}

/** Valida o pedido e encaminha a criação ao fluxo administrativo autorizado. */
export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminUserCreationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context as AdminContext);
    await assertPrimary(admin, context.userId, "create_user");
    const { createAdministrativeUser } = await import("./admin-user-creation.server");
    return createAdministrativeUser(context.supabase, admin, data, creationConfig());
  });

/** Autoriza e solicita a retomada de uma operação de criação. */
export const resumeAdminUserCreation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminCreationOperationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context as AdminContext);
    await assertPrimary(admin, context.userId, "create_user");
    const { resumeAdministrativeUser } = await import("./admin-user-creation.server");
    return resumeAdministrativeUser(context.supabase, admin, data.operationId, creationConfig());
  });

/** Autoriza o reenvio associado à operação de criação já existente. */
export const resendAdminUserInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminCreationOperationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context as AdminContext);
    await assertPrimary(admin, context.userId, "create_user");
    const { deliverCreationInvitation } = await import("./admin-user-creation.server");
    return deliverCreationInvitation(
      context.supabase,
      admin,
      data.operationId,
      creationConfig(),
      true,
    );
  });

/** Retorna as etapas administrativas de criação para a tela de acompanhamento. */
export const listAdminUserCreations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context as AdminContext);
    await assertPrimary(admin, context.userId, "create_user");
    const { listAdministrativeCreations } = await import("./admin-user-creation.server");
    return listAdministrativeCreations(context.supabase);
  });

/** Valida a alteração parcial e chama a transação autenticada de atualização e auditoria. */
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

/** Autoriza a recuperação do usuário-alvo e delega o envio ao serviço administrativo. */
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

/** Consulta a auditoria e resolve os nomes dos responsáveis e usuários afetados. */
export const listAdminAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context as AdminContext);
    const { data } = await admin
      .from("admin_audit_logs")
      .select("id,action,old_value,new_value,created_at,actor_id,target_user_id")
      .order("created_at", { ascending: false })
      .limit(50);
    const ids = Array.from(
      new Set((data ?? []).flatMap((r: any) => [r.actor_id, r.target_user_id]).filter(Boolean)),
    );
    const names = ids.length
      ? ((await admin.from("profiles").select("id,full_name").in("id", ids)).data ?? [])
      : [];
    /** Resolve o nome do usuário citado na auditoria, com alternativa para ausência. */
    const nameOf = (id: string | null) => names.find((p: any) => p.id === id)?.full_name ?? "—";
    return (data ?? []).map((r: any) => ({
      ...r,
      actor_name: nameOf(r.actor_id),
      target_name: nameOf(r.target_user_id),
    }));
  });
