-- Permite desvincular um técnico de um usuário sem apagar o cadastro (histórico preservado)
ALTER TABLE public.technicians ALTER COLUMN user_id DROP NOT NULL;