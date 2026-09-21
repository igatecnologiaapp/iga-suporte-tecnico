import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Paperclip, Save, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Page } from "@/components/iga/Page";
import { StatusBadge } from "@/components/iga/StatusBadge";
import { canOperate, formatDate, priorities, statusLabels, ticketTransitions } from "@/lib/iga";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/tickets/$ticketId")({
  head: () => ({ meta: [
    { title: "Detalhes do chamado — IGA Service" },
    { name: "description", content: "Atendimento, anexos e histórico do chamado técnico." },
    { property: "og:title", content: "Detalhes do chamado — IGA Service" },
    { property: "og:description", content: "Atendimento, anexos e histórico do chamado técnico." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}), component: TicketDetail,
});

function TicketDetail() {
  const { ticketId } = Route.useParams(); const { user, role } = Route.useRouteContext(); const canManage = canOperate(role);
  const [ticket, setTicket] = useState<any>(null); const [events, setEvents] = useState<any[]>([]); const [attachments, setAttachments] = useState<any[]>([]); const [technicians, setTechnicians] = useState<any[]>([]); const [busy, setBusy] = useState(false); const [solution, setSolution] = useState(""); const [internalNotes, setInternalNotes] = useState(""); const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  async function load() {
    const [{ data: row, error }, { data: timeline }, { data: files }, { data: techs }] = await Promise.all([
      supabase.from("tickets").select("*,companies(trade_name),contacts(name,email),technicians!tickets_assigned_technician_id_fkey(name),profiles!tickets_acknowledged_by_user_id_fkey(full_name)").eq("id", ticketId).single(),
      supabase.from("ticket_events").select("*,profiles(full_name)").eq("ticket_id", ticketId).order("created_at", { ascending: false }),
      supabase.from("ticket_attachments").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: false }),
      supabase.from("technicians").select("id,name,user_id").eq("status", "active").order("name"),
    ]);
    if (error) toast.error(error.message); setTicket(row); setSolution(row?.solution ?? ""); setInternalNotes(row?.internal_notes ?? ""); setEvents(timeline ?? []); setAttachments(files ?? []); setTechnicians(techs ?? []);
  }
  useEffect(() => { void load(); }, [ticketId]);
  async function update(fields: Record<string, unknown>, success: string) { setBusy(true); const { error } = await supabase.from("tickets").update(fields as never).eq("id", ticketId); setBusy(false); if (error) { toast.error(error.message); return false; } toast.success(success); await load(); return true; }
  async function acknowledge() { await update({ acknowledged_by_user_id: user.id, status: ticket.status === "new" ? "triage" : ticket.status }, "Chamado acolhido."); }
  async function saveText(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); await update({ solution: solution.trim() || null, internal_notes: internalNotes.trim() || null }, "Atendimento registrado."); }
  async function transition(next: string) { if (next === "resolved" && !solution.trim()) { toast.error("Informe a solução antes de resolver o chamado."); return; } if (next === "resolved" || next === "closed") { setPendingStatus(next); return; } await update({ status: next }, "Status atualizado."); }
  async function confirmTransition() { if (!pendingStatus) return; const next = pendingStatus; const fields: Record<string, unknown> = { status: next }; if (next === "resolved") fields["solution"] = solution.trim(); setPendingStatus(null); await update(fields, next === "resolved" ? "Chamado resolvido." : "Chamado encerrado."); }
  async function upload(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; setBusy(true); const path = `${ticketId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const stored = await supabase.storage.from("ticket-attachments").upload(path, file); if (stored.error) { setBusy(false); toast.error(stored.error.message); return; } const meta = await supabase.from("ticket_attachments").insert({ ticket_id: ticketId, storage_path: path, file_name: file.name, mime_type: file.type || null, file_size: file.size, uploaded_by: user.id }); setBusy(false); if (meta.error) { toast.error(meta.error.message); return; } toast.success("Arquivo anexado."); await load(); }
  async function download(path: string, name: string) { const { data, error } = await supabase.storage.from("ticket-attachments").download(path); if (error) { toast.error(error.message); return; } const url=URL.createObjectURL(data); const anchor=document.createElement("a"); anchor.href=url; anchor.download=name; anchor.click(); URL.revokeObjectURL(url); }
  if (!ticket) return <div className="py-20 text-center text-sm text-muted-foreground">Carregando chamado...</div>;
  const allowed = ticketTransitions[ticket.status] ?? [];
  return <Page title={`${ticket.number} — ${ticket.subject}`} description={`${ticket.companies?.trade_name} · aberto em ${formatDate(ticket.opened_at)}`} action={<Button variant="outline" asChild><Link to="/tickets"><ArrowLeft/>Voltar</Link></Button>}>
    <div className="flex flex-wrap gap-2"><StatusBadge value={ticket.priority} kind="priority"/><StatusBadge value={ticket.status}/><span className="rounded-md border px-2.5 py-1 text-xs">Canal: Manual</span></div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <section className="space-y-5"><div className="rounded-md border bg-card p-5"><h2 className="font-semibold">Solicitação</h2><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{ticket.description}</p><dl className="mt-5 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Contato</dt><dd className="font-medium">{ticket.contacts?.name}</dd></div><div><dt className="text-muted-foreground">Telefone</dt><dd className="font-medium">{ticket.requester_phone || "—"}</dd></div><div><dt className="text-muted-foreground">Técnico responsável</dt><dd className="font-medium">{ticket.technicians?.name || "Não atribuído"}</dd></div><div><dt className="text-muted-foreground">Acolhido por</dt><dd className="font-medium">{ticket.profiles?.full_name || "—"}</dd></div><div><dt className="text-muted-foreground">Acolhimento</dt><dd className="font-medium">{formatDate(ticket.acknowledged_at)}</dd></div><div><dt className="text-muted-foreground">Última reabertura</dt><dd className="font-medium">{formatDate(ticket.reopened_at)}</dd></div></dl></div>
      {canManage && <div className="rounded-md border bg-card p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Condução do atendimento</h2>{!ticket.acknowledged_at&&<Button size="sm" onClick={acknowledge} disabled={busy}><UserCheck/>Acolher</Button>}</div><div className="grid gap-4 sm:grid-cols-3"><div><Label>Responsável</Label><select className="form-control" value={ticket.assigned_technician_id??""} onChange={e=>update({assigned_technician_id:e.target.value||null},"Técnico atualizado.")}><option value="">Não atribuído</option>{technicians.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div><Label>Prioridade</Label><select className="form-control" value={ticket.priority} onChange={e=>update({priority:e.target.value},"Prioridade atualizada.")}>{priorities.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div><Label>Próximo status</Label><select className="form-control" value="" onChange={e=>{if(e.target.value)void transition(e.target.value)}} disabled={allowed.length===0}><option value="">Selecione</option>{allowed.map(value=><option key={value} value={value}>{statusLabels[value]}</option>)}</select></div></div><form onSubmit={saveText} className="mt-5 grid gap-4"><div><Label>Solução apresentada</Label><Textarea value={solution} onChange={e=>setSolution(e.target.value)} rows={4}/></div><div><Label>Observações internas</Label><Textarea value={internalNotes} onChange={e=>setInternalNotes(e.target.value)} rows={3}/></div><Button className="justify-self-end" disabled={busy}><Save/>Salvar atendimento</Button></form></div>}
      <div className="rounded-md border bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Anexos</h2>{canManage&&<Label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"><Paperclip className="size-4"/>Anexar<Input className="hidden" type="file" onChange={upload} disabled={busy}/></Label>}</div><div className="mt-4 divide-y">{attachments.length===0?<p className="py-5 text-sm text-muted-foreground">Nenhum arquivo anexado.</p>:attachments.map(a=><div key={a.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{a.file_name}</p><p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p></div><Button size="icon" variant="ghost" onClick={()=>download(a.storage_path,a.file_name)} aria-label="Baixar arquivo"><Download/></Button></div>)}</div></div></section>
      <aside className="rounded-md border bg-card p-5"><h2 className="font-semibold">Timeline</h2><div className="mt-5 space-y-0">{events.map((event,index)=><div key={event.id} className="relative flex gap-3 pb-6"><span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/15"/>{index<events.length-1&&<span className="absolute left-[4px] top-4 h-full w-px bg-border"/>}<div><p className="text-sm font-medium">{eventLabel(event.event_type)}</p><p className="mt-0.5 text-xs text-muted-foreground">{event.note} · {event.profiles?.full_name||"Usuário"}</p>{event.event_type==="resolved"&&event.new_value?.solution&&<p className="mt-2 whitespace-pre-wrap text-sm">{event.new_value.solution}</p>}<time className="mt-1 block text-xs text-muted-foreground">{formatDate(event.created_at)}</time></div></div>)}</div></aside>
    </div>
    <AlertDialog open={pendingStatus!==null} onOpenChange={open=>{if(!open)setPendingStatus(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{pendingStatus==="resolved"?"Resolver chamado?":"Encerrar chamado?"}</AlertDialogTitle><AlertDialogDescription>{pendingStatus==="resolved"?"A solução informada será registrada na timeline.":"O chamado será marcado como encerrado."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={()=>void confirmTransition()}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Page>;
}
function eventLabel(type:string){return ({created:"Criação",acknowledged:"Acolhimento",assignment_changed:"Atribuição",priority_changed:"Prioridade",status_changed:"Status",internal_note:"Nota interna",solution:"Solução",resolved:"Resolução",closed:"Encerramento",reopened:"Reabertura",attachment:"Anexo"} as Record<string,string>)[type]||type;}
