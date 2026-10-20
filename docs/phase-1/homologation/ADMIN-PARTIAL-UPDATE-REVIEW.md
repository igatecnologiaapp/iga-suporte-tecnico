# Revisão de atualização parcial de usuários

Data: 20/10/2026. Código analisado: `d47292a`.
Escopo: investigação, sem alteração da aplicação ou de banco.

## Conclusão

O risco foi reproduzido em simulação isolada do código original. Uma operação
pode retornar erro depois de persistir parte das alterações. Uma falha na
auditoria pode ser ignorada e a operação retornar sucesso sem o registro esperado.
Isso não comprova ocorrência em produção nem uma mudança indevida de perfil.
A autorização de mudança de perfil/módulos continua recusando o administrador comum;
o problema é que essa recusa pode acontecer depois das gravações permitidas.

## Evidências

Arquivo principal: `src/lib/admin-users.functions.ts`, função `updateAdminUser`.

| Cenário | Resultado reproduzido | Prioridade |
| --- | --- | --- |
| Administrador comum envia nome e novo perfil | Nome gravado e auditado; mudança de perfil recusada; solicitação termina com erro | Alta |
| Administrador comum envia nome e novos módulos | Nome gravado e auditado antes da recusa dos módulos | Alta |
| Principal altera nome e perfil; gravação de perfil falha | Nome permanece alterado, apesar do erro final | Alta |
| Remoção de módulos funciona; inclusão dos novos falha | Módulos antigos removidos sem reposição e sem auditoria final | Alta |
| Desvinculação do técnico funciona; novo vínculo falha | Vínculo antigo perdido, apesar do erro final | Alta |
| Gravação de auditoria retorna erro | Nome atualizado e função retorna sucesso sem auditoria | Alta |
| Controle: administrador comum altera apenas nome | Sucesso e auditoria, conforme regra atual | Comportamento esperado |

O cenário adicional que injeta falha em ambas as atualizações de técnicos não
altera vínculos: a primeira falha é ignorada e a segunda lança erro. Não deve
ser confundido com o cenário que permite a desvinculação e falha apenas depois.

Resultados: [admin-partial-review-results.json](admin-partial-review-results.json).

### Ordem das operações

- Linhas 129–131: consultas iniciais não verificam explicitamente os erros retornados.
- Linhas 144–153: perfil básico e auditoria gravados.
- Linhas 156–161: autorização para mudar papel verificada somente neste ponto.
- Linhas 164–170: técnico antigo desvinculado antes do novo vínculo; erro da
  desvinculação não é tratado.
- Linhas 172–181: autorização de módulos tardia e remoção/inclusão separadas.
- `logAudit`: resultado do insert não é verificado.
- Cada chamada Supabase é uma operação separada; não há transação envolvendo o conjunto.

Na interface normal, perfil e módulos estão bloqueados para o administrador comum.
O formulário ainda envia dados básicos e o perfil atual na mesma solicitação;
requisições construídas diretamente também precisam ser recusadas antes de gravar.
Mesmo o administrador principal pode encontrar atualização parcial por falha técnica.

## Método e limites

O handler original foi transpilado em memória. Framework, contexto autenticado e
cliente Supabase foram substituídos por simuladores com estado e falhas controladas.
O último cenário de técnicos executou isoladamente seu bloco original.
Nenhum endpoint, usuário real ou banco foi acessado. Os cenários demonstram
ordem e ausência de rollback no código; não substituem teste de integração com
PostgreSQL e RLS, que deverá ser feito exclusivamente no Supabase local.

## Correção recomendada, ainda não implementada

1. Construir e validar o plano completo da alteração antes de escrever: entradas,
   existência do alvo, permissões por ação, proteção do principal e vínculos.
   Tratar explicitamente todos os erros de leitura e escrita.
2. Tornar atômicas as alterações de perfil, papel, módulos, vínculos e auditoria
   em uma única transação PostgreSQL. Uma RPC adequadamente autorizada é uma
   alternativa; identidade do ator deve vir de contexto confiável, e não de
   parâmetros livremente escolhidos pelo cliente.
3. Uma falha de auditoria deve impedir o commit do conjunto. Evitar rollback
   manual por chamadas HTTP sucessivas, sujeito a falhas e concorrência.
4. Manter as regras existentes e revisar o diff antes de validar no ambiente local.

Antecipar as autorizações resolve as recusas tardias, mas não torna várias
requisições HTTP atômicas. Uma solução transacional pode exigir nova migration;
isso precisa de autorização específica. Não alterar migrations históricas até 0019.

## Regressões necessárias no lote de correção

- Solicitação recusada por perfil/módulos deixa todos os dados inalterados.
- Erros após nome, papel, remoção de módulos e desvinculação não deixam efeitos parciais.
- Falha de auditoria impede alteração dos dados e não retorna sucesso.
- Atualização válida preserva funcionalidades do administrador comum e do principal.
- Usuário inexistente, dados inválidos e módulos/vínculos inválidos não geram gravações.
- Testes de concorrência da alteração transacional, além dos testes de RLS.
- Confirmar ausência de regressões em Domínio, empresas e categorias.

Não foram realizadas correções de produto, migrations, merge, publicação ou Fase 2.
