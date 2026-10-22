import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { ResponsePending } from './first-response';
export const getFirstResponseAlerts = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc('pending_first_response_alerts');
  if (error) throw new Error('Não foi possível atualizar os alertas.');
  return data as unknown as { serverNow: string; rows: ResponsePending[] };
});
export const recordCustomerCommunication = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string; channel: string; recipient: string; summary: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: ticket, error: readError } = await context.supabase.from('tickets').select('id').eq('id', data.ticketId).maybeSingle();
    if (readError || !ticket) throw new Error('Chamado indisponível ou acesso não autorizado.');
    const { error } = await context.supabase.rpc('record_customer_communication', { _ticket_id: data.ticketId, _channel: data.channel, _recipient: data.recipient, _summary: data.summary });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
