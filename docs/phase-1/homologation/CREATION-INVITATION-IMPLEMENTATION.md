# Criação e convites — implementação autorizada, em andamento

Autorização do operador em 20/10/2026: implementar e testar exclusivamente em
homologação, sem produção/publicação. Este lote sucede a validação de recuperação.

## Contrato proposto para a implementação

1. Validar pedido completo e exigir principal ativo com módulo Usuários antes
   de qualquer operação Auth. Revalidar autorização na transação SQL. Não aceitar
   campos extras, módulos desconhecidos, papel/status inválidos ou sentinela
   `new` como UUID de técnico. Nome/e-mail normalizados e combinações explícitas.
2. Reservar uma operação persistente por identificador idempotente e payload
   imutável, vinculados ao autor. Reservar UUID do novo usuário e e-mail; não
   adotar, editar ou excluir automaticamente conta Auth anterior com mesmo e-mail.
3. Criar somente a identidade reservada no Auth, sem confirmação de e-mail e sem
   convite. Identificar sua origem em app_metadata controlado pelo servidor.
   Conta fica inativa, sem módulos, antes de completar provisionamento.
4. Conferir identidade e origem; gravar perfil, papel, módulos, técnico e auditoria
   numa transação. Revalidar técnico disponível. Em erro, nenhuma alteração parcial
   do cadastro torna-se disponível. Uma identidade Auth pendente pode existir;
   deve permanecer restrita e ser retomada pelo mesmo identificador.
5. Registrar tentativa de entrega antes de pedir convite ao Auth. Enviar somente
   após o cadastro estar provisionado. Não gerar/retornar action_link ao operador.
   Destino configurado no servidor, `/reset-password` na homologação local.
6. Serializar tentativas e registrar fase/resultado. Repetição da criação não
   cria outro usuário, técnico, auditoria ou envio. Falha de entrega não desfaz
   cadastro concluído; permite reenvio explícito. Resultado indeterminado por
   timeout não deve ser rotulado como falha certa nem repetido automaticamente.
7. Interface distingue cadastro pendente, cadastro pronto com entrega pendente,
   envio aceito pelo Auth e entrega indeterminada. Aceite não garante recebimento.
   Operações pendentes precisam continuar visíveis e retomáveis pelo principal.

A coordenação Auth/SQL não constitui uma transação distribuída. Serão necessárias
nova migration e RPCs próprias; preservar migrations 0000–0020 e atualização 0020.
O desenho será consolidado após comprovar o mecanismo real de convite no Auth.

## Preparação entregue nesta etapa

- `src/lib/admin-user-creation.ts`: schema estrito ainda NÃO conectado ao handler
  antigo. Três testes novos; suíte unitária completa com 29 aprovações.
- `tests/homologation/invitation-preflight.mjs`: diagnóstico Node sem dependências
  npm, permitido somente em HTTP 127.0.0.1:55421 e pasta privada fora do Git.
  Exige principal local existente; cria UUID/e-mail exclusivos, confirma que o
  Auth aceitou o UUID e que o usuário está não confirmado. Torna perfil inativo,
  confere viewer e ausência de módulos, envia convite para a identidade já criada,
  exige o mesmo UUID, origem preservada e mensagem ao destinatário no Mailpit.
  Não lê nem imprime link/token/senha e não altera contas anteriores. Senha
  aleatória é descartada; não há login previsto para a conta de diagnóstico.
- Diário privado exclusivo `invitation-preflight.json` impede repetição acidental.
  Se houver falha, não apagar o diário nem repetir sem revisar a fase; envio
  pode ter sido aceito apesar de uma falha de rede.
- Dez cenários simulados do diagnóstico passaram: controle positivo, destino
  remoto, diário existente, timeout de criação, UUID divergente, confirmação
  inesperada, falha de isolamento, papel admin inesperado, falha de convite e
  UUID divergente na resposta do convite. Nenhuma chamada real nesta preparação.
- TypeScript e ESLint dos helpers novos/alterados passaram. Corrigida também
  anotação de propriedades opcionais no helper de recuperação para compatibilidade
  com `exactOptionalPropertyTypes`; sem alteração de comportamento.

## Dependência atual

É necessário executar o diagnóstico no Auth/Mailpit do Ubuntu para comprovar
convite de conta não confirmada já provisionada. A API do SDK admite UUID na
criação e convite de e-mail, mas isso não comprova a semântica do serviço local.
A infraestrutura completa de Supabase não está disponível no ambiente de código;
por isso a verificação real exige o Ubuntu do operador. Não aplicar migration,
não substituir o fluxo de criação e não declarar implementação concluída antes
dessa evidência. Não abrir o convite de diagnóstico: a conta deve ficar inativa.

Após o resultado: consolidar migration/coordenação/retomada, conectar handler e
interface, executar testes de falha e concorrência em PostgreSQL isolado, build,
regressões e depois aplicação/validação exclusivamente no Supabase local.
