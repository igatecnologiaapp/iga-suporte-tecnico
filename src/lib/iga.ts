export const priorities = [
  ["low", "Baixa"], ["normal", "Normal"], ["high", "Alta"], ["urgent", "Urgente"],
] as const;
export const ticketStatuses = [
  ["new", "Novo"], ["triage", "Triagem"], ["in_progress", "Em atendimento"],
  ["waiting_customer", "Aguardando cliente"], ["waiting_third_party", "Aguardando terceiro"],
  ["scheduled", "Agendado"], ["resolved", "Resolvido"], ["closed", "Encerrado"],
  ["reopened", "Reaberto"], ["cancelled", "Cancelado"], ["duplicate", "Duplicado"],
] as const;
export const roleLabels: Record<string, string> = { admin: "Administrador", supervisor: "Supervisor", technician: "Técnico", viewer: "Visualização" };
export const priorityLabels = Object.fromEntries(priorities);
export const statusLabels = Object.fromEntries(ticketStatuses);
export const ticketTransitions: Record<string, readonly string[]> = {
  new: ["triage", "in_progress", "cancelled"],
  triage: ["in_progress", "waiting_customer", "cancelled"],
  in_progress: ["waiting_customer", "waiting_third_party", "scheduled", "resolved"],
  waiting_customer: ["in_progress", "resolved"],
  waiting_third_party: ["in_progress", "resolved"],
  scheduled: ["in_progress", "resolved"],
  resolved: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["in_progress"],
};
export function canOperate(role: string) { return role === "admin" || role === "supervisor" || role === "technician"; }
export function canManageCatalogs(role: string) { return role === "admin" || role === "supervisor"; }
export function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—"; }
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Não foi possível concluir a operação."; }
export function formatDuration(from?: string | null, to: number = Date.now()) {
  if (!from) return "—";
  const minutes = Math.max(0, Math.round((to - new Date(from).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}min`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
export type TicketQueue = { id: string; label: string; statuses?: readonly string[]; unassigned?: boolean; mine?: boolean };
export const ticketQueues: readonly TicketQueue[] = [
  { id: "all", label: "Todos" },
  { id: "unassigned", label: "Não atribuídos", unassigned: true },
  { id: "mine", label: "Meus chamados", mine: true },
  { id: "intake", label: "Novos/Triagem", statuses: ["new", "triage"] },
  { id: "in_progress", label: "Em atendimento", statuses: ["in_progress", "reopened"] },
  { id: "waiting_customer", label: "Aguardando cliente", statuses: ["waiting_customer"] },
  { id: "waiting_third_party", label: "Aguardando terceiro", statuses: ["waiting_third_party"] },
  { id: "scheduled", label: "Agendados", statuses: ["scheduled"] },
  { id: "resolved", label: "Resolvidos", statuses: ["resolved", "closed"] },
];
export function matchesQueue(queue: TicketQueue, row: { status: string; assigned_technician_id?: string | null }, myTechnicianId?: string | null) {
  if (queue.unassigned) return !row.assigned_technician_id && !["closed", "cancelled", "duplicate"].includes(row.status);
  if (queue.mine) return Boolean(myTechnicianId) && row.assigned_technician_id === myTechnicianId;
  if (queue.statuses) return queue.statuses.includes(row.status);
  return true;
}
export const notificationLabels: Record<string, string> = {
  assigned: "Atribuição", transferred: "Transferência", transferred_away: "Transferência",
  reopened: "Reabertura", scheduled: "Agendamento", rescheduled: "Reagendamento",
  sla_warning: "SLA próximo do vencimento", sla_breached: "SLA vencido",
};
export const conversationStatusLabels: Record<string, string> = {
  new: "Nova", triage: "Em triagem", linked: "Vinculada a chamado", finished: "Finalizada",
};
export const messageTypeLabels: Record<string, string> = {
  text: "Texto", image: "Imagem", document: "Documento", audio: "Áudio", video: "Vídeo", other: "Outro",
};
export const channelLabels: Record<string, string> = {
  manual: "Manual", whatsapp: "WhatsApp", email: "E-mail", portal: "Portal", other: "Outro",
};
