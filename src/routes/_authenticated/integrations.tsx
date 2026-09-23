import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle, PlugZap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Page } from "@/components/iga/Page";
import { errorMessage, formatDate } from "@/lib/iga";
import { getWhatsAppStatus, retryWhatsAppMedia } from "@/lib/whatsapp.functions";

const WEBHOOK_URL = "https://iga-suporte-tecnico.lovable.app/api/public/whatsapp/webhook";
const statusLabel: Record<string, string> = { not_configured: "Não configurado", configured: "Configurado", connected: "Conectado", error: "Erro" };
const resultLabel: Record<string, string> = { processed: "Processado", ignored: "Ignorado", duplicate: "Duplicado", error: "Erro" };

export const Route = createFileRoute("/_authenticated/integrations")({
  beforeLoad: ({ context }) => { if ((context as { role?: string }).role !== "admin") throw redirect({ to: "/tickets" }); },
  head: () => ({ meta: [
    { title: "Integrações — IGA Service" },
    { name: "description", content: "Situação da integração oficial do WhatsApp Business no IGA Service." },
    { property: "og:title", content: "Integrações — IGA Service" },
    { property: "og:description", content: "Situação da integração oficial do WhatsApp Business no IGA Service." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: IntegrationsPage,
});

type Status = Awaited<ReturnType<typeof getWhatsAppStatus>>;

function IntegrationsPage() {
  const [info, setInfo] = useState<Status | null>(null); const [busy, setBusy] = useState(false);
  async function load(test = false) {
    setBusy(true);
    try { const r = await getWhatsAppStatus({ data: { test } }); setInfo(r); if (test) r.test?.ok ? toast.success("Conexão com a Meta confirmada.") : toast.error(r.test?.error ?? "Configure as credenciais antes de testar."); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function retry() { setBusy(true); try { const r = await retryWhatsAppMedia(); toast.success(`${r.stored} de ${r.attempted} mídias armazenadas.`); await load(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }

  const variant = info?.status === "connected" ? "default" : info?.status === "error" ? "destructive" : "secondary";
  return <Page title="Integrações" description="Canais externos conectados ao IGA Service.">
    <section className="rounded-md border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><MessageCircle className="size-5" /><h2 className="font-semibold">WhatsApp Business (Cloud API oficial)</h2>{info && <Badge variant={variant}>{statusLabel[info.status]}</Badge>}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}><RefreshCw />Atualizar</Button>
          <Button size="sm" variant="outline" disabled={busy || info?.status === "not_configured"} onClick={() => void retry()}>Reprocessar mídias</Button>
          <Button size="sm" disabled={busy || info?.status === "not_configured"} onClick={() => void load(true)}><PlugZap />Testar conexão</Button>
        </div>
      </div>
      {info && <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Item label="Número conectado" value={info.test?.displayPhone ? `${info.test.displayPhone}${info.test.verifiedName ? ` · ${info.test.verifiedName}` : ""}` : "—"} />
        <Item label="Phone Number ID" value={info.phoneNumberId ?? "Não configurado"} />
        <Item label="WABA ID" value={info.wabaId ?? "Não configurado"} />
        <Item label="Webhook" value={info.webhookVerifiedAt ? `Verificado em ${formatDate(info.webhookVerifiedAt)}` : "Aguardando verificação pela Meta"} />
        <Item label="Última mensagem recebida" value={info.lastMessageAt ? formatDate(info.lastMessageAt) : "—"} />
        <Item label="Último evento processado" value={info.lastEvent ? `${info.lastEvent.event_type} · ${resultLabel[info.lastEvent.result]} · ${formatDate(info.lastEvent.created_at)}` : "—"} />
        <Item label="Último erro" value={info.lastError ? `${formatDate(info.lastError.created_at)} — ${info.lastError.error_message ?? info.lastError.event_type}` : "Nenhum"} />
        <Item label="URL do webhook" value={WEBHOOK_URL} />
        <Item label="Credenciais no ambiente seguro" value={Object.entries(info.secrets).map(([k, v]) => `${k}: ${v ? "ok" : "pendente"}`).join(" · ")} />
      </dl>}
    </section>
    <section className="mt-4 rounded-md border bg-card p-5">
      <h2 className="font-semibold">Log técnico recente</h2>
      {!info?.events.length ? <p className="mt-2 text-sm text-muted-foreground">Nenhum evento registrado.</p> :
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-2 pr-3">Data/hora</th><th className="pr-3">Evento</th><th className="pr-3">Identificador</th><th className="pr-3">Resultado</th><th>Erro</th></tr></thead>
          <tbody>{info.events.map((e: any, i: number) => <tr key={i} className="border-t"><td className="py-2 pr-3 whitespace-nowrap">{formatDate(e.created_at)}</td><td className="pr-3">{e.event_type}</td><td className="max-w-48 truncate pr-3">{e.external_id ?? "—"}</td><td className="pr-3">{resultLabel[e.result]}</td><td className="text-muted-foreground">{e.error_message ?? ""}</td></tr>)}</tbody></table></div>}
    </section>
  </Page>;
}

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-medium">{value}</dd></div>;
}
