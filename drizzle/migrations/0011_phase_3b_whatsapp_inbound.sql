ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_id text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint,
  ADD COLUMN IF NOT EXISTS original_type text,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'processed'
    CHECK (processing_status IN ('processed','media_pending','media_stored','media_failed','unsupported'));

CREATE TABLE public.integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'whatsapp',
  event_type text NOT NULL,
  external_id text,
  result text NOT NULL CHECK (result IN ('processed','ignored','duplicate','error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integration_events TO authenticated;
GRANT ALL ON public.integration_events TO service_role;
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read integration events" ON public.integration_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX integration_events_provider_created ON public.integration_events(provider, created_at DESC);

CREATE POLICY "Authenticated read whatsapp media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'whatsapp-media' AND EXISTS (SELECT 1 FROM public.messages m WHERE m.attachment_path = name));