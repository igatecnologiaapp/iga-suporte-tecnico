# Organização e filtros de Empresas — 26/10/2026

Implementação autorizada a partir das referências clara e escura fornecidas pelo
operador. Escopo inicial: Empresas; padrão de status compartilhado nos cadastros.
Primeira versão aprovada pelo operador no WSL; adendos finais de CSS aguardam
conferência manual. Sem publicação.

## Interface e comportamento

- Pesquisa e categoria mantidas na barra, junto ao botão Mais filtros.
- Filtros Todas, Ativas e Inativas / Arquivadas com contadores. Ativas continua
  sendo a situação inicial, preservando a listagem anterior. Todas inclui os
  registros inactive. As métricas superiores resumem os cadastros carregados;
  os contadores dos filtros consideram pesquisa, categoria e domínio, antes de
  restringir por situação. Nenhum total inclui registros fora da consulta autorizada.
- Mais filtros oferece nome A–Z/Z–A (ordenação natural em português), data de
  criação recente/antiga e domínio preenchido/vazio. Texto livre no campo Domínio
  também conta como preenchido; seu conteúdo não é normalizado nem alterado.
  Seleções atualizam a lista imediatamente; Concluir fecha o painel e Limpar
  filtros restaura pesquisa/categoria vazias e ordenação A–Z, preservando a
  situação selecionada.
- Categoria conserva categorias e subcategorias, incluindo prefixo da categoria
  principal e indicação de inativa quando aplicável.
- Ativo recebe indicador verde; Inativo / Arquivado recebe âmbar. As duas condições
  continuam representadas pelo mesmo valor inactive. Não há inferência pela
  auditoria ou distinção artificial de dados antigos. Texto acompanha a cor.
- O componente de status de registros é compartilhado, alcançando Contatos e
  outros cadastros. Fora de ResourcePage, o rótulo inactive continua Inativo;
  nenhuma conta de usuário passa a ser chamada de arquivada. Cores de prioridade
  e situação de chamados não foram alteradas.
- Seleção e Novo cadastro usam azul com texto claro nos dois temas. Novos tons
  são locais aos componentes de listagem; navegação e demais ações mantêm os
  tokens anteriores. Alinhamento reforça as colunas da tabela. As divisórias verticais da primeira
  versão foram removidas a pedido do operador.
- Barra se adapta à largura disponível (inclusive com menu lateral aberto).
  No celular os controles empilham, filtros de situação quebram linha, popover
  fica dentro da tela e a tabela mantém rolagem horizontal com colunas legíveis.

## Preservação e limites

Filtragem/ordenação sobre as mesmas linhas já recebidas do Supabase. Não foram
alterados consultas de autorização, RLS, funções administrativas, contratos de
Domínio/categorias, gravações, permissões ou migrations. Filtros não salvam
preferências nem modificam registros. Um novo filtro não amplia acesso.
Ordenação sem data válida usa fallback determinístico; empates usam nome/ID.

## Evidência executada

- 41 testes unitários aprovados, incluindo nomes com acento e ordenação numérica,
  contadores, texto livre e entradas congeladas preservadas.
- 39 testes de interface de Empresas/navegação aprovados: combinações de pesquisa,
  categoria/situação/domínio, contadores e vazio, limpar filtros, ordenação por
  nome/data, visualização sem edição e regressões anteriores de dados e foco.
- Após ampliar as colunas da tabela, seis verificações responsivas passaram de
  novo em 360/768/1440 nos dois temas, incluindo limites do painel e retorno de foco.
- TypeScript, lint dos componentes/helpers do lote (exceto ResourcePage com
  passivo preexistente) e build em cópia isolada sem `.env` aprovados.
- Inspeção visual em Chromium. Contraste texto/fundo medido em estado estável:
  Ativo 7,67:1 claro e 8,48:1 escuro; Inativo / Arquivado 7,53:1 e 9,15:1;
  seleção/Novo cadastro 5,10:1 e 4,59:1. Não equivale a auditoria de toda a aplicação.
- Capturas sintéticas em `../screenshots/company-{list,filters}-{360,1440}-{light,dark}.png`.
  Nenhuma senha, token ou link de ação nessas capturas.

## Aplicar e conferir

Parar Vite, atualizar Git, copiar mantendo caminhos: `src/components/iga/CompanyToolbar.tsx`,
`CompanyOverview.tsx`, `ResourcePage.tsx`, `StatusBadge.tsx`, `src/lib/company-list.ts`
e `src/styles.css` para a aplicação isolada; reiniciar pelo launcher privado.
Sem migration. Conferir Todas/Ativas/Inativas, contadores combinados com busca e
categoria, ordenação, painel móvel e alternância dos temas. A modernização completa
de Contatos e seus filtros específicos continua sendo a próxima etapa, após
observar este primeiro resultado em Empresas.


## Adendos visuais pedidos pelo operador — 26/10/2026

Operador confirmou que gostou da organização e pediu três ajustes:

- Removidas as divisórias verticais entre células nos cadastros. Separação
  horizontal de registros e borda externa preservadas.
