import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Empty, Page } from "@/components/iga/Page";
import { StatusBadge } from "@/components/iga/StatusBadge";
import { MODULES } from "@/lib/modules";
import { errorMessage, formatDate, roleLabels } from "@/lib/iga";
import { createAdminUser, listAdminAudit, listAdminUsers, listTechnicianOptions, sendPasswordReset, updateAdminUser } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [
    { title: "Usuários — IGA Service" },
    { name: "description", content: "Criação e gestão de usuários, perfis de acesso e vínculos com técnicos." },
    { property: "og:title", content: "Usuários — IGA Service" },
    { property: "og:description", content: "Criação e gestão de usuários, perfis de acesso e vínculos com técnicos." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Users,
});

type AdminUser = { id: string; full_name: string; phone: string | null; status: string; created_at: string; email: string | null; last_sign_in_at: string | null; role: string; technician_id: string | null; technician_name: string | null; is_primary: boolean; modules: string[] };

function Users() {
  const { user, role, isPrimary } = Route.useRouteContext();
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<AdminUser[]>([]); const [techs, setTechs] = useState<any[]>([]); const [audit, setAudit] = useState<any[]>([]);
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<AdminUser | null>(null); const [busy, setBusy] = useState(false); const [newRole, setNewRole] = useState("viewer"); const [mods, setMods] = useState<string[]>([]);

  async function load() {
    try {
      const [users, technicians, logs] = await Promise.all([listAdminUsers(), listTechnicianOptions(), listAdminAudit()]);
      setRows(users as AdminUser[]); setTechs(technicians as any[]); setAudit(logs as any[]);
    } catch (error) { toast.error(errorMessage(error)); }
  }
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  if (!isAdmin) return <Page title="Usuários" description="Consulta de perfis de acesso."><Empty><ShieldAlert className="mx-auto mb-2 size-5" />Apenas administradores podem gerenciar usuários.</Empty></Page>;

  function startCreate() { setEditing(null); setNewRole("viewer"); setMods(["tickets"]); setOpen(true); }
  function startEdit(row: AdminUser) { setEditing(row); setNewRole(row.role); setMods(row.modules); setOpen(true); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); setBusy(true);
    try {
      const technicianField = String(f.get("technician_id") || "");
      if (editing) {
        await updateAdminUser({ data: { userId: editing.id, fullName: String(f.get("full_name")), phone: String(f.get("phone") || ""), role: newRole, status: String(f.get("status")), technicianId: newRole === "technician" ? (technicianField || null) : null, ...(isPrimary && !editing.is_primary ? { modules: mods } : {}) } });
        toast.success("Usuário atualizado.");
      } else {
        const result = await createAdminUser({ data: { fullName: String(f.get("full_name")), email: String(f.get("email")), phone: String(f.get("phone") || ""), role: newRole, status: String(f.get("status")), technicianId: technicianField === "new" ? null : technicianField || null, createTechnician: technicianField === "new", modules: mods } }) as { emailSent: boolean; actionLink: string | null };
        toast.success(result.emailSent ? "Usuário criado. Convite de primeiro acesso enviado por e-mail." : "Usuário criado. Envie o link de primeiro acesso exibido abaixo.");
        if (!result.emailSent && result.actionLink) window.prompt("Link seguro de primeiro acesso (copie e envie ao usuário):", result.actionLink);
      }
      setOpen(false); await load();
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }

  async function toggleStatus(row: AdminUser) {
    try { await updateAdminUser({ data: { userId: row.id, status: row.status === "active" ? "inactive" : "active" } }); toast.success(row.status === "active" ? "Usuário desativado." : "Usuário reativado."); await load(); }
    catch (error) { toast.error(errorMessage(error)); }
  }
  async function resetPassword(row: AdminUser) {
    if (!row.email) { toast.error("Usuário sem e-mail cadastrado."); return; }
    try { const result = await sendPasswordReset({ data: { email: row.email } }) as { actionLink: string | null }; if (result.actionLink) window.prompt("Link seguro de redefinição de senha:", result.actionLink); toast.success("Redefinição de senha iniciada."); }
    catch (error) { toast.error(errorMessage(error)); }
  }

  return <Page title="Usuários" description="Crie usuários, defina perfis de acesso e acompanhe a auditoria administrativa." action={isPrimary ? <Button onClick={startCreate}><Plus />Novo usuário</Button> : undefined}>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editing ? "Editar usuário" : "Novo usuário"}</DialogTitle><DialogDescription>{editing ? "Atualize dados, perfil de acesso e vínculos." : "O usuário recebe um convite seguro e define a própria senha no primeiro acesso."}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="full_name">Nome</Label><Input id="full_name" name="full_name" defaultValue={editing?.full_name ?? ""} required /></div>
        <div><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} disabled={Boolean(editing)} required={!editing} /></div>
        <div><Label htmlFor="phone">Telefone</Label><Input id="phone" name="phone" defaultValue={editing?.phone ?? ""} /></div>
        <div><Label htmlFor="role">Perfil de acesso</Label><select id="role" className="form-control" value={newRole} onChange={e => setNewRole(e.target.value)} disabled={editing?.id === user.id || !isPrimary}>{Object.entries(roleLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{editing?.id === user.id && <p className="mt-1 text-xs text-muted-foreground">Você não pode alterar o seu próprio perfil.</p>}</div>
        <div><Label htmlFor="status">Status</Label><select id="status" name="status" className="form-control" defaultValue={editing?.status ?? "active"}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></div>
        {newRole === "technician" && <div className="sm:col-span-2"><Label htmlFor="technician_id">Cadastro de técnico</Label><select id="technician_id" name="technician_id" className="form-control" defaultValue={editing?.technician_id ?? "new"}><option value="new">Criar cadastro a partir deste usuário</option><option value="">Sem vínculo</option>{techs.filter(t => !t.user_id || t.user_id === editing?.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
        <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">Módulos permitidos</legend>{editing?.is_primary ? <p className="mt-1 text-xs text-muted-foreground">Administrador Principal: acesso integral a todos os módulos.</p> : <div className="mt-2 grid gap-2 sm:grid-cols-2">{MODULES.map(m => <label key={m.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mods.includes(m.key)} disabled={!isPrimary} onChange={e => setMods(e.target.checked ? [...mods, m.key] : mods.filter(x => x !== m.key))} />{m.label}</label>)}</div>}{!isPrimary && <p className="mt-1 text-xs text-muted-foreground">Somente o Administrador Principal altera perfis e módulos.</p>}</fieldset>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={busy}>{editing ? "Salvar" : "Criar Usuário"}</Button></div>
      </form>
    </DialogContent></Dialog>

    {rows.length === 0 ? <Empty>Nenhum usuário encontrado.</Empty> : <div className="overflow-hidden rounded-md border bg-card"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/60 text-left"><tr><th className="px-4 py-3">Nome</th><th className="px-4 py-3">E-mail</th><th className="px-4 py-3">Perfil</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Técnico vinculado</th><th className="px-4 py-3">Último acesso</th><th className="px-4 py-3">Criado em</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.id} className="border-t">
        <td className="px-4 py-3 font-medium">{r.full_name || "Sem nome"}{r.phone && <span className="block text-xs text-muted-foreground">{r.phone}</span>}</td>
        <td className="px-4 py-3 text-muted-foreground">{r.email || "—"}</td>
        <td className="px-4 py-3">{r.is_primary ? "Administrador Principal" : (roleLabels[r.role] ?? r.role)}<span className="block text-xs text-muted-foreground">{r.is_primary ? "Todos os módulos" : `${r.modules.length} módulo(s)`}</span></td>
        <td className="px-4 py-3"><StatusBadge value={r.status} kind="record" /></td>
        <td className="px-4 py-3 text-muted-foreground">{r.technician_name || "—"}</td>
        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.last_sign_in_at)}</td>
        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
        <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => startEdit(r)}><Pencil />Editar</Button><Button size="sm" variant="ghost" onClick={() => void resetPassword(r)} aria-label="Redefinir senha"><KeyRound /></Button><Button size="sm" variant="ghost" onClick={() => void toggleStatus(r)} disabled={r.id === user.id || r.is_primary}>{r.status === "active" ? "Desativar" : "Reativar"}</Button></div></td>
      </tr>)}
    </tbody></table></div></div>}

    <div className="rounded-md border bg-card p-5"><h2 className="font-semibold">Auditoria administrativa</h2>{audit.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhuma alteração administrativa registrada.</p> : <div className="mt-4 divide-y">{audit.map(a => <div key={a.id} className="py-3 text-sm"><p className="font-medium">{auditLabels[a.action] ?? a.action}{a.target_name !== "—" ? ` · ${a.target_name}` : ""}</p><p className="text-xs text-muted-foreground">por {a.actor_name} em {formatDate(a.created_at)}{a.old_value || a.new_value ? ` · de ${JSON.stringify(a.old_value)} para ${JSON.stringify(a.new_value)}` : ""}</p></div>)}</div>}</div>
  </Page>;
}

const auditLabels: Record<string, string> = {
  user_created: "Usuário criado", user_updated: "Dados atualizados", role_changed: "Perfil de acesso alterado",
  user_activated: "Usuário ativado", user_deactivated: "Usuário desativado",
  technician_linked: "Técnico vinculado", technician_unlinked: "Técnico desvinculado",
  password_reset_requested: "Redefinição de senha iniciada", modules_changed: "Módulos permitidos alterados",
};
