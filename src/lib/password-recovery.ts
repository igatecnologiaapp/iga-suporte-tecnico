import { z } from "zod";

export const passwordRecoveryRequestSchema = z.object({ userId: z.string().uuid() }).strict();

export function canRequestPasswordRecovery(
  actor: { id: string; role: string; isPrimary: boolean },
  target: { id: string; role: string; isPrimary: boolean },
) {
  return (
    actor.role === "admin" &&
    actor.id !== target.id &&
    (actor.isPrimary || (!target.isPrimary && target.role !== "admin"))
  );
}

/** Trusted server configuration only; never use a browser-supplied return URL. */
export function passwordRecoveryRedirect(siteUrl?: string, supabaseUrl?: string) {
  let configured = siteUrl;
  if (!configured && supabaseUrl) {
    const local = new URL(supabaseUrl);
    if (
      local.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(local.hostname) &&
      ["54321", "55421"].includes(local.port)
    )
      configured = "http://127.0.0.1:4180";
  }
  if (!configured) throw new Error("Configure APP_SITE_URL para enviar instruções de recuperação.");
  const url = new URL(configured);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Configuração de recuperação inválida.");
  return new URL("/reset-password", url).href;
}

type RecoveryAuth = {
  getSession(): Promise<{ data: { session: unknown | null }; error: unknown }>;
  updateUser(attributes: { password: string }): Promise<{ error: unknown }>;
};

export async function completePasswordRecovery(auth: RecoveryAuth, password: string) {
  if (password.length < 8) throw new Error("Use uma senha com pelo menos 8 caracteres.");
  const session = await auth.getSession().catch(() => ({ data: { session: null }, error: true }));
  if (session.error || !session.data.session)
    throw new Error("Link inválido ou expirado. Solicite novas instruções de recuperação.");
  const result = await auth.updateUser({ password }).catch(() => ({ error: true }));
  if (result.error)
    throw new Error(
      "Não foi possível atualizar a senha. Solicite novas instruções de recuperação.",
    );
}
