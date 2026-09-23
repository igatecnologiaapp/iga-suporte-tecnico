import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Archive, ArrowLeft, CalendarClock, Download, MessageSquare, Paperclip, Pencil, Save, Trash2, UserCheck, Users } from "lucide-react";

import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Page } from "@/components/iga/Page";
import { StatusBadge } from "@/components/iga/StatusBadge";
import { SlaBadge } from "@/components/iga/SlaBadge";
import { canManageCatalogs, canOperate, channelLabels, conversationStatusLabels, formatDate, formatDuration, priorities, statusLabels, ticketTransitions } from "@/lib/iga";
import { computeSla, type SlaPolicy } from "@/lib/sla";
import { supabase } from "@/integrations/supabase/client";
import { deleteTicket, inspectTicket } from "@/lib/tickets-admin.functions";


export const Route = createFileRoute("/_authenticated/tickets/$ticketId")({
  head: () => ({ meta: [
    { title: "Detalhes do chamado — IGA Service" },
    { name: "description", content: "Atendimento, SLA, agendamento, anexos e histórico do chamado técnico." },
    { property: "og:title", content: "Detalhes do chamado — IGA Service" },
    { property: "og:description", content: "Atendimento, SLA, agendamento, anexos e histórico do chamado técnico." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: TicketDetail,
});

function TicketDetail() {
  const { ticketId } = Route.useParams(); const { user, role } = Route.useRouteContext();
  const canManage = canOperate(role); const canTransfer = canManageCatalogs(role);
  const [ticket, setTicket] = useState<any>(null); const [events, setEvents] = useState<any[]>([]); const [attachments, setAttachments] = useState<any[]>([]); const [technicians, setTechnicians] = useState<any[]>([]); const [schedules, setSchedules] = useState<any[]>([]); const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [busy, setBusy] = useState(false); const [solution, setSolution] = useState(""); const [internalNotes, setInternalNotes] = useState(""); const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false); const [scheduleOpen, setScheduleOpen] = useState(false); const [scheduleGoesToStatus, setScheduleGoesToStatus] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]); const [categories, setCategories] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false); const [editCategory, setEditCategory] = useState(""); const [cancelOpen, setCancelOpen] = useState(false); const [cancelReason, setCancelReason] = useState("");

  async function load() {
    const [{ data: row, error }, { data: timeline }, { data: files }, { data: techs }, { data: sched }, { data: sla }, { data: convos }, { data: cats }] = await Promise.all([
      supabase.from("tickets").select("*,companies(trade_name),contacts(name,email,phone),technicians!tickets_assigned_technician_id_fkey(name),profiles!tickets_acknowledged_by_user_id_fkey(full_name)").eq("id", ticketId).single(),
      supabase.from("ticket_events").select("*,profiles(full_name)").eq("ticket_id", ticketId).order("created_at", { ascending: false }),
      supabase.from("ticket_attachments").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: false }),
      supabase.from("technicians").select("id,name,user_id").eq("status", "active").order("name"),
      supabase.from("ticket_schedules").select("*,technicians(name),profiles(full_name)").eq("ticket_id", ticketId).order("created_at", { ascending: false }),
      supabase.from("sla_policies").select("*"),
      supabase.from("conversations").select("id,phone,status,last_message_at,last_message_preview,unread_count").eq("ticket_id", ticketId).order("last_message_at", { ascending: false }),
      supabase.from("ticket_categories").select("id,name,parent_id").eq("status", "active").order("name"),
    ]);
    if (error) toast.error(error.message);
    setTicket(row); setSolution(row?.solution ?? ""); setInternalNotes(row?.internal_notes ?? ""); setEditCategory(row?.category_id ?? "");
    setEvents(timeline ?? []); setAttachments(files ?? []); setTechnicians(techs ?? []); setSchedules(sched ?? []); setPolicies((sla ?? []) as SlaPolicy[]);
    setConversations(convos ?? []); setCategories(cats ?? []);
  }
  useEffect(() => { void load(); }, [ticketId]);

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    const ok = await update({
      subject: String(f.get("subject") || "").trim(),
      description: String(f.get("description") || "").trim(),
      category_id: String(f.get("category_id") || "") || null,
      subcategory_id: String(f.get("subcategory_id") || "") || null,
      requester_phone: String(f.get("requester_phone") || "").trim() || null,
    }, "Chamado atualizado.");
    if (ok) setEditOpen(false);
  }
  async function submitCancel() {
    if (!cancelReason.trim()) { toast.error("Informe o motivo do cancelamento/arquivamento."); return; }
    const ok = await update({ status: "cancelled", cancel_reason: cancelReason.trim() }, "Chamado cancelado/arquivado.");
    if (ok) { setCancelOpen(false); setCancelReason(""); }
  }

  async function update(fields: Record<string, unknown>, success: string) {
    setBusy(true); const { error } = await supabase.from("tickets").update(fields as never).eq("id", ticketId); setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(success); await load(); return true;
  }
  async function acknowledge() { await update({ acknowledged_by_user_id: user.id, status: ticket.status === "new" ? "triage" : ticket.status }, "Chamado acolhido."); }
  async function saveText(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); await update({ solution: solution.trim() || null, internal_notes: internalNotes.trim() || null }, "Atendimento registrado."); }
  async function transition(next: string) {
    if (next === "scheduled") { setScheduleGoesToStatus(true); setScheduleOpen(true); return; }
    if (next === "resolved" && !solution.trim()) { toast.error("Informe a solução antes de resolver o chamado."); return; }
    if (next === "resolved" || next === "closed") { setPendingStatus(next); return; }
    await update({ status: next }, "Status atualizado.");
  }
  async function confirmTransition() { if (!pendingStatus) return; const next = pendingStatus; const fields: Record<string, unknown> = { status: next }; if (next === "resolved") fields["solution"] = solution.trim(); setPendingStatus(null); await update(fields, next === "resolved" ? "Chamado resolvido." : "Chamado encerrado."); }
  async function submitTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); const next = String(f.get("technician_id") || "");
    if (!next) { toast.error("Selecione o novo técnico."); return; }
    if (next === ticket.assigned_technician_id) { toast.error("Selecione um técnico diferente do atual."); return; }
    const ok = await update({ assigned_technician_id: next, transfer_reason: String(f.get("reason") || "").trim() || null }, "Chamado transferido.");
    if (ok) setTransferOpen(false);
  }
  async function submitSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); const date = String(f.get("date") || ""); const time = String(f.get("time") || "");
    if (!date || !time) { toast.error("Informe data e hora do agendamento."); return; }
    const fields: Record<string, unknown> = { scheduled_at: new Date(`${date}T${time}`).toISOString(), scheduled_note: String(f.get("note") || "").trim() || null };
    const tech = String(f.get("technician_id") || ""); if (tech) fields["assigned_technician_id"] = tech;
    if (scheduleGoesToStatus) fields["status"] = "scheduled";
    const ok = await update(fields, scheduleGoesToStatus || !ticket.scheduled_at ? "Atendimento agendado." : "Atendimento reagendado.");
    if (ok) { setScheduleOpen(false); setScheduleGoesToStatus(false); }
  }
  async function upload(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; setBusy(true); const path = `${ticketId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const stored = await supabase.storage.from("ticket-attachments").upload(path, file); if (stored.error) { setBusy(false); toast.error(stored.error.message); return; } const meta = await supabase.from("ticket_attachments").insert({ ticket_id: ticketId, storage_path: path, file_name: file.name, mime_type: file.type || null, file_size: file.size, uploaded_by: user.id }); setBusy(false); if (meta.error) { toast.error(meta.error.message); return; } toast.success("Arquivo anexado."); await load(); }
  async function download(path: string, name: string) { const { data, error } = await supabase.storage.from("ticket-attachments").download(path); if (error) { toast.error(error.message); return; } const url = URL.createObjectURL(data); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }

  if (!ticket) return <div className="py-20 text-center text-sm text-muted-foreground">Carregando chamado...</div>;
  const allowed = ticketTransitions[ticket.status] ?? [];
  const sla = computeSla(ticket, policies);

  return <Page title={`${ticket.number} — ${ticket.subject}`} description={`${ticket.companies?.trade_name} · aberto em ${formatDate(ticket.opened_at)}`} action={<Button variant="outline" asChild><Link to="/tickets"><ArrowLeft />Voltar</Link></Button>}>
    <div className="grid gap-4 rounded-md border bg-card p-5 sm:grid-cols-2 xl:grid-cols-4">
      <Summary label="Empresa">{ticket.companies?.trade_name}</Summary>
      <Summary label="Contato">{ticket.contacts?.name}{ticket.contacts?.phone ? <span className="block text-xs text-muted-foreground">{ticket.contacts.phone}</span> : null}</Summary>
      <Summary label="Status"><StatusBadge value={ticket.status} /></Summary>
      <Summary label="Prioridade"><StatusBadge value={ticket.priority} kind="priority" /></Summary>
      <Summary label="Técnico responsável">{ticket.technicians?.name || "Não atribuído"}</Summary>
      <Summary label="SLA"><SlaBadge sla={sla} /><span className="mt-1 block text-xs text-muted-foreground">{sla.detail}</span></Summary>
      <Summary label="Tempo em aberto">{formatDuration(ticket.opened_at, ticket.resolved_at ? new Date(ticket.resolved_at).getTime() : Date.now())}<span className="mt-1 block text-xs text-muted-foreground">Última atividade há {formatDuration(ticket.last_activity_at)}</span></Summary>
      <Summary label="Agendamento">{ticket.scheduled_at ? <>{formatDate(ticket.scheduled_at)}{ticket.scheduled_note ? <span className="block text-xs text-muted-foreground">{ticket.scheduled_note}</span> : null}</> : "—"}</Summary>
    </div>

    {canManage && <div className="flex flex-wrap gap-2">
      {!ticket.acknowledged_at && <Button size="sm" onClick={acknowledge} disabled={busy}><UserCheck />Acolher</Button>}
      {canTransfer && <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)} disabled={busy || !ticket.assigned_technician_id}><Users />Transferir</Button>}
      <Button size="sm" variant="outline" onClick={() => { setScheduleGoesToStatus(false); setScheduleOpen(true); }} disabled={busy}><CalendarClock />{ticket.scheduled_at ? "Reagendar" : "Agendar"}</Button>
      {canTransfer && <Button size="sm" variant="outline" onClick={() => { setEditCategory(ticket.category_id ?? ""); setEditOpen(true); }} disabled={busy}><Pencil />Editar chamado</Button>}
      {canTransfer && ticket.status !== "cancelled" && <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} disabled={busy}><Archive />Cancelar / Arquivar</Button>}
    </div>}

    {conversations.length > 0 && <div className="rounded-md border bg-card p-5"><h2 className="flex items-center gap-2 font-semibold"><MessageSquare className="size-4" />Conversas vinculadas</h2><div className="mt-4 divide-y">{conversations.map(conversation => <div key={conversation.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="font-medium">{conversation.phone} · {conversationStatusLabels[conversation.status]}</p><p className="truncate text-xs text-muted-foreground">{conversation.last_message_preview || "Sem mensagens"} · {formatDate(conversation.last_message_at)}</p></div><Button size="sm" variant="outline" asChild><Link to="/inbox">Abrir na Caixa de Entrada</Link></Button></div>)}</div></div>}

    {ticket.cancel_reason && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"><b>Motivo do cancelamento/arquivamento:</b> {ticket.cancel_reason}</div>}

    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <section className="space-y-5">
        <div className="rounded-md border bg-card p-5"><h2 className="font-semibold">Solicitação</h2><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{ticket.description}</p><dl className="mt-5 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Canal</dt><dd className="font-medium">{channelLabels[ticket.channel] ?? ticket.channel}</dd></div><div><dt className="text-muted-foreground">Telefone</dt><dd className="font-medium">{ticket.requester_phone || "—"}</dd></div><div><dt className="text-muted-foreground">Acolhido por</dt><dd className="font-medium">{ticket.profiles?.full_name || "—"}</dd></div><div><dt className="text-muted-foreground">Acolhimento</dt><dd className="font-medium">{formatDate(ticket.acknowledged_at)}</dd></div><div><dt className="text-muted-foreground">1ª resposta</dt><dd className="font-medium">{formatDate(ticket.first_response_at)}</dd></div><div><dt className="text-muted-foreground">Última reabertura</dt><dd className="font-medium">{formatDate(ticket.reopened_at)}</dd></div></dl></div>

        {canManage && <div className="rounded-md border bg-card p-5"><h2 className="mb-4 font-semibold">Condução do atendimento</h2><div className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="assigned-technician">Responsável</Label><select id="assigned-technician" className="form-control" value={ticket.assigned_technician_id ?? ""} onChange={e => update({ assigned_technician_id: e.target.value || null }, "Técnico atualizado.")}><option value="">Não atribuído</option>{technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div><Label htmlFor="ticket-priority">Prioridade</Label><select id="ticket-priority" className="form-control" value={ticket.priority} onChange={e => update({ priority: e.target.value }, "Prioridade atualizada.")}>{priorities.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div><div><Label htmlFor="next-status">Próximo status</Label><select id="next-status" className="form-control" value="" onChange={e => { if (e.target.value) void transition(e.target.value); }} disabled={allowed.length === 0}><option value="">Selecione</option>{allowed.map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></div></div><form onSubmit={saveText} className="mt-5 grid gap-4"><div><Label htmlFor="ticket-solution">Solução apresentada</Label><Textarea id="ticket-solution" value={solution} onChange={e => setSolution(e.target.value)} rows={4} /></div><div><Label htmlFor="ticket-notes">Observações internas</Label><Textarea id="ticket-notes" value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={3} /></div><Button className="justify-self-end" disabled={busy}><Save />Salvar atendimento</Button></form></div>}

        {schedules.length > 0 && <div className="rounded-md border bg-card p-5"><h2 className="font-semibold">Histórico de agendamentos</h2><div className="mt-4 divide-y">{schedules.map(s => <div key={s.id} className="py-3 text-sm"><p className="font-medium">{formatDate(s.scheduled_at)}{s.technicians?.name ? ` · ${s.technicians.name}` : ""}</p><p className="text-xs text-muted-foreground">{s.note || "Sem observação"} · registrado por {s.profiles?.full_name || "Usuário"} em {formatDate(s.created_at)}</p></div>)}</div></div>}

        <div className="rounded-md border bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Anexos</h2>{canManage && <Label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"><Paperclip className="size-4" />Anexar<Input className="hidden" type="file" onChange={upload} disabled={busy} /></Label>}</div><div className="mt-4 divide-y">{attachments.length === 0 ? <p className="py-5 text-sm text-muted-foreground">Nenhum arquivo anexado.</p> : attachments.map(a => <div key={a.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{a.file_name}</p><p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p></div><Button size="icon" variant="ghost" onClick={() => download(a.storage_path, a.file_name)} aria-label="Baixar arquivo"><Download /></Button></div>)}</div></div>
      </section>

      <aside className="rounded-md border bg-card p-5"><h2 className="font-semibold">Timeline</h2><div className="mt-5 space-y-0">{events.map((event, index) => <div key={event.id} className="relative flex gap-3 pb-6"><span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/15" />{index < events.length - 1 && <span className="absolute left-[4px] top-4 h-full w-px bg-border" />}<div><p className="text-sm font-medium">{eventLabel(event.event_type)}</p><p className="mt-0.5 text-xs text-muted-foreground">{event.note} · {event.profiles?.full_name || "Usuário"}</p>{event.event_type === "resolved" && event.new_value?.solution && <p className="mt-2 whitespace-pre-wrap text-sm">{event.new_value.solution}</p>}<time className="mt-1 block text-xs text-muted-foreground">{formatDate(event.created_at)}</time></div></div>)}</div></aside>
    </div>

    <Dialog open={transferOpen} onOpenChange={setTransferOpen}><DialogContent><DialogHeader><DialogTitle>Transferir chamado</DialogTitle><DialogDescription>O técnico anterior, o novo técnico, o responsável pela transferência e o motivo ficam registrados na timeline.</DialogDescription></DialogHeader><form onSubmit={submitTransfer} className="grid gap-4"><div><Label htmlFor="transfer-current">Técnico atual</Label><Input id="transfer-current" value={ticket.technicians?.name || "Não atribuído"} disabled /></div><div><Label htmlFor="transfer-technician">Novo técnico</Label><select id="transfer-technician" name="technician_id" className="form-control" required><option value="">Selecione</option>{technicians.filter(t => t.id !== ticket.assigned_technician_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div><Label htmlFor="transfer-reason">Motivo (opcional)</Label><Textarea id="transfer-reason" name="reason" rows={3} /></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>Cancelar</Button><Button disabled={busy}>Transferir</Button></div></form></DialogContent></Dialog>

    <Dialog open={scheduleOpen} onOpenChange={open => { setScheduleOpen(open); if (!open) setScheduleGoesToStatus(false); }}><DialogContent><DialogHeader><DialogTitle>{ticket.scheduled_at ? "Reagendar atendimento" : "Agendar atendimento"}</DialogTitle><DialogDescription>O agendamento aparece no chamado e fica registrado na timeline; os anteriores são preservados.</DialogDescription></DialogHeader><form onSubmit={submitSchedule} className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="schedule-date">Data</Label><Input id="schedule-date" name="date" type="date" required /></div><div><Label htmlFor="schedule-time">Hora</Label><Input id="schedule-time" name="time" type="time" required /></div><div className="sm:col-span-2"><Label htmlFor="schedule-technician">Técnico responsável</Label><select id="schedule-technician" name="technician_id" className="form-control" defaultValue={ticket.assigned_technician_id ?? ""}><option value="">Manter atual</option>{technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div className="sm:col-span-2"><Label htmlFor="schedule-note">Observação</Label><Textarea id="schedule-note" name="note" rows={3} /></div><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setScheduleOpen(false)}>Cancelar</Button><Button disabled={busy}>Salvar agendamento</Button></div></form></DialogContent></Dialog>

    <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Editar chamado</DialogTitle><DialogDescription>Cada alteração fica registrada na timeline com valor anterior, novo valor, usuário e data/hora.</DialogDescription></DialogHeader>
      <form onSubmit={submitEdit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="edit-subject">Assunto</Label><Input id="edit-subject" name="subject" required defaultValue={ticket.subject} /></div>
        <div><Label htmlFor="edit-category">Categoria</Label><select id="edit-category" name="category_id" className="form-control" value={editCategory} onChange={e => setEditCategory(e.target.value)}><option value="">Selecione</option>{categories.filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><Label htmlFor="edit-subcategory">Subcategoria</Label><select id="edit-subcategory" name="subcategory_id" className="form-control" defaultValue={ticket.subcategory_id ?? ""} disabled={!editCategory}><option value="">Selecione</option>{categories.filter(c => c.parent_id === editCategory).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><Label htmlFor="edit-phone">Telefone do solicitante</Label><Input id="edit-phone" name="requester_phone" defaultValue={ticket.requester_phone ?? ""} /></div>
        <div className="sm:col-span-2"><Label htmlFor="edit-description">Descrição</Label><Textarea id="edit-description" name="description" rows={5} required defaultValue={ticket.description} /></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button><Button disabled={busy}>Salvar alterações</Button></div>
      </form></DialogContent></Dialog>

    <Dialog open={cancelOpen} onOpenChange={open => { setCancelOpen(open); if (!open) setCancelReason(""); }}><DialogContent><DialogHeader><DialogTitle>Cancelar / arquivar chamado {ticket.number}?</DialogTitle><DialogDescription>O chamado sai da operação, mas timeline, mensagens, anexos, soluções, SLA e responsáveis são preservados. Informe o motivo.</DialogDescription></DialogHeader>
      <div><Label htmlFor="cancel-reason">Motivo</Label><Textarea id="cancel-reason" rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} /></div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCancelOpen(false)}>Voltar</Button><Button disabled={busy || !cancelReason.trim()} onClick={() => void submitCancel()}>Confirmar</Button></div>
    </DialogContent></Dialog>

    <AlertDialog open={pendingStatus !== null} onOpenChange={open => { if (!open) setPendingStatus(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{pendingStatus === "resolved" ? "Resolver chamado?" : "Encerrar chamado?"}</AlertDialogTitle><AlertDialogDescription>{pendingStatus === "resolved" ? "A solução informada será registrada na timeline." : "O chamado será marcado como encerrado."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => void confirmTransition()}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Page>;
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><div className="mt-1 text-sm font-medium">{children}</div></div>;
}
function eventLabel(type: string) {
  return ({ created: "Criação", acknowledged: "Acolhimento", assignment_changed: "Atribuição", transferred: "Transferência", scheduled: "Agendamento", rescheduled: "Reagendamento", priority_changed: "Prioridade", status_changed: "Status", internal_note: "Nota interna", solution: "Solução", resolved: "Resolução", closed: "Encerramento", reopened: "Reabertura", attachment: "Anexo", field_changed: "Alteração de dados", cancelled: "Cancelamento/arquivamento" } as Record<string, string>)[type] || type;
}
