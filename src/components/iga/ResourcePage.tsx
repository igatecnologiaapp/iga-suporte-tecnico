import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Archive, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/iga";
import { archiveRecord, deleteRecord, inspectRecord, restoreRecord, type RecordEntity } from "@/lib/records-admin.functions";
import { Empty, Page } from "./Page";
import { StatusBadge } from "./StatusBadge";

type Kind = RecordEntity;
const config = {
  companies: { title: "Empresas / Clientes", desc: "Cadastre e mantenha os clientes atendidos.", name: "trade_name", table: "companies" },
  contacts: { title: "Contatos", desc: "Gerencie solicitantes vinculados às empresas.", name: "name", table: "contacts" },
  technicians: { title: "Técnicos", desc: "Organize a equipe técnica vinculada aos usuários.", name: "name", table: "technicians" },
  categories: { title: "Categorias de Chamados", desc: "Estruture categorias e subcategorias do atendimento.", name: "name", table: "ticket_categories" },
} as const;

export function ResourcePage({ kind, userId, canManage, role }: { kind: Kind; userId: string; canManage: boolean; role?: string }) {
  const c = config[kind];
  const canDelete = role === "admin";
  const [rows, setRows] = useState<any[]>([]);
  const [related, setRelated] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<{ kind: "archive" | "delete"; row: any; references: { label: string; total: number }[]; canDelete: boolean; activeTickets: number } | null>(null);
  const [reason, setReason] = useState("");
  const [allCats, setAllCats] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [selCats, setSelCats] = useState<string[]>([]);
  const [defCat, setDefCat] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const canLinkCats = role === "admin" || role === "supervisor";

  async function load() {
    const { data, error } = await supabase.from(c.table).select("*").order(c.name);
    if (error) toast.error(error.message); else setRows(data ?? []);
    if (kind === "companies") {
      const [{ data: cs }, { data: ls }] = await Promise.all([
        supabase.from("ticket_categories").select("id,name,status").is("parent_id", null).order("name"),
        supabase.from("company_ticket_categories").select("company_id,category_id,is_default"),
      ]);
      setAllCats(cs ?? []); setLinks(ls ?? []);
    }
    if (kind === "contacts") setRelated((await supabase.from("companies").select("id,trade_name").eq("status", "active").order("trade_name")).data ?? []);
    if (kind === "technicians") setRelated((await supabase.from("profiles").select("id,full_name").order("full_name")).data ?? []);
    if (kind === "categories") setRelated((await supabase.from("ticket_categories").select("id,name").is("parent_id", null).eq("status", "active").order("name")).data ?? []);
  }
  useEffect(() => { void load(); }, [kind]);
  const filtered = useMemo(() => rows
    .filter(row => showArchived || row.status !== "inactive")
    .filter(row => !catFilter || links.some(l => l.company_id === row.id && l.category_id === catFilter))
    .filter(row => JSON.stringify(row).toLowerCase().includes(q.toLowerCase())), [rows, q, showArchived, catFilter, links]);
  function companyCats(id: string) {
    return links.filter(l => l.company_id === id).map(l => ({ ...l, name: allCats.find(c => c.id === l.category_id)?.name ?? "—" }))
      .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
  }
  function openEditor(row: any) {
    setEditing(row);
    const own = row ? links.filter(l => l.company_id === row.id) : [];
    setSelCats(own.map(l => l.category_id)); setDefCat(own.find(l => l.is_default)?.category_id ?? "");
    setOpen(true);
  }
  async function syncCompanyCats(companyId: string) {
    const del = supabase.from("company_ticket_categories").delete().eq("company_id", companyId);
    const r1 = selCats.length ? await del.not("category_id", "in", `(${selCats.join(",")})`) : await del;
    if (r1.error) return r1.error;
    const r2 = await supabase.from("company_ticket_categories").update({ is_default: false }).eq("company_id", companyId).eq("is_default", true);
    if (r2.error) return r2.error;
    if (selCats.length) {
      const r3 = await supabase.from("company_ticket_categories").upsert(selCats.map(id => ({ company_id: companyId, category_id: id, created_by: userId })), { onConflict: "company_id,category_id", ignoreDuplicates: true });
      if (r3.error) return r3.error;
    }
    if (defCat && selCats.includes(defCat)) {
      const r4 = await supabase.from("company_ticket_categories").update({ is_default: true }).eq("company_id", companyId).eq("category_id", defCat);
      if (r4.error) return r4.error;
    }
    return null;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const fd = new FormData(event.currentTarget); let payload: any = {};
    if (kind === "companies") payload = { legal_name: fd.get("legal_name"), trade_name: fd.get("trade_name"), tax_id: fd.get("tax_id"), phone: fd.get("phone") || null, whatsapp: fd.get("whatsapp") || null, email: fd.get("email") || null, postal_code: fd.get("postal_code") || null, address: fd.get("address") || null, address_number: fd.get("address_number") || null, complement: fd.get("complement") || null, district: fd.get("district") || null, city: fd.get("city") || null, state: fd.get("state") || null, notes: fd.get("notes") || null, status: fd.get("status") };
    if (kind === "contacts") payload = { company_id: fd.get("company_id"), name: fd.get("name"), job_title: fd.get("job_title") || null, phone: fd.get("phone") || null, whatsapp: fd.get("whatsapp") || null, email: fd.get("email") || null, is_primary: fd.get("is_primary") === "on", status: fd.get("status") };
    if (kind === "technicians") payload = { user_id: fd.get("user_id"), name: fd.get("name"), phone: fd.get("phone") || null, email: fd.get("email"), specialty: fd.get("specialty") || null, status: fd.get("status") };
    if (kind === "categories") payload = { name: fd.get("name"), parent_id: fd.get("parent_id") || null, status: fd.get("status") };
    if (!editing && (kind === "companies" || kind === "contacts")) payload.created_by = userId;
    const query = editing ? supabase.from(c.table).update(payload as never).eq("id", editing.id).select("id") : supabase.from(c.table).insert(payload as never).select("id");
    const { data: saved, error } = await query;
    if (error) { setSaving(false); toast.error(errorMessage(error)); return; }
    if (kind === "companies" && canLinkCats) {
      const id = editing?.id ?? (saved as any)?.[0]?.id;
      const linkError = id ? await syncCompanyCats(id) : null;
      if (linkError) { setSaving(false); toast.error("Empresa salva, mas as categorias não foram atualizadas: " + errorMessage(linkError)); await load(); return; }
    }
    setSaving(false);
    toast.success(editing ? "Cadastro atualizado." : "Cadastro salvo com sucesso."); setOpen(false); setEditing(null); await load();
  }
  function close(next: boolean) { setOpen(next); if (!next) setEditing(null); }

  async function startAction(kindOfAction: "archive" | "delete", row: any) {
    try {
      const info = await inspectRecord({ data: { entity: kind, id: row.id } });
      setReason(""); setAction({ kind: kindOfAction, row, references: info.references, canDelete: info.canDelete, activeTickets: info.activeTickets });
    } catch (error) { toast.error(errorMessage(error)); }
  }
  async function confirmAction() {
    if (!action) return;
    setSaving(true);
    try {
      if (action.kind === "archive") { await archiveRecord({ data: { entity: kind, id: action.row.id, reason } }); toast.success("Registro arquivado."); setAction(null); }
      else {
        const result = await deleteRecord({ data: { entity: kind, id: action.row.id, reason } });
        if (result.deleted) { toast.success(result.message); setAction(null); }
        else { toast.error(result.message); setAction(prev => prev ? { ...prev, kind: "archive", canDelete: false } : prev); }
      }
      await load();
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSaving(false); }
  }
  async function restore(row: any) {
    try { await restoreRecord({ data: { entity: kind, id: row.id } }); toast.success("Registro restaurado."); await load(); }
    catch (error) { toast.error(errorMessage(error)); }
  }

  return <Page title={c.title} description={c.desc} action={canManage ? <Button onClick={() => openEditor(null)}><Plus />Novo cadastro</Button> : undefined}>
    <Dialog open={open} onOpenChange={close}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? "Editar cadastro" : "Novo cadastro"}</DialogTitle><DialogDescription>Preencha os dados obrigatórios.</DialogDescription></DialogHeader>
      <form key={editing?.id ?? "new"} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {kind === "companies" && <><Field n="legal_name" l="Razão Social" value={editing?.legal_name}/><Field n="trade_name" l="Nome Fantasia" value={editing?.trade_name}/><Field n="tax_id" l="CNPJ/CPF" value={editing?.tax_id}/><Field n="phone" l="Telefone" req={false} value={editing?.phone}/><Field n="whatsapp" l="WhatsApp" req={false} value={editing?.whatsapp}/><Field n="email" l="E-mail" type="email" req={false} value={editing?.email}/><Field n="postal_code" l="CEP" req={false} value={editing?.postal_code}/><Field n="address" l="Endereço" req={false} value={editing?.address}/><Field n="address_number" l="Número" req={false} value={editing?.address_number}/><Field n="complement" l="Complemento" req={false} value={editing?.complement}/><Field n="district" l="Bairro" req={false} value={editing?.district}/><Field n="city" l="Cidade" req={false} value={editing?.city}/><Field n="state" l="UF" req={false} value={editing?.state}/><div className="sm:col-span-2"><Label htmlFor="notes">Observações</Label><Textarea id="notes" name="notes" defaultValue={editing?.notes ?? ""}/></div>
          <fieldset className="rounded-md border p-3 sm:col-span-2"><legend className="px-1 text-sm font-medium">Categorias de Chamados</legend>
            {!canLinkCats ? <CatChips cats={editing ? companyCats(editing.id) : []}/> : <>
              <p className="mb-2 text-xs text-muted-foreground">Opcional. Sem categorias, a abertura de chamado mostra todas as categorias ativas.</p>
              <div className="grid gap-2 sm:grid-cols-2">{allCats.filter(cat => cat.status === "active" || selCats.includes(cat.id)).map(cat => { const on = selCats.includes(cat.id); return <div key={cat.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={on} onChange={e => { const next = e.target.checked ? [...selCats, cat.id] : selCats.filter(x => x !== cat.id); setSelCats(next); if (!e.target.checked && defCat === cat.id) setDefCat(""); }}/>{cat.name}{cat.status !== "active" && <span className="text-xs text-muted-foreground">(inativa)</span>}</label>
                <label className={"flex items-center gap-1 text-xs " + (on ? "" : "opacity-40")}><input type="radio" name="default_category" disabled={!on} checked={defCat === cat.id} onChange={() => setDefCat(cat.id)}/>Padrão</label>
              </div>; })}</div>
              {defCat && <button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={() => setDefCat("")}>Remover categoria padrão</button>}
            </>}
          </fieldset></>}
        {kind === "contacts" && <><SelectField n="company_id" l="Empresa / Cliente" rows={related} value={editing?.company_id}/><Field n="name" l="Nome" value={editing?.name}/><Field n="job_title" l="Cargo / Função" req={false} value={editing?.job_title}/><Field n="phone" l="Telefone" req={false} value={editing?.phone}/><Field n="whatsapp" l="WhatsApp" req={false} value={editing?.whatsapp}/><Field n="email" l="E-mail" type="email" req={false} value={editing?.email}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_primary" defaultChecked={editing?.is_primary ?? false}/>Contato principal</label></>}
        {kind === "technicians" && <><SelectField n="user_id" l="Usuário vinculado" rows={related} value={editing?.user_id}/><Field n="name" l="Nome" value={editing?.name}/><Field n="phone" l="Telefone" req={false} value={editing?.phone}/><Field n="email" l="E-mail" type="email" value={editing?.email}/><Field n="specialty" l="Especialidade" req={false} value={editing?.specialty}/></>}
        {kind === "categories" && <><Field n="name" l="Nome" value={editing?.name}/><SelectField n="parent_id" l="Categoria superior (opcional)" rows={related.filter((row) => row.id !== editing?.id)} optional value={editing?.parent_id}/></>}
        <div><Label htmlFor="record-status">Status</Label><select id="record-status" name="status" className="form-control" defaultValue={editing?.status ?? "active"}><option value="active">Ativo</option><option value="inactive">Inativo / Arquivado</option></select></div>
        <div className="flex items-end justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={saving}>{saving ? "Salvando..." : editing ? "Salvar alterações" : "Salvar"}</Button></div>
      </form></DialogContent></Dialog>

    <div className="flex flex-wrap items-center gap-3">
      <div className="relative max-w-md flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="pl-9" placeholder="Pesquisar..." value={q} onChange={(e) => setQ(e.target.value)}/></div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/>Mostrar arquivados/inativos</label>
      {kind === "companies" && <select aria-label="Filtrar por categoria" className="form-control max-w-xs" value={catFilter} onChange={e => setCatFilter(e.target.value)}><option value="">Categoria: todas</option>{allCats.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select>}
    </div>

    {filtered.length === 0 ? <Empty>Nenhum cadastro encontrado.</Empty> : <div className="overflow-hidden rounded-md border bg-card"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/60 text-left"><tr><th className="px-4 py-3">Nome</th><th className="px-4 py-3">Detalhe</th><th className="px-4 py-3">Status</th>{canManage && <th className="w-40 px-4 py-3"><span className="sr-only">Ações</span></th>}</tr></thead><tbody>{filtered.map((row) => <tr key={row.id} className="border-t"><td className="px-4 py-3 font-medium">{row[c.name]}</td><td className="px-4 py-3 text-muted-foreground">{row.legal_name || row.email || (row.parent_id ? "Subcategoria" : "Categoria") || "—"}{kind === "companies" && <div className="mt-1"><CatChips cats={companyCats(row.id)}/></div>}</td><td className="px-4 py-3"><StatusBadge value={row.status} kind="record"/></td>{canManage && <td className="px-4 py-3"><div className="flex items-center gap-1">
      <Button size="icon" variant="ghost" onClick={() => openEditor(row)} aria-label={`Editar ${row[c.name]}`}><Pencil/></Button>
      {row.status === "inactive"
        ? <Button size="icon" variant="ghost" onClick={() => void restore(row)} aria-label={`Restaurar ${row[c.name]}`}><ArchiveRestore/></Button>
        : <Button size="icon" variant="ghost" onClick={() => void startAction("archive", row)} aria-label={`Arquivar ${row[c.name]}`}><Archive/></Button>}
      {canDelete && <Button size="icon" variant="ghost" onClick={() => void startAction("delete", row)} aria-label={`Excluir ${row[c.name]}`}><Trash2/></Button>}
    </div></td>}</tr>)}</tbody></table></div></div>}

    <Dialog open={action !== null} onOpenChange={next => { if (!next) setAction(null); }}><DialogContent>
      <DialogHeader>
        <DialogTitle>{action?.kind === "archive" ? "Arquivar registro?" : "Excluir registro?"}</DialogTitle>
        <DialogDescription>
          {action?.kind === "archive"
            ? `${action?.row?.[c.name]} deixará de aparecer nas seleções operacionais, mas continua consultável e pode ser restaurado.`
            : action?.canDelete
              ? `${action?.row?.[c.name]} não possui histórico e pode ser excluído definitivamente.`
              : `${action?.row?.[c.name]} possui histórico (${action?.references.map(r => `${r.total} ${r.label}`).join(", ")}) e por isso será arquivado em vez de excluído.`}
        </DialogDescription>
      </DialogHeader>
      {action?.activeTickets ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">Atenção: este técnico possui {action.activeTickets} chamado(s) ainda em aberto. Redistribua os chamados antes de concluir.</p> : null}
      <div><Label htmlFor="action-reason">Motivo</Label><Textarea id="action-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} /></div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAction(null)}>Cancelar</Button><Button disabled={saving || !reason.trim()} onClick={() => void confirmAction()}>Confirmar</Button></div>
    </DialogContent></Dialog>
  </Page>;
}
function Field({ n, l, type = "text", req = true, value }: { n: string; l: string; type?: string; req?: boolean; value?: unknown }) { return <div><Label htmlFor={n}>{l}</Label><Input id={n} name={n} type={type} required={req} defaultValue={value == null ? "" : String(value)}/></div>; }
function SelectField({ n, l, rows, optional = false, value }: { n: string; l: string; rows: any[]; optional?: boolean; value?: unknown }) { return <div><Label htmlFor={n}>{l}</Label><select id={n} name={n} required={!optional} className="form-control" defaultValue={value == null ? "" : String(value)}><option value="">Selecione</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.trade_name || row.full_name || row.name}</option>)}</select></div>; }

function CatChips({ cats }: { cats: { category_id: string; name: string; is_default: boolean }[] }) {
  if (!cats.length) return <span className="text-xs text-muted-foreground">Nenhuma categoria de chamado associada</span>;
  return <div className="flex flex-wrap gap-1">{cats.map(c => <span key={c.category_id} className={"rounded-full border px-2 py-0.5 text-xs " + (c.is_default ? "border-primary bg-primary/10 text-primary" : "")}>{c.name}{c.is_default ? " — Padrão" : ""}</span>)}</div>;
}
