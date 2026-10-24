# Criação e convites — implementação e preparação para validação local

Data inicial: 20/10/2026; atualização: 24/10/2026. Autorização: implementar e testar
em homologação, sem produção, merge ou publicação. Migrations 0021 e 0022 instaladas
no Ubuntu; retomada e primeiro acesso aprovados, com regressões adicionais pendentes.

## Problema e comportamento final

O fluxo anterior enviava convite antes de concluir o cadastro, ignorava erros
em perfil/papel/técnico/auditoria e podia devolver um link ao operador. Agora:

1. Schema estrito valida nome, e-mail, papel, status, telefone, módulos e escolha
   de técnico antes de qualquer chamada Auth. Autor precisa ser principal;
   consulta de autorização com erro é recusada mesmo se retornar valor verdadeiro.
2. RPC autenticada reserva identificador da operação, UUID de usuário e e-mail,
   vinculados ao autor e payload canônico imutável. Mesmo pedido retorna a mesma
   reserva. Outro pedido para e-mail reservado/existente é recusado. Conta anterior
   nunca é adotada, alterada ou excluída como fallback.
3. Auth cria o UUID reservado, e-mail não confirmado e senha aleatória descartada,
   com origem em app_metadata controlado pelo servidor. Triggers mantêm a conta
   pendente inativa, viewer e sem módulos/vínculo técnico. Sem envio nessa fase.
4. RPC confere origem/identidade e principal ativo sob locks. Perfil, papel,
   módulos, técnico, estado da operação e auditoria são gravados em uma transação.
   Técnico existente é revalidado e nunca tomado de outro usuário. Falha em
   qualquer gravação desfaz toda essa transação. Identidade Auth eventualmente
   criada continua pendente e restrita para retomada com o mesmo UUID.
5. Convite é solicitado somente depois do provisionamento. Intenção de envio é
   registrada antes de chamar Auth. Resposta contém IDs, estado e indicador de
   tentativa; não contém Auth response, senha, token ou action_link. Interface
   diferencia cadastro pendente, entrega pendente, aceite e ausência de novo envio.
6. Repetir criação concluída não refaz cadastro nem envia outro convite. Reenvio
   é ação explícita com confirmação, intervalo mínimo de 60s e exclusão mútua.
   Envio ainda em andamento exige 5 minutos antes de novo pedido explícito.
   Resultado antigo não pode sobrescrever uma tentativa posterior. Conta já
   confirmada não recebe convite adicional; isso é informado e auditado.
7. Erros 4xx de convite são registrados como recusados; falhas de transporte/5xx
   ou resposta inconclusiva são indeterminadas. Se gravação do resultado falhar,
   intenção permanece em andamento e resposta informa resultado desconhecido.
   Não ocorre reenvio automático. Aceite pelo Auth não comprova entrega.

A seção **Cadastros e convites**, exclusiva do principal autor, permite retomar
cadastros e reenviar convites sem gerar outra conta. Lista preserva as operações,
inclusive antigas. Bloqueios e permissões também são verificados no servidor.
Identidade Auth fica protegida contra troca de e-mail/UUID/origem e exclusão
quando a reserva ou envio estiver pendente, para proteger a resolução por e-mail.

## Migração e isolamento

Migration do fluxo: `0021_admin_user_creation_operations.sql`; correção de
compatibilidade obrigatória: `0022_allow_auth_creation_metadata_initialization.sql`.
Ambas preservam os arquivos históricos já publicados. Tabela de operações com RLS, sem leitura/escrita direta de usuários
ou escrita de service_role; service_role apenas lê. Seis RPCs autenticadas
revalidam principal ativo; helpers internos não são executáveis pelos clientes.
Novas proteções também atingem Auth, perfil, papel, módulos e vínculo técnico.

O aplicador `tests/homologation/apply-admin-creation.mjs` é independente de npm.
Exige API HTTP 127.0.0.1:55421 e container verificado
`supabase_db_iga-service-homologation`, porta DB 55422 somente em loopback.
Sem `--apply`, apenas confere pré-requisitos. Com `--apply`, aplica tudo em uma
transação e compara 11 funções, grants e cinco triggers. Instalação diferente
não é sobrescrita. Evidência/checksum ficam na pasta privada, sem chaves na saída.
Não roda migrations históricas, não reseta banco e não envia e-mail.

## Evidência de capacidade do Auth local

Operador executou `invitation-preflight.mjs` e informou três aprovações: UUID
reservado aceito na criação, convite para a mesma identidade não confirmada e
mensagem no Mailpit. Conta fictícia permaneceu inativa, sem módulos; convite de
diagnóstico não deve ser aberto. Diário privado exclusivo impede repetição
acidental. Nenhuma conta anterior foi alterada. Isso prova a capacidade do Auth
local, não o funcionamento completo do novo handler após a migration.

