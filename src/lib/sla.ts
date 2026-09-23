export type SlaPolicy = { priority: string; acknowledgment_minutes: number; first_response_minutes: number; resolution_minutes: number };
export type SlaState = "ok" | "warning" | "breached" | "done_ok" | "done_late" | "none";
export type SlaInfo = { state: SlaState; label: string; acknowledgmentDue: string | null; firstResponseDue: string | null; resolutionDue: string | null; detail: string };

export const slaLabels: Record<SlaState, string> = {
  ok: "Dentro do prazo", warning: "Próximo do vencimento", breached: "SLA vencido",
  done_ok: "Concluído no prazo", done_late: "Concluído fora do prazo", none: "Sem política",
};

type TicketLike = {
  priority: string; opened_at: string; status: string;
  acknowledged_at?: string | null; first_response_at?: string | null; resolved_at?: string | null; closed_at?: string | null;
};

function plus(base: string, minutes: number) { return new Date(new Date(base).getTime() + minutes * 60_000).toISOString(); }

export function computeSla(ticket: TicketLike, policies: SlaPolicy[], now = Date.now()): SlaInfo {
  const policy = policies.find(p => p.priority === ticket.priority);
  if (!policy) return { state: "none", label: slaLabels.none, acknowledgmentDue: null, firstResponseDue: null, resolutionDue: null, detail: "Prazos não cadastrados para esta prioridade." };
  const acknowledgmentDue = plus(ticket.opened_at, policy.acknowledgment_minutes);
  const firstResponseDue = plus(ticket.opened_at, policy.first_response_minutes);
  const resolutionDue = plus(ticket.opened_at, policy.resolution_minutes);
  const done = ticket.resolved_at ?? ticket.closed_at;
  if (done || ticket.status === "cancelled" || ticket.status === "duplicate") {
    if (!done) return { state: "none", label: slaLabels.none, acknowledgmentDue, firstResponseDue, resolutionDue, detail: "Chamado encerrado sem resolução." };
    const late = new Date(done).getTime() > new Date(resolutionDue).getTime();
    return { state: late ? "done_late" : "done_ok", label: late ? slaLabels.done_late : slaLabels.done_ok, acknowledgmentDue, firstResponseDue, resolutionDue, detail: `Resolução prevista para ${fmt(resolutionDue)}.` };
  }
  const pending: Array<[string, string]> = [];
  if (!ticket.acknowledged_at) pending.push(["Acolhimento", acknowledgmentDue]);
  if (!ticket.first_response_at) pending.push(["1ª resposta", firstResponseDue]);
  pending.push(["Resolução", resolutionDue]);
  let worst: { state: SlaState; name: string; due: string } = { state: "ok", name: "Resolução", due: resolutionDue };
  const rank: Record<string, number> = { ok: 0, warning: 1, breached: 2 };
  for (const [name, due] of pending) {
    const total = new Date(due).getTime() - new Date(ticket.opened_at).getTime();
    const elapsed = now - new Date(ticket.opened_at).getTime();
    const state: SlaState = now > new Date(due).getTime() ? "breached" : elapsed >= total * 0.8 ? "warning" : "ok";
    if ((rank[state] ?? 0) > (rank[worst.state] ?? 0)) worst = { state, name, due };
  }
  return { state: worst.state, label: slaLabels[worst.state], acknowledgmentDue, firstResponseDue, resolutionDue, detail: `${worst.name}: prazo ${fmt(worst.due)}.` };
}

function fmt(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
