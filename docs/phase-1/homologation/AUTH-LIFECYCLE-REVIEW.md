# Revisão de criação, convites e recuperação de senha

Data: 20/10/2026. Código: `700c5f6`. Branch: `codex/iga-service-fase-1`.
Escopo autorizado nesta etapa: análise e testes isolados, sem correção da aplicação.

## Conclusão

Há riscos relevantes ainda abertos nesses fluxos, separados da atualização
atômica e do login já corrigidos. Recomenda-se tratar a recuperação privilegiada
e o formulário de nova senha antes das melhorias visuais.

Não foi acessada produção nem executado um teste de tomada de conta real.
Os resultados abaixo são reprodução da lógica original com substitutos em
memória e de submissão HTML com senha fictícia e requisições interceptadas.

## Achados por prioridade

| Prioridade | Achado | Evidência e efeito |
| --- | --- | --- |
| Crítica | Administrador comum pode solicitar link de recuperação tendo o principal como alvo | `sendPasswordReset` verifica apenas admin + módulo Usuários; não consulta alvo, papel ou principal. A simulação devolveu link ao administrador comum. Se o Auth emitir o link válido, ele concede ao solicitante um meio de recuperar a conta privilegiada. Não foi gerado token real. |
| Alta | Nova senha pode ir para URL antes de o JavaScript interceptar o formulário | `/reset-password` não utiliza `AuthForm`, não define POST e mantém o campo habilitado no HTML inicial. Navegador sem JavaScript reproduziu GET com senha fictícia na query. Não é uma regressão do `/auth`, que continua protegido. |
| Alta | Convite é enviado antes de concluir o cadastro | Falha posterior em módulos ou novo técnico retorna erro com conta Auth já criada e convite já solicitado/enviado no cenário simulado. Não há recuperação coordenada. |
| Alta | Erros de perfil, papel e vínculo técnico são ignorados na criação | Retornos `.error` de update/upsert não são conferidos. Foi reproduzido sucesso com status diferente do solicitado, papel não atualizado ou técnico não vinculado. |
| Alta | Auditoria pode falhar silenciosamente | `logAudit` ignora o resultado. Criação retornou sucesso sem registro; recuperação devolveu link mesmo com falha na auditoria. A transação de atualização corrigida não usa esse fluxo antigo. |
| Média | Fallback pode finalizar sem convite nem link | Falha em convite leva a createUser; erro de generateLink não é tratado. Simulação retornou sucesso, `emailSent=false` e ausência de link. |
| Média | Validação da criação é apenas tipagem TypeScript | Input validator devolve o objeto sem schema runtime. Nome/e-mail têm validação mínima e módulos desconhecidos são descartados; papel, status, UUID e combinações precisam de validação explícita antes do Auth. |
| Média | Caminho de convite/recovery administrativo não define redirectTo | inviteUserByEmail e generateLink não configuram `/reset-password`; comportamento depende do site_url e configuração do Auth. Destino real, expiração, uso único e repetição de convites não foram testados nesta revisão. |

Referências de código: `src/lib/admin-users.functions.ts` (createAdminUser,
sendPasswordReset, logAudit), `src/routes/reset-password.tsx` e
`src/routes/_authenticated/users.tsx` (exibição de actionLink em window.prompt).

### Limites positivos confirmados

- A criação pelo administrador comum é recusada antes de chamar Auth.
- Perfil Visualização não pode executar a recuperação administrativa.
- O cenário sem falhas da criação pelo principal conclui as etapas esperadas.
- O login `/auth` já utiliza o formulário protegido.
- A atualização de usuário continua na RPC atômica da migration 0020;
  nenhum código desse mecanismo foi modificado nesta revisão.

## Método e resultados

- 12 cenários dos handlers originais transpilados em memória, com framework,
  Auth e banco substituídos. Três são controles e nove reproduzem comportamentos
  de risco/erro; não são 12 aprovações funcionais do produto.
- Renderização da página original de nova senha com substitutos de roteador/UI,
  seguida de submissão em Chromium com JavaScript desativado. Todas as requisições
  foram interceptadas; não houve servidor/Auth/banco recebendo a senha fictícia.
