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
