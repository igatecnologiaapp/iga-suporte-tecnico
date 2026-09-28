import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Inbox, Link2, MessageSquarePlus, Plus, RefreshCw, Search, Send, TicketPlus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Empty, Page } from "@/components/iga/Page";
import { supabase } from "@/integrations/supabase/client";
import { canManageCatalogs, canOperate, conversationStatusLabels, errorMessage, formatDate, messageTypeLabels, priorities } from "@/lib/iga";
import { retryMessageMedia } from "@/lib/whatsapp.functions";
import { createTicketFromConversation, startConversation, identifyConversationContact, linkConversationToTicket, markConversationRead, sendConversationReply, setConversationStatus, simulateInboundMessage } from "@/lib/messaging.functions";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [
    { title: "Caixa de Entrada — IGA Service" },
    { name: "description", content: "Conversas recebidas, identificação do cliente e abertura de chamados no IGA Service." },
    { property: "og:title", content: "Caixa de Entrada — IGA Service" },
    { property: "og:description", content: "Conversas recebidas, identificação do cliente e abertura de chamados no IGA Service." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: InboxPage,
});

const statusFilters = [["all", "Todas"], ["new", "Novas"], ["triage", "Em triagem"], ["linked", "Vinculadas a chamado"], ["finished", "Finalizadas"]] as const;

