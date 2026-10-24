import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";
import { z } from "zod";
import {
  adminUserCreationSchema,
  adminUserCreationPayloadSchema,
  type AdminUserCreation,
  type CreationOperation,
  type CreationResult,
} from "./admin-user-creation";
import { passwordRecoveryRedirect } from "./password-recovery";

export interface CreationRpc {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
type AdminAuth = Pick<SupabaseClient<Database>, "auth">;
type Config = { siteUrl?: string | undefined; supabaseUrl?: string | undefined };
const operationSchema = z.object({
  operationId: z.string().uuid(),
  userId: z.string().uuid(),
  payload: adminUserCreationPayloadSchema,
  stage: z.enum(["reserved", "provisioned"]),
  deliveryState: z.enum(["not_requested", "sending", "accepted", "failed", "unknown", "activated"]),
});
function result(op: CreationOperation): CreationResult {
  return {
    operationId: op.operationId,
    userId: op.userId,
    status: op.stage === "provisioned" ? "provisioned" : "pending",
    invitation: op.deliveryState,
    deliveryAttempted: false,
  };
}
async function rpc(client: CreationRpc, name: string, args?: Record<string, unknown>) {
  const response = await client.rpc(name, args);
  if (response.error) {
    const duplicateEmail = z
      .object({
        code: z.literal("22023"),
        message: z.literal("E-mail já cadastrado ou com operação pendente."),
      })
      .safeParse(response.error).success;
    throw new Error(
      duplicateEmail
        ? "Este e-mail já está cadastrado ou possui um cadastro pendente. Confira a lista de usuários e a seção Cadastros e convites."
        : "Não foi possível confirmar esta etapa. Atualize a lista e confira a seção Cadastros e convites antes de tentar novamente.",
    );
  }
  return response.data;
}
function parseOperation(value: unknown, operationId?: string) {
  const op = operationSchema.parse(value);
  if (operationId && op.operationId !== operationId) throw new Error("Operação não confirmada.");
  adminUserCreationSchema.parse({ ...op.payload, operationId: op.operationId });
  return op;
}
async function ownedIdentity(admin: AdminAuth, op: CreationOperation) {
  const found = await admin.auth.admin.getUserById(op.userId);
  if (found.error) {
    if (found.error.status === 404) return null;
    throw new Error("Não foi possível conferir a identidade reservada.");
  }
  if (!found.data.user) throw new Error("Identidade não confirmada.");
  const user = found.data.user;
  if (
    user.id !== op.userId ||
    user.email?.toLowerCase() !== op.payload["email"] ||
    user.app_metadata["admin_creation_operation"] !== op.operationId
  )
    throw new Error("A identidade da operação precisa de revisão.");
  return user;
}

export async function deliverCreationInvitation(
  client: CreationRpc,
  admin: AdminAuth,
  operationId: string,
  config: Config,
  resend = false,
): Promise<CreationResult> {
  let op = parseOperation(
    await rpc(client, "get_admin_user_creation", { _operation_id: operationId }),
    operationId,
  );
  if (op.stage !== "provisioned") return result(op);
  // Validate configuration before claiming a delivery or issuing a token.
  const redirectTo = passwordRecoveryRedirect(config.siteUrl, config.supabaseUrl);
  const token = randomUUID();
  const claim = z.object({ claimed: z.boolean(), state: operationSchema }).parse(
    await rpc(client, "claim_admin_user_invitation", {
      _operation_id: operationId,
      _delivery_token: token,
      _resend: resend,
    }),
  );
  op = parseOperation(claim.state, operationId);
  if (!claim.claimed) return result(op);
  let deliveryAttempted = false;
  let outcome: "accepted" | "failed" | "unknown" | "activated" = "unknown";
  try {
    const user = await ownedIdentity(admin, op);
    if (user?.email_confirmed_at) outcome = "activated";
    else if (user) {
      deliveryAttempted = true;
      const sent = await admin.auth.admin.inviteUserByEmail(String(op.payload["email"]), {
        redirectTo,
      });
      if (!sent.error && sent.data.user?.id === op.userId) outcome = "accepted";
      else if (
        sent.error &&
        sent.error.status &&
        sent.error.status >= 400 &&
        sent.error.status < 500
      )
        outcome = "failed";
    }
  } catch {
    /* A transport failure does not prove that delivery failed. */
  }
  try {
    op = parseOperation(
      await rpc(client, "record_admin_user_invitation", {
        _operation_id: operationId,
        _delivery_token: token,
        _outcome: outcome,
      }),
      operationId,
    );
    return { ...result(op), deliveryAttempted };
  } catch {
    // The intent remains in 'sending'; never automatically issue another token.
    return { ...result(op), invitation: "unknown", deliveryAttempted };
  }
}

async function provision(
  client: CreationRpc,
  admin: AdminAuth,
  op: CreationOperation,
  config: Config,
): Promise<CreationResult> {
  if (op.stage === "reserved") {
    try {
      let user = await ownedIdentity(admin, op);
      if (!user) {
        // UUID and server-only metadata bind retries to this reservation. No adopt/delete fallback.
        await admin.auth.admin.createUser({
          id: op.userId,
          email: String(op.payload["email"]),
          email_confirm: false,
          password: randomBytes(32).toString("base64url"),
          user_metadata: { full_name: op.payload["fullName"] },
          app_metadata: { admin_creation_operation: op.operationId },
        });
        // Concurrent requests or an ambiguous response may already have created this UUID.
        user = await ownedIdentity(admin, op);
      }
      if (!user || user.email_confirmed_at) return result(op);
      op = parseOperation(
        await rpc(client, "provision_admin_user_creation", { _operation_id: op.operationId }),
        op.operationId,
      );
    } catch {
      return result(op);
    }
  }
  try {
    return await deliverCreationInvitation(client, admin, op.operationId, config);
  } catch {
    return result(op);
  }
}
export async function createAdministrativeUser(
  client: CreationRpc,
  admin: AdminAuth,
  input: AdminUserCreation,
  config: Config,
): Promise<CreationResult> {
  const { operationId, ...payload } = adminUserCreationSchema.parse(input);
  // Configuration and validation errors must not create a reservation or Auth user.
  passwordRecoveryRedirect(config.siteUrl, config.supabaseUrl);
  const op = parseOperation(
    await rpc(client, "reserve_admin_user_creation", {
      _operation_id: operationId,
      _payload: payload,
    }),
    operationId,
  );
  return provision(client, admin, op, config);
}
export async function resumeAdministrativeUser(
  client: CreationRpc,
  admin: AdminAuth,
  operationId: string,
  config: Config,
): Promise<CreationResult> {
  passwordRecoveryRedirect(config.siteUrl, config.supabaseUrl);
  const op = parseOperation(
    await rpc(client, "get_admin_user_creation", { _operation_id: operationId }),
    operationId,
  );
  return provision(client, admin, op, config);
}
export async function listAdministrativeCreations(client: CreationRpc) {
  return z.array(operationSchema).parse(await rpc(client, "list_admin_user_creations"));
}
