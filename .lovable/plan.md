# Fase 2 — Central operacional de chamados + gestão de usuários

Tudo é construído sobre a estrutura da Fase 1. Nenhuma tela existente é refeita: Chamados, Timeline, Notas, Anexos e Solução continuam como estão, recebendo acréscimos.

## 1. Fila de atendimento (tela de Chamados)

Uma faixa de abas acima da tabela atual, cada uma com contador: Todos, Não atribuídos, Meus chamados, Novos/Triagem, Em atendimento, Aguardando cliente, Aguardando terceiro, Agendados, Resolvidos. As abas apenas pré-filtram a mesma listagem; pesquisa e filtros atuais continuam combinando com elas.

"Meus chamados" aparece para quem está vinculado a um cadastro de Técnico e mostra os chamados atribuídos a esse técnico.

## 2. Colunas operacionais na listagem

Acrescento à tabela: tempo em aberto, situação de SLA, última atividade (data/hora + tempo decorrido). Nada é duplicado; são colunas da mesma listagem.

## 3. SLA operacional

Para cada chamado, calculo a partir dos prazos já cadastrados em SLA e dos horários do chamado: prazo de acolhimento, de primeira resposta e de resolução. Situação exibida como etiqueta discreta: Dentro do prazo, Próximo do vencimento (a partir de 80% do prazo), SLA vencido, Concluído no prazo, Concluído fora do prazo. Sem dashboard.

## 4. Transferência de responsabilidade

No detalhe do chamado, ação "Transferir" para Administrador e Supervisor: escolhe o novo técnico e pode informar o motivo. A timeline registra técnico anterior, novo técnico, quem transferiu, data/hora e motivo. Histórico anterior intacto.

## 5. Agendamento

Ao levar o chamado para "Agendado", pede data, hora, técnico responsável e observação. O agendamento aparece em destaque no detalhe e na timeline. Reagendar registra um novo evento e mantém os anteriores no histórico.

## 6. Última atividade

O chamado passa a guardar a data/hora da última atividade relevante, atualizada automaticamente a cada evento da timeline. Usada na listagem e no detalhe.

## 7. Notificações internas

Sino no topo com contador de não lidas e lista das notificações; é possível marcar como lida (uma ou todas). Geradas automaticamente para: chamado atribuído, transferência, reabertura, agendamento/reagendamento, SLA próximo do vencimento e SLA vencido. Cada usuário só vê as suas. Sem e-mail, WhatsApp ou push.

## 8. Detalhe do chamado

Um painel de resumo no topo com Empresa, Contato, Status, Prioridade, Técnico responsável, SLA, tempo em aberto e agendamento quando existir. O resto da tela permanece igual.

## 9. Permissões

Administrador/Supervisor: toda a operação, atribuir e transferir. Técnico: opera seus chamados e vê sua fila. Visualização: só consulta — nenhuma ação operacional aparece e o banco continua recusando gravações.

## Complemento — Usuários e perfis de acesso

Na tela Administração → Usuários (só Administrador):

- Botão "+ Novo Usuário" com Nome, E-mail, Telefone, Perfil e Status. O usuário é criado na autenticação do projeto e os vínculos de perfil e permissão são feitos automaticamente.
- Primeiro acesso: o sistema gera e envia um convite por e-mail pelo próprio mecanismo da autenticação; o usuário define a própria senha. Nenhuma senha é criada ou guardada pelo sistema.
- Perfil Técnico: permite vincular a um técnico já cadastrado ou criar o cadastro a partir do usuário, sem duplicar registros.
- Listagem com Nome, E-mail, Perfil, Status, Técnico vinculado, Último acesso e Data de criação.
- Ações: editar dados, alterar perfil, ativar/desativar, vincular/desvincular técnico e disparar redefinição de senha. Sem exclusão de usuários.
- Usuário inativo é impedido de usar o sistema.
- Ninguém pode elevar o próprio perfil; a regra é aplicada também no banco.
- Auditoria administrativa: usuário criado, perfil alterado, ativação/desativação e vínculo de técnico, com responsável, data/hora, ação e valores anterior/novo. Visível ao Administrador.

## Detalhes técnicos

- Migration: `tickets.scheduled_at`, `scheduled_note`, `last_activity_at`; tabela `ticket_schedules` (histórico de agendamentos); tabela `notifications` (usuário, tipo, título, ticket, lida); tabela `admin_audit_logs`; `profiles.phone` e `profiles.status`; `user_roles` com gatilho impedindo auto-elevação de perfil; gatilho de `ticket_events` atualizando `last_activity_at`; eventos `transferred`, `scheduled`, `rescheduled` gerados por gatilho; GRANT + RLS em todas as tabelas novas (notificações restritas a `auth.uid()`, auditoria restrita a admin).
- Gate `_authenticated` passa a bloquear usuário com status inativo.
- SLA calculado em `src/lib/sla.ts` (puro, sem persistência) a partir de `sla_policies`.
- Notificações de SLA geradas por server function chamada pela própria aplicação ao carregar a fila (sem cron nesta fase).
- Criação de usuário, convite de primeiro acesso, ativação/desativação e reset de senha via server functions com `requireSupabaseAuth` + verificação de papel admin antes de usar o cliente privilegiado.
- Novos arquivos: `src/lib/sla.ts`, `src/components/iga/TicketQueueTabs.tsx`, `src/components/iga/SlaBadge.tsx`, `src/components/iga/NotificationsBell.tsx`, `src/lib/admin-users.functions.ts`. Alterados: `tickets.index.tsx`, `tickets.$ticketId.tsx`, `users.tsx`, `AppShell.tsx`, `_authenticated/route.tsx`, `src/lib/iga.ts`.

## Validação

Fluxo autenticado real: chamado sem técnico em Não atribuídos → atribuição move para a fila do técnico → transferência muda a fila e registra timeline → SLA calculado e vencimento identificado → agendamento e reagendamento → notificações geradas e marcadas como lidas → operação com perfil Técnico → perfil Visualização sem ações. Usuários: criação de Administrador, Supervisor, Técnico (com vínculo), Visualização, alteração de perfil, desativação/reativação, bloqueio de inativo, tentativa de administração por não-admin e preservação do histórico.
