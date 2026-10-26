# Organização e filtros de Empresas — 26/10/2026

Implementação autorizada a partir das referências clara e escura fornecidas pelo
operador. Escopo inicial: Empresas; padrão de status compartilhado nos cadastros.
Aplicação e conferência manual no WSL pendentes. Sem publicação.

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
  filtros restaura pesquisa/categoria vazias, Ativas e ordenação A–Z.
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
  tokens anteriores. Divisórias e alinhamento reforçam as colunas da tabela.
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
