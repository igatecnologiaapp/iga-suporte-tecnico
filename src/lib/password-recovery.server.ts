import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";
import { canRequestPasswordRecovery, passwordRecoveryRedirect } from "./password-recovery";

export type RecoveryDeliveryResult = {
  status: "requested" | "failed";
  audit: "recorded" | "pending";
};

export async function requestAdministrativePasswordRecovery(
  admin: SupabaseClient<Database>,
  actorId: string,
  targetId: string,
  config: { siteUrl?: string; supabaseUrl?: string },
): Promise<RecoveryDeliveryResult> {
  const [profile, role, primary, account] = await Promise.all([
    admin.from("profiles").select("id").eq("id", targetId).single(),
    admin.from("user_roles").select("role").eq("user_id", targetId).single(),
    admin.from("primary_admin").select("user_id").single(),
    admin.auth.admin.getUserById(targetId),
  ]);
  if (
    profile.error ||
    role.error ||
    primary.error ||
    account.error ||
    !profile.data ||
    !role.data ||
    !primary.data ||
    account.data.user?.id !== targetId
  )
    throw new Error("Não foi possível validar o usuário para recuperação.");

  if (
    !canRequestPasswordRecovery(
      { id: actorId, role: "admin", isPrimary: primary.data.user_id === actorId },
      { id: targetId, role: role.data.role, isPrimary: primary.data.user_id === targetId },
    )
  )
    throw new Error(
      "Você não tem permissão para solicitar a recuperação deste usuário. Para sua própria conta, use Esqueci a senha.",
    );

  const email = account.data.user.email;
  if (!email || !account.data.user.email_confirmed_at)
    throw new Error("O usuário precisa concluir a confirmação do e-mail antes da recuperação.");
  const redirectTo = passwordRecoveryRedirect(config.siteUrl, config.supabaseUrl);
  const requestId = randomUUID();

  async function audit(action: string, outcome?: string) {
    try {
      const result = await admin.from("admin_audit_logs").insert({
        actor_id: actorId,
        target_user_id: targetId,
        action,
        old_value: null,
        new_value: { request_id: requestId, channel: "email", ...(outcome ? { outcome } : {}) },
      });
      return !result.error;
    } catch {
      return false;
    }
  }

  // External delivery cannot be rolled back. Always persist intent before Auth.
  if (!(await audit("password_reset_requested")))
    throw new Error("Não foi possível registrar a solicitação. Nenhum envio foi iniciado.");

  let accepted = false;
  try {
    const result = await admin.auth.resetPasswordForEmail(email, { redirectTo });
    accepted = !result.error;
  } catch {
    accepted = false;
  }
  const recorded = await audit(
    accepted ? "password_reset_email_requested" : "password_reset_failed",
    accepted ? "accepted_by_auth" : "delivery_not_confirmed",
  );
  // Do not return the Auth response, user object, token or action link.
  return { status: accepted ? "requested" : "failed", audit: recorded ? "recorded" : "pending" };
}
