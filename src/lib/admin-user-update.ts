/** Área: Validação e planejamento de alterações parciais de usuários e permissões. */
import { z } from "zod";

export const userModules = [
  "inbox",
  "tickets",
  "companies",
  "contacts",
  "categories",
  "sla",
  "technicians",
  "users",
  "integrations",
  "settings",
] as const;

export const adminUserUpdateSchema = z
  .object({
    userId: z.string().uuid(),
    fullName: z.string().trim().optional(),
    phone: z.string().trim().nullable().optional(),
    role: z.enum(["admin", "supervisor", "technician", "viewer"]).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    technicianId: z.string().uuid().nullable().optional(),
    modules: z
      .array(z.enum(userModules))
      .transform((values) => [...new Set(values)].sort())
      .optional(),
  })
  .strict();

export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>;

/** Read-only preflight; the database rechecks these rules under write locks. */
export function planAdminUserUpdate(
  input: AdminUserUpdate,
  state: {
    actorId: string;
    primaryId: string | null;
    currentRole: string;
    currentModules: string[];
  },
) {
  const result = { ...input };
  const actorIsPrimary = state.actorId === state.primaryId;
  if (input.userId === state.primaryId) {
    if (!actorIsPrimary)
      throw new Error("O Administrador Principal só pode ser alterado por ele mesmo.");
    if (input.status !== undefined && input.status !== "active")
      throw new Error("O Administrador Principal não pode ser desativado.");
    if (input.role !== undefined && input.role !== "admin")
      throw new Error("O papel do Administrador Principal não pode ser reduzido.");
    delete result.modules;
  }
  if (result.role !== undefined && result.role !== state.currentRole) {
    if (!actorIsPrimary)
      throw new Error("Somente o Administrador Principal pode realizar esta ação.");
    if (input.userId === state.actorId)
      throw new Error("Não é possível alterar o próprio perfil de acesso.");
  }
  if (
    result.modules !== undefined &&
    JSON.stringify(result.modules) !== JSON.stringify([...state.currentModules].sort()) &&
    !actorIsPrimary
  )
    throw new Error("Somente o Administrador Principal pode realizar esta ação.");
  return result;
}