- Removida a regra que deixava branca a bolinha do filtro selecionado. Verde e
  âmbar agora permanecem iguais antes/depois da seleção, nos dois temas.
- Scrollbars nativas com cores semânticas por tema em todo o documento: trilho
  claro/azulado no claro e azul profundo no escuro, puxador azul acinzentado,
  arredondado e com destaque de hover. Chromium/Safari usam pseudo-elementos
  WebKit de 10px (puxador de 6px dentro do trilho); Firefox recebe propriedades
  padrão de cor/largura fina. `color-scheme` acompanha o tema. Modo de cores
  forçadas mantém a apresentação nativa do sistema. Sem substituir a rolagem por JS.

Seis verificações responsivas existentes passaram novamente em 360/768/1440,
nos dois temas. Conferência adicional em Chromium confirmou cores das bolinhas
iguais antes/depois de selecionar, borda esquerda de célula com 0px, cores de
rolagem em tabela/formulário e fallback auto em cores forçadas. Rolagem por
teclado continuou funcionando. Nenhuma gravação nos serviços sintéticos.

Capturas com scrollbars nativas visíveis (flag padrão de ocultação do Playwright
removida somente para esta inspeção): `../screenshots/scrollbar-{table,dialog}-{light,dark}.png`.
Verificação real de Firefox/Safari não executada. Não foram repetidos testes de
servidor/SQL/build neste adendo exclusivamente CSS; a folha foi compilada e
renderizada pelo Vite das verificações de interface. As capturas anteriores do
lote preservam o histórico da primeira versão.

Para aplicar apenas estes adendos: atualizar Git, copiar `src/styles.css` para a
aplicação isolada e reiniciar Vite pelo launcher privado. Sem migration. Conferência
manual do operador ainda pendente para as barras e demais adendos.


## Limpar filtros independente da situação — 26/10/2026

A pedido do operador, a seleção rápida Todas/Ativas/Inativas não ativa Limpar
filtros. O botão aparece somente com pesquisa não vazia, categoria ou filtros
adicionais (ordenação/domínio). Ao limpar, mantém a situação escolhida e restaura
os demais campos. Pesquisa só com espaços não ativa o botão, coerente com a
filtragem que ignora espaços externos.

Três verificações existentes de filtros/contadores/ordenação foram ajustadas e
passaram: ausência de Limpar em cada situação sem filtros, limpeza de pesquisa e
categoria mantendo Inativas, limpeza de opções avançadas mantendo Todas e
ordenação A–Z restaurada, sem gravações. Capturas anteriores são históricas.
Aplicar junto ao CSS do adendo anterior, copiando também CompanyToolbar.tsx.


## Fundo claro, status vermelho e domínio vazio — 26/10/2026

Solicitação posterior do operador: Inativo/Arquivado vermelho nos dois temas,
fundo geral claro levemente azul e preenchimento dos status mais visível no
claro. Implementação exclusivamente de apresentação:

- Novo token `--app-background` para o fundo da página/autenticação, separado de
  `--background` usado por controles e janelas. No claro recebe azul suave;
  no escuro mantém a cor anterior. Cartões e tabelas seguem brancos no claro,
  sem mudar a paleta de campos, janelas, popovers ou menu lateral.
- Superfície/borda verde do status Ativo reforçadas no claro. Inativo/Arquivado
  usa preenchimento vermelho suave e texto vermelho escuro no claro; versão
  ajustada de vermelho no escuro. Indicador do filtro acompanha o mesmo estado,
  mantendo sua cor quando selecionado. Tokens de status de registros continuam
  compartilhados; não altera prioridade/situação de chamados.
- Após esclarecimento explícito, operador escolheu manter a empresa sem domínio
  na tabela e ocultar somente a informação vazia. Não há nova restrição de linhas,
  alteração de contadores nem mudança de filtro padrão. Valores null/vazios já
  não produziam a linha; DomainValue agora também ignora texto só com espaços.
  Formulário mantém o campo para preenchimento e texto livre existente permanece.

Seis verificações responsivas passaram em 360/768/1440 e ambos os temas. Três
regressões de domínio/gravação passaram, incluindo criação sem domínio, limpeza
explícita mantendo a empresa visível, ausência do rótulo vazio, preservação de
texto livre e categorias. Em inspeção adicional com serviços sintéticos, empresa
com domínio só de espaços permaneceu visível sem rótulo Domínio, nos dois temas,
sem gravação. Capturas em `../screenshots/theme-status-{light,dark}.png`.

Contraste texto/fundo medido em Chromium: Ativo 6,31:1 claro e 8,48:1 escuro;
Inativo 5,57:1 e 6,39:1. Cartão claro manteve fundo branco; a cor escura da área
de trabalho foi preservada. Medições não equivalem a auditoria completa WCAG.
Não houve alteração de banco, permissões ou contratos de domínio.

Aplicar os ajustes pendentes copiando styles.css, ResourcePage.tsx e CompanyToolbar.tsx
para a aplicação isolada e reiniciando Vite. Conferência manual no WSL pendente.
