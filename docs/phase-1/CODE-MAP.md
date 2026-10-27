# Mapa do código da IGA Service

Guia de navegação para manutenção. Os módulos próprios possuem comentário de
área no início do arquivo; funções nomeadas descrevem sua responsabilidade
junto da implementação. A orientação para continuar esse padrão está no
[AGENTS.md](../../AGENTS.md).

## Interface e cadastros

| Área | Arquivos e pontos de entrada | Responsabilidade |
| --- | --- | --- |
| Navegação e tema | [AppShell](../../src/components/iga/AppShell.tsx), `navigation`, `toggleGroup`, `toggleTheme` | Menus por módulo, formatos aberto/recolhido/móvel e aparência |
| Cabeçalho | [useAutoHideHeader](../../src/components/iga/useAutoHideHeader.ts) | Direção de rolagem, foco e visibilidade do topo |
| Saída | [LogoutButton](../../src/components/iga/LogoutButton.tsx), `confirm` | Confirmação, cancelamento e proteção contra repetição |
| Cadastros compartilhados | [ResourcePage](../../src/components/iga/ResourcePage.tsx), `openEditor`, `submit`, `startAction`, `confirmAction`, `restore` | Formulários, vínculos, persistência e ações conforme o perfil |
| Campos de empresa | [CompanyFields](../../src/components/iga/CompanyFields.tsx) | Identificação, CNPJ/CPF, domínio, canais e endereço |
| Listagem de empresas | [CompanyToolbar](../../src/components/iga/CompanyToolbar.tsx), [CompanyOverview](../../src/components/iga/CompanyOverview.tsx) | Filtros, situação e totais |
| Listagem de contatos | [ContactToolbar](../../src/components/iga/ContactToolbar.tsx), [ContactOverview](../../src/components/iga/ContactOverview.tsx) | Empresa vinculada, nome A–Z/Z–A e totais |
| Número prioritário | [preferredContactPhone](../../src/lib/contact-phone.ts), `ContactPhone` em ResourcePage | Principal marcado prefere WhatsApp; demais preferem Telefone; alternativa quando vazio |
| Telefones | [PhoneInput](../../src/components/iga/PhoneInput.tsx), [phone-format](../../src/lib/phone-format.ts) | Máscaras, limites de 10/11 dígitos, cursor e preservação dos registros antigos |
| Documento e domínio | [company-save-feedback](../../src/lib/company-save-feedback.ts), [company-domain](../../src/lib/company-domain.ts) | Conflito específico de CNPJ/CPF e domínio opcional |
| Rótulos obrigatórios | [Label e RequiredMark](../../src/components/ui/label.tsx) | Asterisco vermelho visual, sem mudar validação nem nome acessível |
| Situações, ícones e dicas | [StatusBadge](../../src/components/iga/StatusBadge.tsx), [RecordName](../../src/components/iga/RecordName.tsx), [ActionHint](../../src/components/iga/ActionHint.tsx) | Apresentação reutilizável e descrições das ações |
| Cores e layout | [styles.css](../../src/styles.css) | Seções comentadas de tema, navegação, cartões, filtros e tabelas |

`Label required` deve acompanhar a mesma condição do campo obrigatório. Filtros,
campos opcionais e valores preenchidos automaticamente sem seleção obrigatória
não recebem marcador. Obrigações conferidas pelos botões/servidor (por exemplo,
motivo de arquivamento e variáveis de modelo) são indicadas explicitamente na tela.

## Consultas e paginação

[usePagedRecords](../../src/components/iga/usePagedRecords.ts) concentra página,
espera da pesquisa, nova tentativa e descarte de respostas antigas.
[list-pagination](../../src/lib/list-pagination.ts) valida contratos e intervalos;
[TablePager](../../src/components/iga/TablePager.tsx) apresenta os controles.

As funções de leitura são `list_paged_records` na
[migration 0023](../../drizzle/migrations/0023_paginated_record_lists.sql) e
`list_paged_contacts` na
[migration 0024](../../drizzle/migrations/0024_contact_list_filters.sql).
Filtros são aplicados no banco antes da página; contadores consideram o conjunto
autorizado correspondente. As funções são SECURITY INVOKER e mantêm RLS.
Catálogos pequenos de opções são distintos dos registros completos da tabela.

## Autenticação e administração

