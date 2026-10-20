import { z } from "zod";
import { userModules } from "./admin-user-update.ts";

export const adminUserCreationSchema = z
  .object({
    operationId: z.string().uuid(),
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
  .strict()
  .superRefine((value, context) => {
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
  });

export type AdminUserCreation = z.infer<typeof adminUserCreationSchema>;
