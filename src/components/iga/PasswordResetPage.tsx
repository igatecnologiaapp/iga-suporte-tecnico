import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { NewPasswordForm } from "./NewPasswordForm";
import {
  initializePasswordResetSession,
  type PasswordResetSession,
  type PasswordResetAuth,
} from "../../lib/password-recovery";
import { createPasswordResetClient } from "../../integrations/supabase/password-reset-client";

const defaultCreateAuth = () => createPasswordResetClient().auth;

export function PasswordResetPage({
  onComplete,
  createAuth = defaultCreateAuth,
}: {
  onComplete: () => unknown;
  createAuth?: () => PasswordResetAuth;
}) {
  const [session, setSession] = useState<PasswordResetSession | null>(null);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const initialization = useRef<Promise<PasswordResetSession> | null>(null);
  useEffect(() => {
    if (!initialization.current) {
      const callback = window.location.href;
      window.history.replaceState(window.history.state, "", window.location.pathname);
      initialization.current = initializePasswordResetSession(callback, createAuth);
    }
    let active = true;
    void initialization.current.then(
      (value) => {
        if (active) setSession(value);
      },
      () => {
        if (active) setInvalid(true);
      },
    );
    return () => {
      active = false;
    };
  }, [createAuth]);
  return (
    <main className="grid min-h-screen place-items-center bg-auth px-4">
      <section className="w-full max-w-md space-y-5 rounded-lg border bg-card p-7 shadow-xl">
        {done ? (
          <p role="status">Senha atualizada. Entre com seu e-mail e a nova senha.</p>
        ) : invalid ? (
          <p role="alert">Link inválido ou expirado. Solicite novas instruções de recuperação.</p>
        ) : session ? (
          <>
            <p className="text-sm text-muted-foreground">
              Defina a senha para {session.email ?? "a conta deste convite"}.
            </p>
            <NewPasswordForm
              submitPassword={async (password) => {
                await session.complete(password);
                toast.success("Senha atualizada. Entre com seu e-mail e a nova senha.");
                setDone(true);
                await onComplete();
              }}
              onFailure={(error) =>
                toast.error(
                  error instanceof Error ? error.message : "Não foi possível atualizar a senha.",
                )
              }
            />
          </>
        ) : (
          <p role="status">Validando convite ou recuperação…</p>
        )}
        <noscript>Ative o JavaScript para validar este link com segurança.</noscript>
      </section>
    </main>
  );
}
