import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Empty, Page } from "@/components/iga/Page";
import { StatusBadge } from "@/components/iga/StatusBadge";
import { SlaBadge } from "@/components/iga/SlaBadge";
import { companyCategoryOptions, type CompanyCategoryLink, canOperate, formatDate, formatDuration, matchesQueue, priorities, ticketQueues, ticketStatuses } from "@/lib/iga";
import { computeSla, type SlaPolicy } from "@/lib/sla";
import { syncSlaNotifications } from "@/lib/sla-notifications.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tickets/")({
  head: () => ({ meta: [
    { title: "Chamados — IGA Service" },
    { name: "description", content: "Central operacional de chamados técnicos: filas, SLA e acompanhamento." },
    { property: "og:title", content: "Chamados — IGA Service" },
    { property: "og:description", content: "Central operacional de chamados técnicos: filas, SLA e acompanhamento." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Tickets,
});

function Tickets() {
  const { user, role, technicianId } = Route.useRouteContext();
  const can = canOperate(role);
  const [rows, setRows] = useState<any[]>([]); const [companies, setCompanies] = useState<any[]>([]); const [contacts, setContacts] = useState<any[]>([]); const [cats, setCats] = useState<any[]>([]); const [technicians, setTechnicians] = useState<any[]>([]); const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [catLinks, setCatLinks] = useState<CompanyCategoryLink[]>([]); const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [company, setCompany] = useState(""); const [category, setCategory] = useState("");
  const [queue, setQueue] = useState(technicianId ? "mine" : "all");
  const [statusFilter, setStatusFilter] = useState(""); const [priorityFilter, setPriorityFilter] = useState(""); const [companyFilter, setCompanyFilter] = useState(""); const [technicianFilter, setTechnicianFilter] = useState("");

  async function load() {
    const [{ data: t, error: ticketsError }, { data: c }, { data: co }, { data: ca }, { data: te }, { data: sla }, { data: lk }] = await Promise.all([
      supabase.from("tickets").select("id,number,subject,status,priority,opened_at,company_id,assigned_technician_id,acknowledged_at,first_response_at,resolved_at,closed_at,scheduled_at,last_activity_at,companies(trade_name),technicians!tickets_assigned_technician_id_fkey(name)").order("opened_at", { ascending: false }),
      supabase.from("companies").select("id,trade_name").eq("status", "active").order("trade_name"),
      supabase.from("contacts").select("id,name,company_id,phone").eq("status", "active").order("name"),
      supabase.from("ticket_categories").select("id,name,parent_id").eq("status", "active").order("name"),
      supabase.from("technicians").select("id,name").eq("status", "active").order("name"),
      supabase.from("sla_policies").select("*"),
      supabase.from("company_ticket_categories").select("company_id,category_id,is_default"),
    ]);
    setCatLinks((lk ?? []) as CompanyCategoryLink[]);
    if (ticketsError) toast.error(ticketsError.message);
    setRows(t ?? []); setCompanies(c ?? []); setContacts(co ?? []); setCats(ca ?? []); setTechnicians(te ?? []); setPolicies((sla ?? []) as SlaPolicy[]);
  }
  useEffect(() => { void load(); void syncSlaNotifications().catch(() => undefined); }, []);

  const base = useMemo(() => rows.filter(r =>
    JSON.stringify(r).toLowerCase().includes(q.toLowerCase())
    && (!statusFilter || r.status === statusFilter)
    && (!priorityFilter || r.priority === priorityFilter)
    && (!companyFilter || r.company_id === companyFilter)
    && (!technicianFilter || r.assigned_technician_id === technicianFilter)
  ), [rows, q, statusFilter, priorityFilter, companyFilter, technicianFilter]);
  const queues = ticketQueues.filter(qq => !qq.mine || technicianId);
  const activeQueue = queues.find(qq => qq.id === queue) ?? queues[0]!;
  const filtered = useMemo(() => base.filter(r => matchesQueue(activeQueue, r, technicianId)), [base, activeQueue, technicianId]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const contact = contacts.find(x => x.id === f.get("contact_id")); const sub = String(f.get("subcategory_id") || "");
    const { error } = await supabase.from("tickets").insert({ company_id: String(f.get("company_id")), contact_id: String(f.get("contact_id")), requester_phone: contact?.phone || null, category_id: String(f.get("category_id")) || null, subcategory_id: sub || null, subject: String(f.get("subject")), description: String(f.get("description")), priority: String(f.get("priority")) as any, channel: "manual", created_by: user.id } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Chamado aberto."); setOpen(false); setCompany(""); setCategory(""); await load();
  }

  return <Page title="Chamados" description="Fila operacional da equipe técnica: acompanhe SLA, responsáveis e atividade." action={can ? <Button onClick={() => setOpen(true)}><Plus />Novo chamado</Button> : undefined}>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Abrir chamado manual</DialogTitle><DialogDescription>Registre a solicitação inicial do cliente.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="company_id">Empresa / Cliente</Label><select id="company_id" className="form-control" name="company_id" required value={company} onChange={e => { setCompany(e.target.value); setCategory(companyCategoryOptions(cats, catLinks, e.target.value).defaultId); }}><option value="">Selecione</option>{companies.map(x => <option key={x.id} value={x.id}>{x.trade_name}</option>)}</select></div><div><Label htmlFor="contact_id">Contato solicitante</Label><select id="contact_id" key={company} className="form-control" name="contact_id" required><option value="">Selecione</option>{contacts.filter(x => x.company_id === company).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div><div><Label htmlFor="category_id">Categoria</Label><select id="category_id" className="form-control" name="category_id" value={category} onChange={e => setCategory(e.target.value)}><option value="">Selecione</option>{companyCategoryOptions(cats, catLinks, company).options.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div><div><Label htmlFor="subcategory_id">Subcategoria</Label><select id="subcategory_id" key={category} className="form-control" name="subcategory_id" disabled={!category}><option value="">Selecione</option>{cats.filter(x => x.parent_id === category).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div><div className="sm:col-span-2"><Label htmlFor="subject">Assunto</Label><Input id="subject" name="subject" required /></div><div><Label htmlFor="priority">Prioridade</Label><select id="priority" className="form-control" name="priority">{priorities.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div><div><Label htmlFor="channel">Canal</Label><Input id="channel" value="Manual" disabled /></div><div className="sm:col-span-2"><Label htmlFor="description">Descrição</Label><Textarea id="description" name="description" required rows={5} /></div><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button>Abrir chamado</Button></div></form></DialogContent></Dialog>

    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filas de atendimento">
      {queues.map(qq => { const count = base.filter(r => matchesQueue(qq, r, technicianId)).length; return (
        <button key={qq.id} type="button" role="tab" aria-selected={queue === qq.id} onClick={() => setQueue(qq.id)}
          className={cn("flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors", queue === qq.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
          {qq.label}<span className={cn("rounded-full px-1.5 text-xs", queue === qq.id ? "bg-primary text-primary-foreground" : "bg-muted")}>{count}</span>
        </button>); })}
    </div>

    <div className="grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(9rem,.55fr))]"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Pesquisar por número, assunto ou cliente..." value={q} onChange={e => setQ(e.target.value)} /></div><Filter label="Status" value={statusFilter} onChange={setStatusFilter} options={ticketStatuses} /><Filter label="Prioridade" value={priorityFilter} onChange={setPriorityFilter} options={priorities} /><Filter label="Técnico" value={technicianFilter} onChange={setTechnicianFilter} options={technicians.map(x => [x.id, x.name] as const)} /><Filter label="Empresa" value={companyFilter} onChange={setCompanyFilter} options={companies.map(x => [x.id, x.trade_name] as const)} /></div>

    {filtered.length === 0 ? <Empty>Nenhum chamado nesta fila.</Empty> : <div className="overflow-hidden rounded-md border bg-card"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/60 text-left"><tr><th className="px-4 py-3">Número</th><th className="px-4 py-3">Assunto</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Técnico</th><th className="px-4 py-3">Prioridade</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">SLA</th><th className="px-4 py-3">Em aberto</th><th className="px-4 py-3">Última atividade</th></tr></thead><tbody>
      {filtered.map(r => <tr key={r.id} className="border-t hover:bg-muted/30">
        <td className="px-4 py-3"><Link to="/tickets/$ticketId" params={{ ticketId: r.id }} className="font-semibold text-primary hover:underline">{r.number}</Link></td>
        <td className="px-4 py-3">{r.subject}</td>
        <td className="px-4 py-3 text-muted-foreground">{r.companies?.trade_name}</td>
        <td className="px-4 py-3 text-muted-foreground">{r.technicians?.name || "Não atribuído"}</td>
        <td className="px-4 py-3"><StatusBadge value={r.priority} kind="priority" /></td>
        <td className="px-4 py-3"><StatusBadge value={r.status} /></td>
        <td className="px-4 py-3"><SlaBadge sla={computeSla(r, policies)} /></td>
        <td className="px-4 py-3 text-muted-foreground">{formatDuration(r.opened_at, r.resolved_at ? new Date(r.resolved_at).getTime() : Date.now())}</td>
        <td className="px-4 py-3 text-muted-foreground">{formatDate(r.last_activity_at)}<span className="block text-xs">há {formatDuration(r.last_activity_at)}</span></td>
      </tr>)}
    </tbody></table></div></div>}
  </Page>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return <select aria-label={label} className="form-control" value={value} onChange={e => onChange(e.target.value)}><option value="">{label}: todos</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}
