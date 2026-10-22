CREATE INDEX IF NOT EXISTS ticket_response_events_idx ON public.ticket_events(ticket_id,event_type);
CREATE OR REPLACE FUNCTION public.record_customer_communication(_ticket_id uuid,_channel text,_recipient text,_summary text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.tickets; eid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_module(auth.uid(),'tickets') OR NOT public.can_manage_operations(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active') THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF _channel NOT IN ('phone','email','in_person','other') OR length(btrim(coalesce(_recipient,''))) NOT BETWEEN 1 AND 200 OR length(btrim(coalesce(_summary,''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Informe canal, destinatário e resumo da comunicação'; END IF;
 SELECT * INTO t FROM public.tickets WHERE id=_ticket_id FOR UPDATE;
 IF NOT FOUND OR t.channel <> 'manual' OR t.status IN ('cancelled','duplicate','resolved','closed') THEN RAISE EXCEPTION 'Chamado não elegível para comunicação manual'; END IF;
 INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,new_value,note) VALUES(t.id,auth.uid(),'customer_response',jsonb_build_object('source','manual','channel',_channel,'recipient',btrim(_recipient),'summary',btrim(_summary),'communicated_at',now()),btrim(_summary)) RETURNING id INTO eid;
 RETURN eid;
END $$;
REVOKE ALL ON FUNCTION public.record_customer_communication(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_communication(uuid,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.audit_whatsapp_customer_response() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid; opened timestamptz;
BEGIN
 IF NEW.direction <> 'outbound' OR NEW.channel <> 'whatsapp' OR NEW.sent_by IS NULL OR nullif(NEW.external_id,'') IS NULL OR NEW.external_id LIKE 'sim:%' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
   SELECT ticket_id INTO tid FROM public.conversations WHERE id=NEW.conversation_id;
   SELECT opened_at INTO opened FROM public.tickets WHERE id=tid;
   IF tid IS NOT NULL AND NEW.sent_at >= opened AND NEW.status IN ('sent','delivered','read') THEN
    INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,new_value,note) VALUES(tid,NEW.sent_by,'customer_response',jsonb_build_object('source','whatsapp','message_id',NEW.id,'external_id',NEW.external_id,'communicated_at',NEW.sent_at),'Comunicação WhatsApp aceita pela Meta');
   END IF;
 ELSIF NEW.status='failed' AND OLD.status IS DISTINCT FROM NEW.status THEN
   FOR tid IN SELECT ticket_id FROM public.ticket_events WHERE event_type='customer_response' AND new_value->>'message_id'=NEW.id::text LOOP
     INSERT INTO public.ticket_events(ticket_id,actor_id,event_type,new_value,note) VALUES(tid,NEW.sent_by,'customer_response_failed',jsonb_build_object('message_id',NEW.id,'external_id',NEW.external_id),'Meta confirmou falha da comunicação WhatsApp');
   END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_whatsapp_customer_response() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER messages_customer_response AFTER INSERT OR UPDATE OF status ON public.messages FOR EACH ROW EXECUTE FUNCTION public.audit_whatsapp_customer_response();
CREATE OR REPLACE FUNCTION public.pending_first_response_alerts() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('serverNow',now(),'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'number',t.number,'subject',t.subject,'priority',t.priority,'opened_at',t.opened_at,'company',c.trade_name) ORDER BY t.opened_at) FROM public.tickets t LEFT JOIN public.companies c ON c.id=t.company_id WHERE public.has_module(auth.uid(),'tickets') AND t.status NOT IN ('cancelled','duplicate','resolved','closed') AND t.opened_at < now()-interval '180 seconds' AND NOT EXISTS(SELECT 1 FROM public.ticket_events e WHERE e.ticket_id=t.id AND e.event_type='customer_response' AND e.created_at >= t.opened_at AND NOT EXISTS(SELECT 1 FROM public.ticket_events f WHERE f.ticket_id=t.id AND f.event_type='customer_response_failed' AND f.new_value->>'message_id'=e.new_value->>'message_id'))),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.pending_first_response_alerts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pending_first_response_alerts() TO authenticated;