- Asserções conferiram os resultados esperados dos cenários diagnósticos.
- Evidência sem senhas, tokens ou links recuperáveis:
  [auth-lifecycle-review-results.json](auth-lifecycle-review-results.json).

Essa metodologia confirma ordem, validações ausentes e semântica HTML. Não
confirma comportamento de entrega SMTP, validade de tokens ou exploração em
produção. Não foram acionados Mailpit, provedores de e-mail ou usuários do WSL.

## Próxima implementação proposta

### Lote A — recuperação e nova senha

1. Reutilizar o formulário seguro na página de nova senha, bloqueando campos
   antes da montagem, mantendo POST e a submissão via SDK após montagem.
2. Receber ID de alvo validado na recuperação administrativa e resolver no
   servidor seu perfil, papel e e-mail de Auth. Não confiar na classificação
   fornecida pelo navegador.
3. Proposta de matriz: administrador comum solicita recuperação somente de
   usuários não administradores; não pode obter recuperação de principal ou
   outro administrador. Principal pode solicitar recuperação de outros usuários.
   Recuperação da própria conta permanece por e-mail no fluxo de autoatendimento.
4. Não devolver bearer links ao operador. Preferir entrega ao e-mail verificado
   do titular. Auditar intenção antes da operação externa e seu resultado,
   identificando ator e alvo; se o primeiro registro falhar, não iniciar a ação.
5. Aplicar respostas que não exponham tokens, URLs com credenciais ou detalhes
   técnicos ao usuário. Testar sessão ausente e link inválido/expirado/usado.

A matriz acima é uma proposta para autorização, não uma nova regra aplicada.
O envio externo não é reversível por uma transação SQL. Falha de entrega ou de
registro posterior precisa de estado explícito, sem comunicar sucesso incorreto.

### Lote B — criação e convites

1. Validar o pedido completo e a autorização antes de chamar Auth.
2. Registrar uma operação com identidade/idempotência e provisionar a conta
   sem disponibilizar um convite utilizável antes da conclusão do cadastro.
3. Gravar perfil, papel, módulos, técnico e auditoria numa transação própria.
4. Coordenar Auth e banco com estados de andamento/falha e retomada controlada;
   Auth e SQL não compartilham uma única transação. Uma RPC isolada não resolve
   sozinha o fluxo distribuído. Nunca apagar automaticamente uma conta preexistente.
5. Separar cadastro concluído de entrega pendente. Falha SMTP não deve criar
   outro usuário nem emitir falso sucesso. Repetições devem reconhecer a operação.
6. Definir o mecanismo de convite após testar no Auth local quais operações
   suportam contas previamente provisionadas; não presumir que inviteUserByEmail
   funcionará para qualquer conta existente.

Persistência do estado e provisionamento transacional podem exigir nova migration.
Nenhuma migration foi criada ou aplicada nesta revisão. Preservar 0000 a 0020.

## Aceitação para os lotes de correção

- Principal protegido no endpoint, mesmo com requisição construída diretamente.
- Operador não recebe token/link recuperável de outra conta.
- Sem senha na URL com JavaScript ausente, lento ou com falha.
- Dados inválidos não iniciam criação, convite ou recuperação.
- Falhas de papel/módulos/técnico/auditoria não retornam sucesso de provisionamento.
- Repetição após erro não duplica usuário e não altera contas preexistentes.
- Link chega somente ao Mailpit local e aponta para a rota local correta.
- Testar expiração, uso único, reenvio, alvo inexistente e perfis não autorizados.
- Preservar atualização atômica, Domínio, categorias, chamados e integração WhatsApp.

Estado final: revisão concluída; correções e testes reais de Auth/Mailpit ainda
dependem do próximo lote autorizado. Sem mudanças de produto, migrations,
credenciais, merge, publicação ou Fase 2.

## Atualização de 20/10/2026 — primeiro lote autorizado

Implementação de recuperação e nova senha registrada em
[SECURITY-PASSWORD-RECOVERY.md](SECURITY-PASSWORD-RECOVERY.md).
Regressões isoladas passaram; a entrega e o ciclo de token no Auth/Mailpit do
Ubuntu ainda precisam de validação. Achados de criação/convite permanecem abertos.
