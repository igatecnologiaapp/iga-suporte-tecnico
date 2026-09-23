import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/iga/AppShell";
import { roleLabels } from "@/lib/iga";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const [{ data: profile }, { data: roles }, { data: technician }] = await Promise.all([
      supabase.from("profiles").select("full_name,status").eq("id", data.user.id).single(),
      supabase.from("user_roles").select("role").eq("user_id", data.user.id),
      supabase.from("technicians").select("id,status").eq("user_id", data.user.id).maybeSingle(),
    ]);
    if (profile && (profile as { status?: string }).status === "inactive") {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { blocked: "1" } as never });
    }
    const role = roles?.[0]?.role ?? "viewer";
    const technicianId = technician?.status === "active" ? technician.id : null;
    return { user: data.user, profile, role, technicianId };
  },
  component: Layout,
});

function Layout() {
  const { user, profile, role } = Route.useRouteContext();
  return <AppShell userName={profile?.full_name || user.email || "Usuário"} role={roleLabels[role] || role} roleCode={role}><Outlet /></AppShell>;
}
