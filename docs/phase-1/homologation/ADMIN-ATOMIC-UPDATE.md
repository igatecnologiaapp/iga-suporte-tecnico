# Atualização administrativa atômica

Data: 20/10/2026. Branch: `codex/iga-service-fase-1`. Base: `fd2b9a7`.

## Implementação

O problema reproduzido em [ADMIN-PARTIAL-UPDATE-REVIEW.md](ADMIN-PARTIAL-UPDATE-REVIEW.md)
foi tratado em duas camadas:

1. `admin-user-update.ts` valida campos, UUIDs, perfis, status e módulos.
   O handler faz somente leituras para verificar alvo e permissões antes
   de qualquer solicitação de escrita. Erros de consulta impedem a operação.
2. A migration nova `0020_atomic_admin_user_update.sql` adiciona a RPC
   `update_admin_user_atomic`. Perfil, papel, módulos, técnico e auditoria
   são gravados na mesma transação PostgreSQL. Qualquer erro desfaz o conjunto.

As migrations `0000` a `0019` não foram alteradas. A migration nova foi registrada
no journal do Drizzle. Não modifica políticas RLS existentes, colunas ou registros
de empresas, Domínio, categorias, chamados ou WhatsApp.

## Autorização e concorrência

- A RPC usa o cliente autenticado do chamador. Não recebe ID de ator como parâmetro.
- A identidade é obtida por `auth.uid()`; o servidor não usa a service role para
  executar a mutação. O cliente administrativo existente é usado apenas nas
  consultas de pré-validação e na autorização central `assertPrimary`.
- Execução da RPC revogada de PUBLIC, anon e service_role; concedida a authenticated.
  O corpo SECURITY DEFINER verifica administrador ativo e módulo Usuários.
- Mudança de papel/módulos continua exclusiva do principal. O administrador comum
  mantém alterações básicas e de status permitidas para os demais usuários.
- Mantidas as proteções do principal e do último administrador ativo.
- Vínculo técnico deve existir e estar disponível, conforme as opções da interface.
- A função repete as validações sob locks, evitando usar apenas dados lidos antes
  da transação. Solicitações concorrentes e revogação de acesso foram testadas.
- Locks SHARE ROW EXCLUSIVE nas cinco tabelas administrativas serializam escritas
  durante a breve transação; consultas continuam permitidas. Não há chamadas de
  rede sob esses locks. Escritas administrativas concorrentes podem aguardar.
- Auditoria usa os mesmos nomes de ações e campos de banco. Falha nela desfaz
  os dados em vez de retornar um sucesso sem o registro esperado.

## Resultados executados

| Verificação | Resultado |
| --- | --- |
| Testes transacionais em PostgreSQL 17.10 real | 22 aprovados |
| Testes unitários, incluindo Domínio/categorias | 16 aprovados |
| Handler original com dependências simuladas | 9 aprovados |
| Proteções do auxiliar de migration com Docker/SQL simulados | 5 aprovados |
| Interface com serviços simulados, incluindo login seguro | 25 aprovados |
| TypeScript | Aprovado |
| Build sem `.env`, com variáveis sintéticas locais | Aprovado |
| ESLint dos arquivos novos | Zero erros/avisos |
| ESLint global | 2057 erros e 9 avisos; ver resumo estruturado |

Evidência: [admin-atomic-results.json](admin-atomic-results.json).

Os testes reais aplicaram as 20 migrations históricas sem alteração e a 0020
em bancos novos de um cluster temporário, restrito a loopback. Exercitaram:

- Rejeição integral de solicitações mistas com perfil/módulos proibidos.
- Rollback por falha em perfil, papel, inclusão de módulos após remoção,
  novo vínculo após desvinculação e auditoria após as demais alterações.
- Alteração válida do conjunto e registro do ator correto.
- Rejeição de ator forjado, conta inativa, não administrador, ausência do módulo,
  alvo inexistente, técnico ocupado, campos e valores inválidos.
- Principal protegido, último administrador ativo, desvinculação explícita
  e lista vazia de módulos conforme as operações existentes.
- Duas atualizações concorrentes sem combinação parcial dos estados.
- Revogação concorrente de permissão, reavaliada antes de gravar.