## Verificações executadas

- 31 testes unitários, incluindo schema, combinações de técnico e feedback.
- 78 testes de servidor/diagnóstico/aplicadores com Auth/framework substituídos.
  Incluem validação/autorização dos quatro endpoints, erros de consulta,
  identidade reservada, retomada após timeout, falha de provisionamento,
  ausência de envio antes de intenção persistida, respostas sem credenciais,
  repetição sem novo envio, reenvio explícito, resultado desconhecido e grants.
- 38 testes de criação em PostgreSQL 17.10 real, bancos descartáveis somente em
  loopback: validação SQL, todos os papéis/status, técnico novo/existente,
  proveniência, rollback por tabela/auditoria, falhas de autorização e concorrência.
- 22 regressões de atualização administrativa em banco com migration 0021,
  preservando a atomicidade e as regras da 0020.
- 35 testes de interface em Chromium: 32 anteriores e três para a lista de
  operações, retomada, bloqueio concorrente, entrega incerta e conta confirmada.
- TypeScript e ESLint dos helpers/componentes novos; diff sem erros de whitespace.
- Build em cópia sem `.env`, com URL/chaves sintéticas locais e guard de fetch
  externo. Nenhum deploy. Código de coordenação Auth permanece somente no servidor.

Os 60 testes de PostgreSQL usam schema mínimo Auth/storage para carregar as
migrations reais; não executam GoTrue nem SMTP. Registros em
`creation-invitation-results.json` distinguem execução isolada de evidência local.

## Aplicação e validação no Ubuntu

1. Preservar Docker/Supabase funcionando. Atualizar a branch pelo Git.
2. Executar o aplicador sem `--apply`; conferir isolamento. Executar depois com
   `--apply` no mesmo ambiente autorizado. Aplicar também a correção 0022 com
   `apply-auth-creation-initialization.mjs --apply` antes de testar o cadastro.
   Não copiar código novo para a aplicação antes de concluir as migrations.
3. Parar Vite com Ctrl+C. Copiar mantendo caminhos: `src/lib/admin-users.functions.ts`,
   `src/lib/admin-user-creation.ts`, `src/lib/admin-user-creation.server.ts`,
   `src/components/iga/AdminCreationOperations.tsx` e
   `src/routes/_authenticated/users.tsx`. Os helpers de atualização/recuperação
   já instalados permanecem necessários. Não copiar `.env` nem config de produção.
4. Reiniciar com `node ~/iga-homologacao/private/start-app.mjs`.
5. Como principal, criar usuário fictício exclusivo com papel Técnico, técnico
   novo e somente Chamados. Conferir cadastro, vínculo, módulos e auditoria após
   recarregar; estado de convite aceito e mensagem para destinatário no Mailpit.
   Não deve aparecer janela com link ao operador.
6. Abrir convite mais recente em sessão anônima deslogada, definir senha fictícia,
   testar novo login e módulos. Não mudar senhas das fixtures anteriores.
7. Verificar rejeição de e-mail repetido, reenvio após o intervalo e recusa
   administrativa comum. Falhas/concorrência já têm cobertura em banco descartável;
   não injetar falhas SQL no banco WSL que contém as evidências anteriores.

## Limites e operação de falhas

Auth, SQL e e-mail não compartilham transação. Pode existir identidade Auth
pendente; ela fica restrita, visível e retomável. Não prometer entrega exatamente
uma vez diante de rede incerta; reenvio explícito pode substituir o link anterior.
Conflito permanente de e-mail/técnico ou identidade alterada exige revisão,
sem editar payload reservado, adotar conta anterior ou excluir automaticamente.
Operações pertencem ao principal autor; eventual troca do principal exige revisão
explícita de pendências. Não foi implementado cancelamento/limpeza automática.

Na entrega inicial, aplicação da 0021 e validações reais ainda estavam pendentes.
O andamento local posterior e a correção necessária estão registrados abaixo.
Nenhuma autorização de produção ou Fase 2.

## Correção de compatibilidade Auth — 24/10/2026

Operador confirmou aplicação da 0021, verificação de permissões e atualização da
cópia local da aplicação. No primeiro cadastro técnico pela nova interface, a
operação ficou `reserved` / `not_requested`. Consulta somente leitura confirmou
nenhuma identidade Auth, perfil ou papel para o UUID reservado e zero módulos.
Nenhum convite do novo fluxo foi confirmado. Não é evidência de cadastro concluído.

