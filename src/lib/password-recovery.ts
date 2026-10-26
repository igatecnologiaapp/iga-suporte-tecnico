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

export function shouldDetectSharedAuthCallback(pathname: string) {
  return pathname.replace(/\/+$/, "") !== "/reset-password";
}

const invalidLink = "Link inválido ou expirado. Solicite novas instruções de recuperação.";
export interface PasswordResetAuth {
  setSession(tokens: { access_token: string; refresh_token: string }): Promise<{
    data: { session: { user: { id: string } } | null };
    error: unknown;
  }>;
  getUser(): Promise<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
  updateUser(attributes: { password: string }): Promise<{ error: unknown }>;
  signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
}
export type PasswordResetSession = {
  email: string | null;
  complete(password: string): Promise<void>;
};

/** Accept only an explicit invite/recovery callback. A stored login is never evidence. */
export async function initializePasswordResetSession(
  callbackUrl: string,
  createIsolatedAuth: () => PasswordResetAuth,
): Promise<PasswordResetSession> {
  let accessToken: string, refreshToken: string;
  try {
    const url = new URL(callbackUrl);
    const params = new URLSearchParams(url.hash.slice(1));
    const errors = ["error", "error_code", "error_description"];
    const required = ["access_token", "refresh_token", "type", "token_type"];
    if (
      shouldDetectSharedAuthCallback(url.pathname) ||
      errors.some((key) => params.has(key) || url.searchParams.has(key)) ||
      required.some((key) => params.getAll(key).length !== 1) ||
      !["invite", "recovery"].includes(params.get("type") || "") ||
      params.get("token_type") !== "bearer"
    )
      throw new Error(invalidLink);
    accessToken = params.get("access_token") || "";
    refreshToken = params.get("refresh_token") || "";
    if (!accessToken || !refreshToken) throw new Error(invalidLink);
  } catch {
    throw new Error(invalidLink);
  }
  // The caller must supply a dedicated, nonpersistent SDK client. Never the app login.
  const auth = createIsolatedAuth();
  const authenticated = await auth
    .setSession({ access_token: accessToken, refresh_token: refreshToken })
    .catch(() => null);
  if (!authenticated || authenticated.error || !authenticated.data.session?.user.id)
    throw new Error(invalidLink);
  const expectedId = authenticated.data.session.user.id;
  const verified = await auth.getUser().catch(() => null);
  if (!verified || verified.error || verified.data.user?.id !== expectedId)
    throw new Error(invalidLink);
  let used = false;
  let busy = false;
  return {
    email: verified.data.user.email ?? null,
    async complete(password) {
      if (used || busy) throw new Error(invalidLink);
      if (password.length < 8) throw new Error("Use uma senha com pelo menos 8 caracteres.");
      busy = true;
      try {
        const current = await auth.getUser().catch(() => null);
        if (!current || current.error || current.data.user?.id !== expectedId)
          throw new Error(invalidLink);
        const updated = await auth.updateUser({ password }).catch(() => ({ error: true }));
        if (updated.error) {
          if (
            typeof updated.error === "object" &&
            "code" in updated.error &&
            updated.error.code === "same_password"
          )
            throw new Error(
              "A nova senha deve ser diferente da senha atual. Escolha outra senha e tente novamente.",
            );
          throw new Error(
            "Não foi possível atualizar a senha. Solicite novas instruções de recuperação.",
          );
        }
        used = true;
        // Only the isolated link session is closed; the main browser login is untouched.
        await auth.signOut({ scope: "local" }).catch(() => undefined);
      } finally {
        busy = false;
      }
    },
  };
}
