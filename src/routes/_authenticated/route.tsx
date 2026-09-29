import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/iga/AppShell";
import { roleLabels } from "@/lib/iga";
import { MODULES, moduleForPath } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const [{ data: profile }, { data: roles }, { data: technician }, { data: access }] = await Promise.all([
      supabase.from("profiles").select("full_name,status").eq("id", data.user.id).single(),
      supabase.from("user_roles").select("role").eq("user_id", data.user.id),
      supabase.from("technicians").select("id,status").eq("user_id", data.user.id).maybeSingle(),
      supabase.rpc("my_modules"),
    ]);
    if (profile && (profile as { status?: string }).status === "inactive") {
      await supabase.auth.signOut();
      toast.error("Seu acesso está inativo. Procure um administrador.");
      throw redirect({ to: "/auth" });
    }
    const role = roles?.[0]?.role ?? "viewer";
    const technicianId = technician?.status === "active" ? technician.id : null;
    const acc = (access ?? {}) as { is_primary?: boolean; modules?: string[] };
    const modules = acc.modules ?? [];
    const isPrimary = Boolean(acc.is_primary);
    const current = moduleForPath(location.pathname);
    if (current && !modules.includes(current)) {
      const first = MODULES.find(m => modules.includes(m.key));
      if (first && first.path !== location.pathname) {
        toast.error("Você não tem permissão para acessar este módulo.");
        throw redirect({ to: first.path });
      }
      if (!first) {
        await supabase.auth.signOut();
        toast.error("Nenhum módulo liberado para o seu usuário. Procure o administrador.");
        throw redirect({ to: "/auth" });
      }
    }
    return { user: data.user, profile, role, technicianId, modules, isPrimary };
  },
  component: Layout,
});

function Layout() {
  const { user, profile, role, modules } = Route.useRouteContext();
  return <AppShell userName={profile?.full_name || user.email || "Usuário"} role={roleLabels[role] || role} modules={modules}><Outlet /></AppShell>;
}