O cluster usa PostgreSQL nativo obtido pelo pacote npm
`@embedded-postgres/linux-x64@17.10.0-beta.17` com verificação de integridade npm.
Os contratos mínimos dos schemas auth/storage são fixtures de teste. Não são
os serviços Supabase Auth/Storage nem um teste de transporte PostgREST.

## Repetição dos testes

```bash
npm --prefix tests run test:unit
npm --prefix tests run test:admin-handler
npm --prefix tests run test:admin-migration-helper
npm --prefix tests test
IGA_ATOMIC_TEST_DB=postgres://USUARIO_LOCAL@127.0.0.1:55432/iga_atomic_test_NOME npm --prefix tests run test:transactions
```

O último comando exige banco descartável novo, sem tabelas de aplicação.
O runner recusa destino remoto, porta diferente de 55432/55422, nome de banco
fora do prefixo `iga_atomic_test_` e banco já inicializado. Ele cria fixtures,
aplica migrations e usa triggers sintéticos de falha somente nesse banco.
Cada repetição precisa de outro banco vazio. Não executar contra o banco
de homologação com os cadastros manuais.

## Aplicação no Supabase local do Windows/WSL — ainda pendente

O computador do usuário não foi modificado por esta implementação.
Não copiar o novo handler para a aplicação antes de aplicar a migration local.

Após atualizar a branch, no Ubuntu, dentro do repositório:

```bash
export IGA_HOMO_PRIVATE="$HOME/iga-homologacao/private"
node tests/homologation/apply-admin-atomic.mjs
```

O auxiliar não usa credenciais de banco do `.env`. Verifica a API local, o nome
exato do container, porta PostgreSQL 55422 publicada somente em loopback e
pré-requisitos de schema. Sem `--apply`, apenas verifica. Para aplicar:

```bash
node tests/homologation/apply-admin-atomic.mjs --apply
```

O SQL é executado por `docker exec` somente no container
`supabase_db_iga-service-homologation`, em uma transação. O auxiliar verifica
body e privilégios se a RPC já existir e recusa substituição automática
de função divergente. Registra checksum e evidências sem segredos em
`admin-atomic-local-migration.json`. Inclui recarga do schema PostgREST.
Esse auxiliar passou por sintaxe/lint e cinco testes com Docker/SQL simulados
(recusa de destino remoto/exposto, aplicação explícita e repetição segura); sua execução
contra o Docker Desktop precisa da próxima validação acompanhada no WSL.

Depois, parar o Vite e copiar somente os dois arquivos:

```bash
cp src/lib/admin-users.functions.ts ~/iga-homologacao/app/src/lib/admin-users.functions.ts
cp src/lib/admin-user-update.ts ~/iga-homologacao/app/src/lib/admin-user-update.ts
node ~/iga-homologacao/private/start-app.mjs
```

Validar com contas fictícias: edição básica por administrador comum, bloqueio de
perfil/módulos e alteração autorizada pelo principal, verificando persistência
e auditoria. A confirmação pela API Supabase e interface do WSL está pendente.

## Limites deste lote

- O fluxo de criação/convites e a redefinição de senha não fazem parte desta
  transação de atualização. Operações que envolvem Auth exigem revisão própria.
- Os arquivos antigos de resultados são evidências históricas, não resultados
  reexecutados nesta versão.
- Nenhuma migration ou operação foi executada em produção, nem no banco WSL
  do usuário. Sem merge, publicação ou Fase 2.
- Melhorias visuais e confirmação de saída continuam fora deste lote.

## Arquivos deste lote

- `src/lib/admin-user-update.ts` e `src/lib/admin-users.functions.ts`.
- `drizzle/migrations/0020_atomic_admin_user_update.sql` e `meta/_journal.json`.
- `tests/unit/admin-user-update.test.ts`.
- `tests/transactions/bootstrap.sql`, `admin-user-update.test.mjs`,
  `admin-user-handler.test.mjs` e `admin-user-migration-helper.test.mjs`.
- `tests/homologation/apply-admin-atomic.mjs` e scripts em `tests/package.json`.
- Este relatório, `admin-atomic-results.json` e referência no diagnóstico anterior.

