# Sidebar, contadores e cinco registros fixos — 26/10/2026

## Comportamento solicitado

- Os contadores de Todas/Ativas/Inativas-Arquivadas voltam ao preenchimento
  nativo do tema quando não selecionados. Apenas o contador do filtro ativo
  recebe fundo branco e número azul. As bolinhas de situação mantêm suas cores.
- Na sidebar recolhida, a aba atual ganha uma barra azul na borda direita,
  preservando o fundo de seleção e `aria-current` existentes.
- Caixa de Entrada mostra um contador vermelho com número branco tanto no
  menu aberto quanto no recolhido e no menu móvel. Números acima de 99 aparecem
  como 99+, com total completo no nome acessível do link. Total zero oculta o selo.
- As tabelas ficam fixas em cinco registros por página. O seletor foi removido;
  continuam o resumo de registros e os controles anterior, página atual e próxima.
  Consultas de cadastros, Chamados, Usuários e eventos solicitam cinco registros.
  A migration 0023 publicada mantém a compatibilidade com seus tamanhos originais;
  a interface não oferece alteração de tamanho.

## Origem e atualização do contador

Reutiliza `conversations.unread_count`, já incrementado pelas mensagens recebidas
no banco e zerado pela operação existente de leitura de conversa. É a leitura
compartilhada da Caixa de Entrada atual; não introduz recibos individuais por
usuário. O contador não marca mensagens como lidas ao abrir/recolher o menu.

Consulta somente metadados de conversas com não lidas, em lotes de 500, somando
até o fim para não truncar o total no limite de resposta da API. Usa o cliente
autenticado e RLS existente, somente quando o módulo inbox está disponível.
Não carrega conteúdo das mensagens. Atualiza a cada dez segundos enquanto a
aba está visível, ao retomar foco/visibilidade e após confirmação bem-sucedida
da leitura pela tela de conversas. Não depende de habilitar publicação Realtime.
Falha temporária mantém o último total confirmado; respostas após desmontagem
são ignoradas. Atualizações concorrentes são agrupadas, com nova consulta ao
terminar uma consulta em andamento.

Não exige migration, altera políticas ou envia mensagens reais. A interface de
conversas foi alterada apenas para avisar o contador depois da leitura existente.

## Verificações

Seis cenários focados passaram em Chromium: cores nos dois temas; navegação
fixa de cinco registros; total com 501 conversas atravessando dois lotes;
chegada de mensagens pelo intervalo; leitura reduzindo/ocultando o selo;
menu recolhido com marcador; menu móvel; ausência de consultas sem módulo inbox.
Os cenários de contador não efetuam gravações no serviço sintético.

TypeScript, ESLint dos componentes/hooks/helpers envolvidos, 43 testes unitários
e build de produção em cópia isolada sem .env aprovados. Serviços de interface
são sintéticos, sem Auth ou envio WhatsApp real. Conferência no WSL pendente.

## Aplicação no Ubuntu

Parar somente Vite com Ctrl+C e manter o Supabase ligado. A migration 0023 da
rodada anterior já deve ter sido aplicada. Esta atualização copia somente fonte:

```bash
cd ~/projetos/iga-service-homologacao
(
  set -e
  git pull --ff-only
  cp --parents \
    src/components/iga/{AppShell,ResourcePage,TablePager}.tsx \
    src/components/iga/{usePagedRecords,useInboxUnread}.ts \
    src/lib/{list-pagination,inbox-unread}.ts \
    src/routes/_authenticated/{tickets.index,users,integrations,inbox}.tsx \
    src/styles.css "$HOME/iga-homologacao/app/"
  node "$HOME/iga-homologacao/private/start-app.mjs"
)
```

Conferir os dois temas, alternância dos filtros, rodapé sem seletor, sidebar
recolhida/aberta e contador com mensagens fictícias não lidas existentes. Ler uma
conversa de teste deve reduzir o total conforme a operação existente permitir.
A modernização visual completa de Contatos continua como próxima etapa combinada.

A suíte completa de interface também passou: 75 cenários. Depois da revisão
singular/plural do nome acessível, o cenário de atualização do selo passou
novamente, incluindo os totais 501, 2, 7, 1 e zero. Capturas sintéticas de sidebar
aberta/recolhida nos dois temas em `../screenshots/sidebar-*-{light,dark}.png`.
