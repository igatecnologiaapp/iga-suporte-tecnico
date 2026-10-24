import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PasswordResetPage } from "@/components/iga/PasswordResetPage";

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
  const navigate = useNavigate();
  return <PasswordResetPage onComplete={() => navigate({ to: "/auth" })} />;
}
