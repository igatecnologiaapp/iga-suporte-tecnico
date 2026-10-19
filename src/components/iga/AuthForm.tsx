import { useEffect, useState, type FormEventHandler, type ReactNode } from "react";

/** Keep credential controls inert until React can intercept submission. */
export function AuthForm({
  children,
  onSubmit,
  busy = false,
}: {
  children: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  busy?: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <form method="post" onSubmit={onSubmit} aria-busy={!ready || busy}>
      <fieldset disabled={!ready || busy} className="min-w-0 space-y-4">
        {children}
      </fieldset>
      <noscript>Ative o JavaScript para acessar sua conta com segurança.</noscript>
    </form>
  );
}
