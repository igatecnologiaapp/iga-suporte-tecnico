# Paginação no banco, navegação e ícones — 26/10/2026

## Resultado

A pedido do operador, a paginação também ocorre nas consultas ao banco nesta
rodada. Empresas, Contatos, Técnicos, Categorias, Chamados, Usuários e a tabela
de eventos de Integrações abrem com cinco registros. O rodapé permite páginas
anterior/próxima e tamanhos 5, 10, 20 ou 50. Eventos preservam o recorte anterior
dos vinte mais recentes; seu resumo de último evento independe da página.

Buscas, situação, categoria, domínio e filas são aplicados antes do limite.
Contadores de situação e filas consideram todo o conjunto autorizado que
corresponde aos filtros, e os cartões de Empresas preservam os totais gerais.
Mudar filtros/tamanho retorna à primeira página; uma página que deixou de existir
é ajustada pelo servidor. Ordenação usa nome, identificador estável e collation
ICU portuguesa com ordenação numérica. Listas de opções dos formulários continuam
carregando os catálogos necessários; são distintas dos registros completos da tabela.
O aviso informativo de domínio repetido consulta até dois correspondentes no
banco, incluindo empresas fora da página/filtros atuais.

A migration 0023 acrescenta uma função de leitura SECURITY INVOKER, mantendo
RLS e grants existentes, exigindo identidade ativa e módulo autorizado. Limita
entidades, tamanhos e filtros; parâmetros não são interpolados em SQL. Contatos
privados de técnicos continuam sujeitos ao RPC existente. Usuários mantêm a
autorização administrativa e consultam Auth somente para os IDs da página.
Nenhuma senha, cadastro ou política existente é alterado pela migration.

A barra superior desliza para cima ao rolar a página para baixo e reaparece
quando a rolagem sobe. Permanece visível no início, com menu móvel aberto e com
foco de teclado nos seus controles; respeita movimento reduzido. Rolagem interna
de tabelas/janelas não aciona esse comportamento. Nomes de Empresas e Contatos
recebem, respectivamente, ícone azul de prédio e de pessoa, decorativos.

Durante a troca de página os registros anteriores ficam inertes até a resposta;
respostas antigas não substituem buscas novas. Falhas mostram nova tentativa.
Não há fallback para carregar toda a tabela no navegador.

## Verificação isolada

- 70 testes de interface passaram na suíte completa; oito cobrem a nova
  paginação/barra/ícones. Após a revisão do aviso de domínio, seu cenário
  específico também passou com a empresa correspondente fora do filtro atual.
- 43 testes unitários e 85 testes de funções administrativas/recuperação/
  aplicadores passaram. Incluem paginação administrativa e validação do alvo local.
- Seis testes em PostgreSQL real descartável passaram com todas as migrations:
  páginas, ordenação, totais, filtros, filas, privacidade e recusas por permissão.
- TypeScript, lint dos novos componentes/hooks/helper e build de produção em
  cópia isolada sem .env aprovados. Não houve limpeza do passivo de lint global.
- Interface usa serviços sintéticos; PostgreSQL usa identidade sintética e não
  substitui a conferência manual do Auth/Supabase no Ubuntu do operador.
- Capturas sintéticas em screenshots/pagination-*; nenhum serviço externo,
  credencial real, envio de e-mail ou alteração de senha foi utilizado.

## Aplicar no Ubuntu de homologação

Manter Supabase ligado. Parar somente Vite com Ctrl+C. No repositório local,
atualizar a branch e aplicar a migration antes de copiar os arquivos:

```bash
cd ~/projetos/iga-service-homologacao
(
  set -e
  git pull --ff-only
  IGA_HOMO_PRIVATE="$HOME/iga-homologacao/private" node tests/homologation/apply-pagination.mjs --apply
  cp --parents \
    src/components/iga/{AppShell,CompanyOverview,CompanyToolbar,ResourcePage,RecordName,TablePager}.tsx \
    src/components/iga/{useAutoHideHeader,usePagedRecords}.ts \
    src/integrations/supabase/types.ts \
    src/lib/{list-pagination,admin-users.functions,whatsapp.functions}.ts \
    src/routes/_authenticated/{tickets.index,users,integrations}.tsx \
    src/styles.css "$HOME/iga-homologacao/app/"
  node "$HOME/iga-homologacao/private/start-app.mjs"
)
```

O aplicador verifica API e porta Docker locais, pré-requisitos, ICU e definição/
permissões da função. Aplica somente a migration 0023 numa transação, sem reset.
Se já instalada, confere a definição. Registra evidência na pasta privada. Sem
--apply faz apenas a pré-verificação quando a função ainda não existe.
Se qualquer etapa falhar, o bloco interrompe antes de copiar/iniciar a aplicação.

Conferir em http://127.0.0.1:4180: cinco itens por página com volume suficiente,
próxima/anterior, busca e contadores, categorias/domínio, filas de Chamados,
ícones de Empresas/Contatos, barra ao descer/subir e temas claro/escuro. Papéis
sem escrita devem continuar sem ações de alteração. Validar a página restante
ao arquivar um cadastro fictício, sem executar exclusão definitiva.

Aplicação e conferência no WSL permanecem pendentes do operador. Não há merge,
publicação ou mudança de fase. A modernização completa de Contatos continua como
próxima etapa visual, além dos ícones/paginação já compartilhados nesta rodada.
