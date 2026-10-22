export const FIRST_RESPONSE_LIMIT_SECONDS = 180;
export const RESPONSE_SOUND_INTERVAL_SECONDS = 60;
export const RESPONSE_POLL_MS = 15_000;
export const RESPONSE_EXCLUDED_STATUSES = ['cancelled', 'duplicate', 'resolved', 'closed'];
export function needsFirstResponse(ticket: { opened_at: string; status: string; validResponse: boolean }, now: number) {
  return !ticket.validResponse && !RESPONSE_EXCLUDED_STATUSES.includes(ticket.status) && now - Date.parse(ticket.opened_at) > FIRST_RESPONSE_LIMIT_SECONDS * 1000;
}
export function soundDue(now: number, last: number, pending: number, mutedUntil: number) {
  return pending > 0 && now >= mutedUntil && now - last >= RESPONSE_SOUND_INTERVAL_SECONDS * 1000;
}
export type ResponsePending = { id: string; number: string; subject: string; priority: string; opened_at: string; company: string | null };