## Ajuste encontrado na validação acompanhada no WSL

O usuário confirmou edição básica por principal e administrador comum, bloqueio
de perfil/módulos para o comum e auditoria com os atores e valores corretos.
Ao editar módulos da conta fictícia restricted (Técnico sem cadastro vinculado),
a validação recusou `technicianId = "new"` antes de qualquer gravação.

A interface antiga usava o sentinela de criação também como valor inicial de
edições sem vínculo. O componente `UserTechnicianSelect` agora seleciona
"Sem vínculo" ao editar e oferece "Criar cadastro a partir deste usuário"
somente no fluxo de criação. UUIDs válidos existentes continuam preservados;
a validação estrita e a migration 0020 não foram enfraquecidas ou alteradas.

Verificação deste ajuste: 17 testes unitários e 28 de interface aprovados,
TypeScript e build isolado aprovados, lint dos arquivos novos/alterados de
teste aprovado. Três casos de navegador cobrem edição sem vínculo, preservação
do vínculo existente e opção de criação no cadastro. Eles usam o componente
real com fixtures, sem Auth/banco. Testes SQL anteriores não foram reexecutados
porque a migration e a função transacional não mudaram neste ajuste.
A repetição de inclusão e remoção de módulos no WSL foi confirmada pelo usuário,
conforme o registro manual abaixo.

Atualizar somente a cópia de `src/routes/_authenticated/users.tsx` e o novo
`src/components/iga/UserTechnicianSelect.tsx`, depois reiniciar o Vite.
Não executar novamente migrations, seed ou rotinas de recuperação.

Sugestão visual registrada pelo usuário: cursor e indicação mais claros para
o campo Perfil de acesso desabilitado. Essa melhoria não foi implementada.

### Sugestão visual do usuário — destaque de auditoria recente

Em 20/10/2026, o usuário solicitou registrar para a futura melhoria visual:
exibir uma pequena bolinha azul-clara à esquerda do título dos registros
mais recentes na Auditoria administrativa, destacando as novas alterações.

Não implementado neste lote. O critério de "recente" e quando o destaque deve
desaparecer serão definidos na etapa visual; não se presume controle de leitura
por usuário. Prever contraste nos dois temas e indicação acessível que não
dependa somente da cor, sem alterar registros, permissões ou regras de auditoria.

## Resultados manuais informados no Windows/WSL — 20/10/2026

Após aplicação local da 0020 e atualização da cópia da aplicação, o usuário
confirmou nesta conversa:

- Edição de nome pelo principal e pelo administrador comum persistida após
  recarregar, preservando perfil e módulos.
- Perfil e módulos bloqueados na interface do administrador comum.
- Auditoria das edições básicas com os atores e valores anteriores/novos corretos.
- Após o ajuste do seletor, inclusão de Contatos na conta fictícia restricted,
  mantendo Chamados, com persistência após recarregar.
- Auditoria da inclusão por Homologação primary, de `["tickets"]` para
  `["contacts","tickets"]`.
- Remoção posterior de Contatos, persistida após recarregar, restaurando a conta
  para somente Chamados.
- Auditoria da remoção por Homologação primary, de `["contacts","tickets"]`
  para `["tickets"]`, mostrada na captura enviada nesta conversa.

São verificações manuais do usuário, não novas execuções automatizadas.
Rollback e concorrência foram verificados no PostgreSQL temporário descrito
acima, sem injeção de falhas no banco de cadastros manuais do WSL.
Após novo login da conta restricted, o usuário confirmou somente Chamados
disponível no menu. Tentativas de acesso a outros módulos redirecionaram de
volta para Chamados, com o aviso "Você não tem permissão para acessar este
módulo.", conforme captura enviada na conversa em 20/10/2026.

Isso conclui a validação manual acompanhada deste lote de atualização atômica.
Não equivale à homologação de todos os fluxos administrativos: criação/convites
e recuperação de senha continuam fora do escopo, assim como as melhorias visuais.
As capturas desta confirmação estão na conversa; não foram anexadas ao Git
por este registro de documentação.
