ALTER TABLE public.messages ADD COLUMN template_name text, ADD COLUMN template_language text, ADD COLUMN sent_by uuid;
COMMENT ON COLUMN public.messages.template_name IS 'Nome do modelo aprovado da Meta usado no envio (null = mensagem comum).';
COMMENT ON COLUMN public.messages.sent_by IS 'Usuário que enviou a mensagem pelo sistema.';