Foi identificada e reproduzida uma lacuna dos testes anteriores: GoTrue cria o
usuário com metadata de provedor, faz atualizações internas (incluindo papel Auth)
e só depois aplica o app_metadata personalizado na mesma transação. O guard da
0021 exigia o marcador em toda atualização, bloqueando a etapa intermediária e
fazendo a criação Auth inteira reverter. O diagnóstico de capacidade ocorreu
antes da instalação desse guard; os testes SQL originais inseriam o marcador
junto com a linha, sem reproduzir a ordem interna. Fonte pública consultada:
https://github.com/supabase/auth/blob/master/internal/api/admin.go
(`adminUserCreate`, SetRole antes de UpdateAppMetaData). O teste não presume que
a fonte master seja idêntica à versão local; a reprodução SQL comprova o defeito
na sequência identificada, e o resultado final ainda depende da retomada no WSL.

A nova migration `0022_allow_auth_creation_metadata_initialization.sql` preserva
0021 e seu histórico. Permite intervalo inicial sem marcador somente se a operação
estiver reservada e o marcador estiver ausente tanto antes quanto depois da
atualização. UUID/e-mail continuam fixos. Marcador errado é recusado; após ser
gravado, não pode ser removido durante a reserva. Envio em andamento nunca usa
essa exceção. Exclusão continua bloqueada. Perfil permanece inativo, viewer e
sem módulos; a RPC de provisionamento ainda exige o marcador correto do servidor.

Cinco regressões novas exercitam ordem interna/rollback histórico, bloqueio sem
marcador, UUID/e-mail/marcador incorretos, preservação do marcador e aplicação da
correção sobre reserva já existente com retomada do mesmo UUID. Resultado:
43 testes de criação + 22 da atualização em PostgreSQL real, e 90 testes de
servidor/aplicadores simulados aprovados. Desses últimos, 20 verificam aplicadores
0021/0022, incluindo destinos remotos, portas expostas, drift e permissões indevidas.
Schema mínimo dos testes ganhou o campo Auth `role`, para reproduzir SetRole.
Não houve alteração do código de aplicação, build ou interface neste ajuste;
os resultados anteriores desses grupos permanecem como evidência histórica.

Aplicação local: atualizar Git e executar
`tests/homologation/apply-auth-creation-initialization.mjs --apply` com
IGA_HOMO_PRIVATE. O aplicador verifica container/portas locais, as 11 funções da
0021, permissões, RLS e cinco triggers antes de alterar apenas o guard em transação.
Recusa definições diferentes das duas versões revisadas e reconhece correção já
instalada. O aplicador da 0021 também reconhece a definição exata da 0022, sem
sobrescrevê-la. Evidência e checksum ficam privados.

Não recriar o pedido nem excluir a reserva. Após aplicação conferida, usar
**Retomar cadastro** na operação existente. Não é necessário copiar novamente
arquivos da aplicação nem reiniciar Supabase. Em instalação nova, aplicar também
0022 antes de validar criação. Ainda pendentes: aplicação da correção no WSL,
retomada com GoTrue real, convite do fluxo completo, primeiro acesso e regressões
manuais restantes. Nenhuma modificação de produção ou autorização de publicação.


## Retomada e primeiro acesso confirmados — 24/10/2026

Operador informou saída aprovada do aplicador 0022. Na operação já existente,
**Retomar cadastro** exibiu usuário cadastrado/envio de convite aceito. Após
recarregar, confirmou perfil Técnico, status Ativo, vínculo técnico e um módulo.
Convite recebido no Mailpit para a conta fictícia exclusiva do teste.

Em janela anônima sem sessão anterior, o convite abriu nova senha; conclusão
mostrou “Senha atualizada” e encaminhou a Chamados. Fechadas as janelas anônimas,
novo login com a senha escolhida funcionou. Acesso direto a `/companies` foi
recusado, com aviso e retorno a Chamados; menu exibiu somente Chamados.

Captura de auditoria confirmou **Cadastro reservado**, **Usuário criado**,
**Convite solicitado** e **Envio de convite aceito**, tendo principal como autor.
Mesmo operation_id nos quatro eventos e mesmo attempt_id no par solicitação/
aceite. Cadastro gravou papel technician, status active, módulo tickets e UUID
de técnico criado. Evidência é a captura/relato do operador, sem consulta remota
às credenciais nem contagem global de registros. Não é prova isolada de ausência
de toda duplicação; esse cenário será verificado a seguir.

Concluída validação local de retomada após correção, entrega e primeiro acesso.
Permanecem recusa real de e-mail duplicado, reenvio explícito antes da ativação e
recusa de criação pelo admin comum. A senha de primeiro acesso foi escolhida e
mantida apenas pelo operador. Sem acesso à produção/publicação.
