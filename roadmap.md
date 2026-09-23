# IGA Service — Fase 1

- [x] Criar banco, segurança, automações da timeline e armazenamento privado
- [x] Implementar autenticação e recuperação de senha
- [x] Implementar navegação responsiva, tema claro/escuro e permissões
- [x] Implementar Empresas, Contatos, Técnicos, Categorias e SLA
- [x] Implementar Chamados, atendimento, anexos e timeline
- [x] Validar segurança, desktop, celular e fluxo completo

# IGA Service — Fase 1.1

- [x] Adicionar edição aos cadastros existentes
- [x] Corrigir categoria/subcategoria e filtros de chamados
- [x] Consolidar transições, acolhimento e timeline
- [x] Alinhar permissões visuais e SLA
- [x] Validar fluxo autenticado e segurança

# IGA Service — Fase 1.2

- [x] Corrigir abertura da tela de detalhes do chamado
- [x] Validar fluxo completo até nova resolução

# IGA Service — Fase 2

- [x] Fila de atendimento com visualizações e contadores
- [x] Minha fila com SLA, tempo em aberto e última atividade
- [x] Transferência de responsabilidade com registro na timeline
- [x] SLA operacional calculado com indicadores discretos
- [x] Agendamento e reagendamento com histórico
- [x] Notificações internas com marcação de leitura
- [x] Gestão de usuários e perfis de acesso com auditoria
- [x] Validar Administrador, Técnico e Visualização

# IGA Service — Fase 3A

- [x] Caixa de Entrada com conversas, situações e mensagens não lidas
- [x] Estrutura própria de conversas e mensagens (canal preparado para WhatsApp)
- [x] Identificação do cliente por telefone (contato → empresa) e vínculo manual
- [x] Criar chamado da conversa (canal WhatsApp) e vincular a chamado existente
- [x] Simulação de mensagem recebida para desenvolvimento/teste
- [x] Camada de serviço única pronta para receber webhook no futuro

# IGA Service — Complemento: alteração, arquivamento e exclusão

- [x] Edição de chamado com registro na timeline
- [x] Cancelar/arquivar chamado exigindo motivo
- [x] Arquivar, restaurar e excluir cadastros conforme histórico
- [x] Auditoria administrativa por entidade, com motivo e valores
- [x] Proteção do último Administrador ativo

## Complemento — Exclusão de chamados e menu lateral
- [x] Exclusão definitiva de chamado pelo Administrador (motivo obrigatório, confirmação, auditoria mínima)
- [x] Limpeza de vínculos sem registros órfãos (timeline, anexos, agendamentos, notificações, conversas desvinculadas)
- [x] Cancelar/Arquivar preservado
- [x] Menu lateral em categorias recolhíveis com estado preservado e destaque da rota atual

## Fase 3B — WhatsApp Business (recebimento)
- [x] Webhook oficial (verificação + assinatura) reutilizando a camada de mensagens
- [x] Idempotência, mídias privadas, log técnico, tela Administração › Integrações
- [ ] Validação com WhatsApp real — aguardando credenciais da Meta
