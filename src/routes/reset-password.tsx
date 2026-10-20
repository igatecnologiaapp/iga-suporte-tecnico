import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { NewPasswordForm } from "@/components/iga/NewPasswordForm";
import { completePasswordRecovery } from "@/lib/password-recovery";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — IGA Service" },
      { name: "description", content: "Defina uma nova senha para o IGA Service." },
      { property: "og:title", content: "Redefinir senha — IGA Service" },
      { property: "og:description", content: "Defina uma nova senha para o IGA Service." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  const nav = useNavigate();
  return (
    <main className="grid min-h-screen place-items-center bg-auth px-4">
      <section className="w-full max-w-md space-y-5 rounded-lg border bg-card p-7 shadow-xl">
        <NewPasswordForm
          submitPassword={async (password) => {
            await completePasswordRecovery(supabase.auth, password);
            toast.success("Senha atualizada.");
            await nav({ to: "/tickets" });
          }}
          onFailure={(error) =>
            toast.error(
              error instanceof Error ? error.message : "Não foi possível atualizar a senha.",
            )
          }
        />
      </section>
    </main>
  );
}
