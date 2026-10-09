DROP POLICY IF EXISTS "Authenticated read ticket files" ON storage.objects;
CREATE POLICY "Authenticated read ticket files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ticket-attachments' AND public.has_module(auth.uid(), 'tickets')
  AND EXISTS (SELECT 1 FROM public.ticket_attachments a WHERE a.storage_path = objects.name));
DROP POLICY IF EXISTS "Authenticated read whatsapp media" ON storage.objects;
CREATE POLICY "Authenticated read whatsapp media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'whatsapp-media' AND public.has_module(auth.uid(), 'inbox')
  AND EXISTS (SELECT 1 FROM public.messages m WHERE m.attachment_path = objects.name));
DROP POLICY IF EXISTS "Operations upload ticket files" ON storage.objects;
CREATE POLICY "Operations upload ticket files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments' AND public.can_manage_operations(auth.uid())
  AND public.has_module(auth.uid(), 'tickets') AND (storage.foldername(name))[1] IS NOT NULL);
DROP POLICY IF EXISTS "Managers delete ticket files" ON storage.objects;
CREATE POLICY "Managers delete ticket files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ticket-attachments' AND public.has_module(auth.uid(), 'tickets')
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')));