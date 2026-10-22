# IGA-ST-001 — Alertas de primeira resposta

## Diagnóstico e decisão necessária

O registro atual de primeira resposta não comprova comunicação com o cliente: o banco preenche `first_response_at` ao mudar o chamado para **Em atendimento**. Nos chamados manuais não existe uma ação específica que registre a comunicação ao solicitante. O envio WhatsApp confirmado fica no histórico da conversa, mas não atualiza esse campo do chamado.

Conforme o documento, a adaptação do fluxo manual será feita somente após aprovação desta proposta. Usar o campo atual diretamente faria chamados apenas atribuídos ou com status alterado deixarem de alertar indevidamente.

## Adaptação proposta

- Acrescentar ao chamado manual a ação **Registrar comunicação ao cliente**, disponível somente para quem pode operar o chamado.
- Exigir canal utilizado, destinatário e resumo da comunicação realizada. Registrar atendente e horário do servidor na timeline imutável.
- A ação documenta uma comunicação já realizada; não envia e-mail, não efetua ligação e não presume confirmação externa.
- Para WhatsApp, considerar somente mensagem de saída confirmada pela Meta, com identificador externo, registrada depois da abertura e vinculada ao chamado no momento do envio. Tentativas recusadas não contam. Falha posterior confirmada deve invalidar essa evidência para o alerta quando não existir outra resposta válida.
- Não converter registros históricos baseados em mudança de status em comunicação comprovada. Chamados antigos ainda elegíveis, sem evidência válida, poderão aparecer como pendentes; não apagar nem modificar seu histórico.

## Alertas

- Prazo: **mais de 180 segundos** desde a abertura, calculado com horário confiável do servidor.
- Considerar chamados em atendimento operacional; cancelados, duplicados, resolvidos e encerrados ficam fora. Visualização, atribuição, acolhimento e outras mudanças de status não comprovam resposta.
- Aviso persistente no cabeçalho das telas operacionais autorizadas, com contador e lista contendo número, empresa, assunto, prioridade, tempo de espera e acesso direto.
- Integrar a lista de pendências ao sino existente, sem criar uma nova notificação persistida a cada consulta. Marcar como lida ou fechar a lista não elimina pendência.
- Som curto consolidado, sem sobreposição, repetido a cada **60 segundos** enquanto houver pendências. Controle **Ativar alertas sonoros**, desativação e silêncio temporário por usuário.
- Só mostrar áudio habilitado após reprodução permitida pelo navegador. Coordenar abas para um único sinal por ciclo.
- Atualização periódica compartilhada no cabeçalho, com recuperação após reconexão e retorno à aplicação. Em erro, não representar dados antigos como estado atual confirmado.

## Segurança e preservação

- Consultas protegidas pelo usuário autenticado e pelas políticas de visibilidade efetivas dos chamados, inclusive restrições por módulo e técnico.
- Nenhum acesso administrativo para leituras comuns e nenhum dado de chamado não autorizado no aviso.
- Preservar A1/B1/B2/B3, autenticação, conversas independentes de chamados, anexos e mídias privadas.
- Manter o SLA atual e seus registros históricos. Usar evidência auditável separada para o alerta operacional, evitando redefinir retroativamente o SLA.
- Não atualizar dependências, iniciar outras etapas ou publicar.

## Detalhes técnicos

- Reutilizar `ticket_events` para evidências auditáveis de comunicação manual e confirmação WhatsApp; criar somente a função protegida mínima e as permissões necessárias para esse registro.
- Reutilizar os fluxos existentes de texto, templates e confirmação de situação da Meta. Registrar o chamado relacionado no evento no momento da comunicação, evitando que um vínculo posterior encerre pendência indevidamente.
- Criar consulta autenticada de pendências com timestamp do servidor; reutilizar `NotificationsBell` e integrar o aviso em `AppShell`.
- Separar constantes e regras puras do alerta para testes concretos de limites, elegibilidade e confirmação; coordenar reprodução entre abas com recursos nativos do navegador.
- Inspecionar políticas e grants antes de qualquer mudança no banco; usar migração mínima apenas onde necessária. Não alterar os registros existentes de primeira resposta ou a regra de SLA nesta etapa.

## Validação e relatório

Validar individualmente os dez cenários do documento: abaixo/acima do prazo, três pendências, resposta válida, somente visualização/atribuição, acesso negado, recarga, bloqueio de áudio, duas abas e reconexão. Incluir resposta manual auditável e confirmação/falha WhatsApp, sem envio real externo sem autorização específica.

Relatar arquivos e migrações, regras de primeira resposta, resultados observados, limitações e regressões. Nenhuma publicação.