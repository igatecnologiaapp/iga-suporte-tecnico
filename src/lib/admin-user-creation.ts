/** Área: Contratos de criação administrativa e mensagens das etapas de provisionamento. */
import { z } from "zod";
import { userModules } from "./admin-user-update.ts";

const basePayload = z
  .object({
    fullName: z.string().trim().min(1).max(160),
    email: z.string().trim().toLowerCase().email().max(254),
    phone: z
      .string()
      .trim()
      .max(40)
      .nullable()
      .optional()
      .transform((value) => value || null),
    role: z.enum(["admin", "supervisor", "technician", "viewer"]),
    status: z.enum(["active", "inactive"]),
    technicianId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    createTechnician: z.boolean().default(false),
    modules: z
      .array(z.enum(userModules))
      .min(1)
      .max(userModules.length)
      .transform((values) => [...new Set(values)].sort()),
  })
  .strict();

/** Confere a coerência entre perfil técnico, vínculo existente e pedido de criação. */
function validateTechnician(value: z.infer<typeof basePayload>, context: z.RefinementCtx) {
  if (value.technicianId && value.createTechnician)
    context.addIssue({
      code: "custom",
      path: ["technicianId"],
      message: "Selecione um técnico existente ou crie um cadastro, não ambos.",
    });
  if (value.role !== "technician" && (value.technicianId || value.createTechnician))
    context.addIssue({
      code: "custom",
      path: ["technicianId"],
      message: "Vínculo de técnico exige o perfil Técnico.",
    });
}
export const adminUserCreationPayloadSchema = basePayload.superRefine(validateTechnician);
export const adminUserCreationSchema = basePayload
  .extend({ operationId: z.string().uuid() })
  .superRefine(validateTechnician);

export const adminCreationOperationIdSchema = z.object({ operationId: z.string().uuid() }).strict();

export type AdminUserCreation = z.infer<typeof adminUserCreationSchema>;

export type InvitationState =
  "not_requested" | "sending" | "accepted" | "failed" | "unknown" | "activated";
export type CreationResult = {
  operationId: string;
  userId: string;
  status: "pending" | "provisioned";
  invitation: InvitationState;
  deliveryAttempted: boolean;
};
export type CreationOperation = {
  operationId: string;
  userId: string;
  payload: z.infer<typeof adminUserCreationPayloadSchema>;
  stage: "reserved" | "provisioned";
  deliveryState: InvitationState;
};

/** Traduz o estado da criação em orientação compreensível ao administrador. */
export function creationFeedback(result: CreationResult) {
  if (result.status === "pending")
    return {
      kind: "warning" as const,
      message:
        "Cadastro pendente. Retome a operação na lista de cadastros; não crie outro pedido para o mesmo e-mail.",
    };
  if (result.invitation === "accepted" && !result.deliveryAttempted)
    return {
      kind: "success" as const,
      message: "Cadastro já concluído. Nenhum novo convite foi solicitado nesta tentativa.",
    };
  if (result.invitation === "accepted")
    return {
      kind: "success" as const,
      message: "Usuário cadastrado. Envio do convite aceito; confira o e-mail do titular.",
    };
  if (result.invitation === "activated")
    return {
      kind: "info" as const,
      message:
        "Esta conta já tem o e-mail confirmado. Nenhum novo convite foi enviado. Para trocar a senha, use a recuperação na lista de usuários.",
    };
  return {
    kind: "warning" as const,
    message:
      "Usuário cadastrado; entrega do convite pendente ou não confirmada. Confira o e-mail antes de reenviar pela lista de cadastros.",
  };
}