| Fluxo | Localização | Observação para manutenção |
| --- | --- | --- |
| Entrada e recuperação | [auth](../../src/routes/auth.tsx), [AuthForm](../../src/components/iga/AuthForm.tsx) | Hidratação protegida antes de enviar credenciais |
| Link de senha | [PasswordResetPage](../../src/components/iga/PasswordResetPage.tsx), [NewPasswordForm](../../src/components/iga/NewPasswordForm.tsx), [password-recovery](../../src/lib/password-recovery.ts) | Valida o link em sessão isolada; não utiliza a sessão já aberta para trocar senha |
| Cliente isolado | [password-reset-client](../../src/integrations/supabase/password-reset-client.ts) | Sem persistência compartilhada do token do convite/recuperação |
| Proteção de rotas | [_authenticated/route](../../src/routes/_authenticated/route.tsx), `beforeLoad` | Sessão, perfil ativo e módulo; `Layout` recebe o contexto validado |
| Administração de usuários | [users](../../src/routes/_authenticated/users.tsx), [admin-users.functions](../../src/lib/admin-users.functions.ts) | `assertAdmin` e `assertPrimary` centralizam entradas sensíveis |
| Criação recuperável | [admin-user-creation.server](../../src/lib/admin-user-creation.server.ts), [contratos](../../src/lib/admin-user-creation.ts) | Operação idempotente, identidade, metadados, convite e retomada |
| Alteração parcial | [admin-user-update](../../src/lib/admin-user-update.ts), `updateAdminUser` | Plano validado e transação autenticada com auditoria |
| Recuperação administrativa | [password-recovery.server](../../src/lib/password-recovery.server.ts) | Confere ator/alvo e registra resultado administrativo |
| Acompanhamento | [AdminAudit](../../src/components/iga/AdminAudit.tsx), [AdminCreationOperations](../../src/components/iga/AdminCreationOperations.tsx) | Histórico e andamento das operações |

As permissões continuam sendo papel **e** módulo. Ocultar ação ou menu não
substitui autorização no servidor e no banco. A configuração privilegiada pertence
ao servidor. Comentários e relatórios nunca devem conter senhas ou tokens.

## Atendimento e mensagens

- [tickets.index](../../src/routes/_authenticated/tickets.index.tsx): filas,
  filtros, abertura manual e consultas paginadas.
- [tickets.$ticketId](../../src/routes/_authenticated/tickets.$ticketId.tsx):
  condução, edição, transferências, agendamentos, anexos e linha do tempo.
- [sla](../../src/lib/sla.ts), [tela SLA](../../src/routes/_authenticated/sla.tsx)
  e [sla-notifications.functions](../../src/lib/sla-notifications.functions.ts):
  políticas, cálculo dos prazos e notificações operacionais.
- [records-admin.functions](../../src/lib/records-admin.functions.ts) e
  [tickets-admin.functions](../../src/lib/tickets-admin.functions.ts):
  autorização, referências e proteção do histórico nas ações de ciclo de vida.
- [inbox](../../src/routes/_authenticated/inbox.tsx): conversas, identificação,
  modelos, resposta e abertura de chamado a partir da conversa.
- [messaging.functions](../../src/lib/messaging.functions.ts) e
  [messaging.server](../../src/lib/messaging.server.ts): operações autenticadas,
  identificação dos telefones e registro de mensagens recebidas.
- [useInboxUnread](../../src/components/iga/useInboxUnread.ts) e
  [inbox-unread](../../src/lib/inbox-unread.ts): selo de não lidas e sinal após
  leitura confirmada. O contador reflete a leitura compartilhada da conversa.
- [whatsapp-parser](../../src/lib/whatsapp-parser.ts),
  [whatsapp.server](../../src/lib/whatsapp.server.ts),
  [webhook](../../src/routes/api/public/whatsapp/webhook.ts): interpretação,
  assinatura, eventos recebidos e mídias.
- [whatsapp-templates.functions](../../src/lib/whatsapp-templates.functions.ts)
  e [whatsapp-templates.server](../../src/lib/whatsapp-templates.server.ts):
  modelos aprovados, variáveis e confirmação do envio autorizado.
- [integrations](../../src/routes/_authenticated/integrations.tsx) e
  [whatsapp.functions](../../src/lib/whatsapp.functions.ts): painel técnico,
  eventos paginados e reprocessamento de mídias.

Os fluxos de mensagens contêm operações reais quando executados no ambiente
configurado. Consultar ou comentar sua implementação não exige acioná-los.

## Homologação e contratos publicados

Os scripts em [tests/homologation](../../tests/homologation/README.md) possuem
comentários de finalidade e funções auxiliares. Aplicadores conferem destino
local e definição SQL antes de operar. Arquivos de resultado e credenciais são
mantidos na pasta privada, fora do Git. Os testes de interface em
[tests/interface](../../tests/interface) utilizam serviços sintéticos.

As migrations publicadas foram preservadas: seus corpos fazem parte da
verificação de instalação. A explicação de suas responsabilidades fica nos
chamadores, neste mapa e nos relatórios da homologação. Alterações futuras no
banco devem usar uma nova migration quando forem necessárias.

`routeTree.gen.ts`, contratos Supabase e adaptadores identificados como gerados
não são lugar para regras de negócio. As descrições acima apontam os componentes
e serviços próprios que os utilizam; não é necessário comentar cada propriedade
de um tipo gerado nem cada callback de uma biblioteca.