function InboxPage() {
  const { role } = Route.useRouteContext();
  const canOperateInbox = canOperate(role);
  const canSimulate = canManageCatalogs(role);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [openTickets, setOpenTickets] = useState<any[]>([]);
  const [identifyOpen, setIdentifyOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newPhone, setNewPhone] = useState("");

  async function loadConversations() {
    const [{ data, error }, { data: contactRows }, { data: companyRows }, { data: categoryRows }, { data: ticketRows }] = await Promise.all([
      supabase.from("conversations").select("*,contacts(name),companies(trade_name),tickets(number,status)").order("last_message_at", { ascending: false }),
      supabase.from("contacts").select("id,name,phone,whatsapp,company_id,companies(trade_name)").eq("status", "active").order("name"),
      supabase.from("companies").select("id,trade_name").eq("status", "active").order("trade_name"),
      supabase.from("ticket_categories").select("id,name,parent_id").eq("status", "active").order("name"),
      supabase.from("tickets").select("id,number,subject,status").not("status", "in", "(closed,cancelled,duplicate)").order("opened_at", { ascending: false }),
    ]);
    if (error) { toast.error(error.message); return; }
    setConversations(data ?? []); setContacts(contactRows ?? []); setCompanies(companyRows ?? []); setCategories(categoryRows ?? []); setOpenTickets(ticketRows ?? []);
  }
  useEffect(() => { void loadConversations(); }, []);

  async function loadMessages(conversationId: string) {
    const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("sent_at");
    if (error) { toast.error(error.message); return; }
    if (selectedRef.current !== conversationId) return;
    setMessages(data ?? []);
  }
  async function select(conversationId: string) {
    setSelected(conversationId); selectedRef.current = conversationId; setReply(""); await loadMessages(conversationId);
    if (canOperateInbox) { try { await markConversationRead({ data: { conversationId } }); await loadConversations(); } catch { /* leitura opcional */ } }
  }

  // Atualização automática leve: apenas conversas e mensagens da conversa aberta, sem recarregar a página.
  const selectedRef = useRef<string | null>(null);
  const pollingRef = useRef(false);
  useEffect(() => {
    async function poll() {
      if (pollingRef.current || document.visibilityState !== "visible") return;
      pollingRef.current = true;
      try {
        const { data } = await supabase.from("conversations").select("*,contacts(name),companies(trade_name),tickets(number,status)").order("last_message_at", { ascending: false });
        if (data) setConversations(data);
        const open = selectedRef.current;
        if (open) {
          await loadMessages(open);
          const row = data?.find(r => r.id === open);
          if (row && row.unread_count > 0 && canOperateInbox) { try { await markConversationRead({ data: { conversationId: open } }); } catch { /* opcional */ } }
        }
      } finally { pollingRef.current = false; }
    }
    const id = window.setInterval(() => void poll(), 60000);
    const onVisible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  async function sendReply() {
    const conversationId = selectedRef.current;
    const content = reply.trim();
    if (!conversationId || !content || sendingRef.current) return;
    sendingRef.current = true; setSending(true);
    try {
      const result = await sendConversationReply({ data: { conversationId, content } });
      if (!result.ok) { toast.error(result.error); return; }
      const sent = result.message;
      setMessages(prev => prev.some(m => m.id === sent.id) ? prev : [...prev, sent]);
      setReply("");
      toast.success("Mensagem enviada.");
      void loadConversations();
    } catch (error) { toast.error(errorMessage(error)); }
    finally { sendingRef.current = false; setSending(false); }
  }

  const filtered = useMemo(() => conversations.filter(row => {
    if (filter !== "all" && row.status !== filter) return false;
    if (!q.trim()) return true;
    const haystack = `${row.phone} ${row.contacts?.name ?? ""} ${row.companies?.trade_name ?? ""} ${row.last_message_preview ?? ""} ${row.tickets?.number ?? ""}`.toLowerCase();
    return haystack.includes(q.trim().toLowerCase());
  }), [conversations, filter, q]);
  const current = conversations.find(row => row.id === selected) ?? null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); await loadConversations(); if (selected) await loadMessages(selected); }
    catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function submitIdentify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    const contactId = String(f.get("contact_id") || ""); const name = String(f.get("new_name") || "").trim(); const companyId = String(f.get("company_id") || "");
    await run(async () => {
      if (contactId) await identifyConversationContact({ data: { conversationId: current.id, contactId } });
      else if (name && companyId) await identifyConversationContact({ data: { conversationId: current.id, newContact: { name, companyId, phone: current.phone } } });
      else throw new Error("Selecione um contato existente ou informe nome e empresa do novo contato.");
      toast.success("Contato identificado."); setIdentifyOpen(false);
    });
  }
  async function submitTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    await run(async () => {
      const result = await createTicketFromConversation({ data: {
        conversationId: current.id,
        subject: String(f.get("subject") || ""),
        description: String(f.get("description") || ""),
        priority: String(f.get("priority") || "normal"),
        categoryId: String(f.get("category_id") || "") || null,
        subcategoryId: String(f.get("subcategory_id") || "") || null,
      } });
      toast.success(`Chamado ${result.number} criado a partir da conversa.`); setTicketOpen(false);
    });
  }
  async function submitLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    await run(async () => {
      const result = await linkConversationToTicket({ data: { conversationId: current.id, ticketId: String(f.get("ticket_id") || "") } });
      toast.success(`Conversa vinculada ao chamado ${result.number}.`); setLinkOpen(false);
    });
  }
  async function submitSimulation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    await run(async () => {
      const result = await simulateInboundMessage({ data: {
        phone: String(f.get("phone") || ""), content: String(f.get("content") || ""),
        messageType: String(f.get("message_type") || "text"), displayName: String(f.get("display_name") || "") || null,
      } });
      toast.success(result.identified ? "Mensagem recebida — contato identificado." : "Mensagem recebida — contato não identificado.");
      setSimulateOpen(false); await select(result.conversationId);
    });
  }

  const unreadTotal = conversations.reduce((total, row) => total + (row.unread_count ?? 0), 0);

  return <Page title="Caixa de Entrada" description="Conversas recebidas, identificação do cliente e vínculo com chamados." action={canOperateInbox || canSimulate ? <div className="flex gap-2">{canOperateInbox && <Button onClick={() => { setNewCompany(""); setNewContact(""); setNewPhone(""); setNewOpen(true); }}><Plus />Nova conversa</Button>}{canSimulate && <Button variant="outline" onClick={() => setSimulateOpen(true)}><MessageSquarePlus />Simular mensagem</Button>}</div> : undefined}>
    <div className="flex flex-wrap items-center gap-2">
      {statusFilters.map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>{label}</Button>)}
      <span className="ml-auto text-xs text-muted-foreground">{unreadTotal} mensagem(ns) não lida(s)</span>
    </div>
    <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Pesquisar por telefone, contato, empresa ou chamado..." value={q} onChange={e => setQ(e.target.value)} /></div>

    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="overflow-hidden rounded-md border bg-card">
        {filtered.length === 0 ? <Empty>Nenhuma conversa encontrada.</Empty> : <div className="divide-y">{filtered.map(row => <button key={row.id} onClick={() => void select(row.id)} className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 ${selected === row.id ? "bg-muted" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.contacts?.name || row.display_name || "Contato não identificado"}</p>
              <p className="truncate text-xs text-muted-foreground">{row.companies?.trade_name || "Empresa não identificada"} · {row.phone}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{row.last_message_preview || "Sem mensagens"}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">{formatDate(row.last_message_at)}</p>
              <p className="mt-1 text-xs font-medium">{conversationStatusLabels[row.status]}</p>
              {row.tickets?.number && <p className="text-xs text-muted-foreground">{row.tickets.number}</p>}
              {row.unread_count > 0 && <span className="mt-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{row.unread_count}</span>}
            </div>
          </div>
        </button>)}</div>}
      </div>

      <div className="rounded-md border bg-card p-5">
        {!current ? <div className="grid h-full place-items-center py-16 text-center text-sm text-muted-foreground"><div><Inbox className="mx-auto mb-3 size-8" />Selecione uma conversa para ver as mensagens.</div></div> : <>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
            <div>
              <h2 className="font-semibold">{current.contacts?.name || current.display_name || "Contato não identificado"}</h2>
              <p className="text-xs text-muted-foreground">{current.companies?.trade_name || "Empresa não identificada"} · {current.phone} · {conversationStatusLabels[current.status]}</p>
              {current.ticket_id && <p className="mt-1 text-xs"><Link to="/tickets/$ticketId" params={{ ticketId: current.ticket_id }} className="font-medium underline">Chamado {current.tickets?.number}</Link></p>}
            </div>
            {canOperateInbox && <div className="flex flex-wrap gap-2">
              {!current.contact_id && <Button size="sm" variant="outline" onClick={() => setIdentifyOpen(true)}><UserPlus />Identificar contato</Button>}
              {!current.ticket_id && <Button size="sm" onClick={() => { setCategory(""); setTicketOpen(true); }} disabled={!current.contact_id}><TicketPlus />Criar chamado</Button>}
              {!current.ticket_id && <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}><Link2 />Vincular a chamado</Button>}
              {current.status !== "finished" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(async () => { await setConversationStatus({ data: { conversationId: current.id, status: "finished" } }); toast.success("Conversa finalizada."); })}>Finalizar</Button>}
            </div>}
          </div>
          <div className="mt-4 space-y-3">
            {messages.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</p> : messages.map(message => <div key={message.id} className={`max-w-[85%] rounded-md border p-3 text-sm ${message.direction === "inbound" ? "bg-muted/60" : "ml-auto bg-primary/10"}`}>
              <p className="whitespace-pre-wrap">{message.content || `[${messageTypeLabels[message.message_type] ?? message.message_type}]`}</p>
              {message.attachment_path && <MediaView path={message.attachment_path} mime={message.attachment_mime} type={message.message_type} name={message.attachment_name} />}
              {message.processing_status === "media_pending" && <p className="mt-1 text-xs text-muted-foreground">Mídia em processamento…</p>}
              {["media_failed", "media_pending"].includes(message.processing_status) && message.media_id && <div className="mt-1 flex flex-wrap items-center gap-2">{message.processing_status === "media_failed" && <p className="text-xs text-destructive">Falha ao obter a mídia.</p>}{canOperateInbox && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { const r = await retryMessageMedia({ data: { messageId: message.id } }); if (r.ok) toast.success("Mídia obtida."); else toast.error("Não foi possível obter a mídia. Tente novamente mais tarde."); await loadMessages(message.conversation_id); })}><RefreshCw />Reprocessar mídia</Button>}</div>}
              <p className="mt-1 text-xs text-muted-foreground">{message.direction === "inbound" ? "Recebida" : "Enviada"} · {messageTypeLabels[message.message_type] ?? message.message_type} · {formatDate(message.sent_at)}</p>
            </div>)}
          </div>
          {canOperateInbox && current.channel === "whatsapp" && (() => {
            const lastIn = [...messages].reverse().find(m => m.direction === "inbound");
            const simulated = String(lastIn?.external_id ?? "").startsWith("sim:");
            const inWindow = lastIn && Date.now() - new Date(lastIn.sent_at).getTime() <= 24 * 60 * 60 * 1000;
            if (!inWindow || simulated) return <p className="mt-4 rounded-md border border-dashed p-3 text-xs text-muted-foreground">{simulated ? "Conversa simulada: resposta real indisponível." : lastIn ? "Fora da janela de 24 horas do WhatsApp. Para retomar o contato é necessário um modelo (template) aprovado — ainda não disponível no sistema." : "Nenhuma mensagem recebida deste cliente nas últimas 24 horas. O primeiro contato iniciado pela empresa exige um modelo (template) aprovado — seleção de modelos será disponibilizada em etapa futura."}</p>;
            return <form className="mt-4 grid gap-2 border-t pt-4" onSubmit={e => { e.preventDefault(); void sendReply(); }}>
              <Label htmlFor="conversation-reply">Responder pelo WhatsApp</Label>
              <Textarea id="conversation-reply" rows={3} maxLength={4096} value={reply} disabled={sending} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); } }} placeholder="Digite a resposta ao cliente..." />
              <div className="flex justify-end"><Button type="submit" disabled={sending || !reply.trim()}><Send />{sending ? "Enviando..." : "Enviar"}</Button></div>
            </form>;
          })()}
        </>}
      </div>
    </div>

    <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogContent><DialogHeader><DialogTitle>Nova conversa</DialogTitle><DialogDescription>Inicie contato pelo WhatsApp com um contato cadastrado. Nenhum chamado é criado automaticamente.</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); if (!newContact || !newPhone) return; void run(async () => { const r = await startConversation({ data: { contactId: newContact, phone: newPhone } }); setNewOpen(false); toast.success(r.existing ? "Já existe conversa aberta com este telefone — ela foi selecionada." : "Conversa criada."); await loadConversations(); await select(r.conversationId); }); }}>
        <div><Label htmlFor="new-conv-company">Empresa / Cliente</Label><select id="new-conv-company" className="form-control" value={newCompany} onChange={e => { setNewCompany(e.target.value); setNewContact(""); setNewPhone(""); }}><option value="">Selecione</option>{companies.map(c => <option key={c.id} value={c.id}>{c.trade_name}</option>)}</select></div>
        <div><Label htmlFor="new-conv-contact">Contato</Label><select id="new-conv-contact" className="form-control" value={newContact} disabled={!newCompany} onChange={e => { setNewContact(e.target.value); const c = contacts.find(x => x.id === e.target.value); setNewPhone(c?.whatsapp || c?.phone || ""); }}><option value="">Selecione</option>{contacts.filter(c => c.company_id === newCompany).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><Label htmlFor="new-conv-phone">Telefone WhatsApp</Label><select id="new-conv-phone" className="form-control" value={newPhone} disabled={!newContact} onChange={e => setNewPhone(e.target.value)}><option value="">Selecione</option>{(() => { const c = contacts.find(x => x.id === newContact); return [...new Set([c?.whatsapp, c?.phone].filter(Boolean))].map(p => <option key={p} value={p}>{p}{p === c?.whatsapp ? " (WhatsApp)" : ""}</option>); })()}</select>{newContact && !contacts.find(x => x.id === newContact)?.whatsapp && !contacts.find(x => x.id === newContact)?.phone && <p className="mt-1 text-xs text-destructive">Contato sem telefone cadastrado.</p>}</div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button><Button disabled={busy || !newContact || !newPhone}>Iniciar conversa</Button></div>
      </form></DialogContent></Dialog>

    {current && <>
      <Dialog open={identifyOpen} onOpenChange={setIdentifyOpen}><DialogContent><DialogHeader><DialogTitle>Identificar contato</DialogTitle><DialogDescription>Vincule a conversa a um contato existente ou cadastre um novo contato para {current.phone}. Empresas não são criadas automaticamente.</DialogDescription></DialogHeader>
        <form onSubmit={submitIdentify} className="grid gap-4">
          <div><Label htmlFor="conversation-contact">Contato existente</Label><select id="conversation-contact" name="contact_id" className="form-control" defaultValue=""><option value="">Selecione</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name} — {c.companies?.trade_name}</option>)}</select></div>
          <div className="rounded-md border p-3"><p className="mb-3 text-sm font-medium">Ou cadastrar novo contato</p><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="conversation-new-name">Nome</Label><Input id="conversation-new-name" name="new_name" /></div><div><Label htmlFor="conversation-company">Empresa / Cliente</Label><select id="conversation-company" name="company_id" className="form-control" defaultValue=""><option value="">Selecione</option>{companies.map(c => <option key={c.id} value={c.id}>{c.trade_name}</option>)}</select></div></div></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIdentifyOpen(false)}>Cancelar</Button><Button disabled={busy}>Salvar</Button></div>
        </form></DialogContent></Dialog>

      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Criar chamado da conversa</DialogTitle><DialogDescription>Empresa, contato, telefone e canal WhatsApp são preenchidos automaticamente.</DialogDescription></DialogHeader>
        <form onSubmit={submitTicket} className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="conversation-ticket-company">Empresa</Label><Input id="conversation-ticket-company" value={current.companies?.trade_name ?? ""} disabled /></div>
          <div><Label htmlFor="conversation-ticket-contact">Contato</Label><Input id="conversation-ticket-contact" value={current.contacts?.name ?? ""} disabled /></div>
          <div><Label htmlFor="conversation-ticket-category">Categoria</Label><select id="conversation-ticket-category" name="category_id" className="form-control" value={category} onChange={e => setCategory(e.target.value)}><option value="">Selecione</option>{categories.filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><Label htmlFor="conversation-ticket-subcategory">Subcategoria</Label><select id="conversation-ticket-subcategory" name="subcategory_id" className="form-control" disabled={!category}><option value="">Selecione</option>{categories.filter(c => c.parent_id === category).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="sm:col-span-2"><Label htmlFor="conversation-ticket-subject">Assunto</Label><Input id="conversation-ticket-subject" name="subject" required defaultValue={(current.last_message_preview ?? "").slice(0, 80)} /></div>
          <div className="sm:col-span-2"><Label htmlFor="conversation-ticket-description">Descrição</Label><Textarea id="conversation-ticket-description" name="description" rows={5} required defaultValue={messages.filter(m => m.direction === "inbound").map(m => `${formatDate(m.sent_at)}: ${m.content ?? `[${m.message_type}]`}`).join("\n")} /></div>
          <div><Label htmlFor="conversation-ticket-priority">Prioridade</Label><select id="conversation-ticket-priority" name="priority" className="form-control" defaultValue="normal">{priorities.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="flex items-end justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setTicketOpen(false)}>Cancelar</Button><Button disabled={busy}><Send />Criar chamado</Button></div>
        </form></DialogContent></Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}><DialogContent><DialogHeader><DialogTitle>Vincular a chamado existente</DialogTitle><DialogDescription>As mensagens permanecem na conversa; o chamado apenas registra o vínculo.</DialogDescription></DialogHeader>
        <form onSubmit={submitLink} className="grid gap-4">
          <div><Label htmlFor="conversation-ticket-id">Chamado</Label><select id="conversation-ticket-id" name="ticket_id" className="form-control" required defaultValue=""><option value="">Selecione</option>{openTickets.map(t => <option key={t.id} value={t.id}>{t.number} — {t.subject}</option>)}</select></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>Cancelar</Button><Button disabled={busy}>Vincular</Button></div>
        </form></DialogContent></Dialog>
    </>}

    {canSimulate && <Dialog open={simulateOpen} onOpenChange={setSimulateOpen}><DialogContent><DialogHeader><DialogTitle>Simular mensagem recebida</DialogTitle><DialogDescription>Recurso de desenvolvimento/teste: usa a mesma camada de serviço que receberá as mensagens da integração no futuro.</DialogDescription></DialogHeader>
      <form onSubmit={submitSimulation} className="grid gap-4">
        <div><Label htmlFor="simulate-phone">Telefone</Label><Input id="simulate-phone" name="phone" required placeholder="(11) 99999-0000" /></div>
        <div><Label htmlFor="simulate-name">Nome exibido (opcional)</Label><Input id="simulate-name" name="display_name" /></div>
        <div><Label htmlFor="simulate-type">Tipo</Label><select id="simulate-type" name="message_type" className="form-control" defaultValue="text">{Object.entries(messageTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><Label htmlFor="simulate-content">Conteúdo</Label><Textarea id="simulate-content" name="content" rows={3} required /></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSimulateOpen(false)}>Cancelar</Button><Button disabled={busy}>Receber mensagem</Button></div>
      </form></DialogContent></Dialog>}
  </Page>;
}

function MediaView({ path, mime, type, name }: { path: string; mime: string | null; type: string; name: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.storage.from("whatsapp-media").createSignedUrl(path, 3600).then(({ data, error }) => { if (!alive) return; if (error || !data) setFailed(true); else setUrl(data.signedUrl); });
    return () => { alive = false; };
  }, [path]);
  if (failed) return <p className="mt-2 text-xs text-destructive">Não foi possível carregar a mídia.</p>;
  if (!url) return <p className="mt-2 text-xs text-muted-foreground">Carregando mídia…</p>;
  const kind = (mime ?? "").split("/")[0] || type;
  return <div className="mt-2 grid gap-1">
    {kind === "image" && <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={name ?? "Imagem recebida"} className="max-h-64 rounded border object-contain" loading="lazy" /></a>}
    {kind === "video" && <video src={url} controls preload="metadata" className="max-h-64 w-full rounded border" />}
    {kind === "audio" && <audio src={url} controls preload="metadata" className="w-full" />}
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary underline">Abrir{kind === "image" || kind === "video" || kind === "audio" ? " em nova aba" : " anexo"}{name ? `: ${name}` : ""}</a>
  </div>;
}
