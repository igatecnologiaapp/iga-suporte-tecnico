/** Área: Estrutura visual das páginas e estados de carregamento, falha e lista vazia. */
import type { ReactNode } from "react";
import { AlertCircle, Loader2, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
/** Apresenta título, descrição e ações no contêiner compartilhado da página. */
export function Page({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-6">
      <div className="page-heading flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.18em] text-primary">
            IGA Service
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
/** Exibe a orientação acessível para uma lista sem resultados. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="grid justify-items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-14 text-center text-sm leading-relaxed text-muted-foreground"
    >
      <SearchX aria-hidden="true" className="size-9 rounded-xl bg-muted p-2" />
      <p>{children}</p>
    </div>
  );
}
/** Alterna entre espera e falha com ação de nova tentativa. */
export function LoadState({
  loading = false,
  error,
  onRetry,
}: {
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role={loading ? "status" : "alert"}
      aria-busy={loading}
      className="grid justify-items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center text-sm"
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="size-6 animate-spin text-primary" />
      ) : (
        <AlertCircle aria-hidden="true" className="size-6 text-destructive" />
      )}
      <p className="font-medium">
        {loading ? "Carregando cadastros…" : "Não foi possível carregar os cadastros"}
      </p>
      {!loading && (
        <>
          <p className="max-w-lg break-words text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={onRetry}>
            Tentar novamente
          </Button>
        </>
      )}
    </div>
  );
}
