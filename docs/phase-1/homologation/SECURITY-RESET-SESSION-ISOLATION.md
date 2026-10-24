# Isolamento da sessão de convite e recuperação — 24/10/2026

## Evidência e causa

Durante a verificação manual de reenvio, o operador abriu acidentalmente um
convite anterior da conta “convite completo”, salvou senha e mostrou tela
“Senha atualizada” com **Homologação primary** conectado. Em seguida, tentativa
com convite antigo da conta de reenvio mostrou erro genérico de atualização.
Isso não comprova reutilização nem expiração de OTP: havia confusão de sessão.
O operador confirmou ter guardado a senha digitada; nenhuma senha foi enviada.

O código anterior verificava somente `supabase.auth.getSession()`. Uma sessão
comum persistida podia satisfazer essa condição após callback inválido/usado,
e `updateUser` recebia a senha para essa sessão. A SDK também podia persistir a
sessão de um callback válido sobre o login de outra aba. O teste anterior com
sessão vazia não cobria o caso de principal já conectado.

Retomar a validação exige conferir o login do principal e testar links sem
confusão entre sessão existente e sessão originada pelo convite. A senha real
atual do principal ainda não foi conferida remotamente pelo assistente.

## Correção implementada

- A SDK compartilhada não detecta callbacks na rota `/reset-password`, incluindo
  barra final. Detecção normal nas outras rotas permanece habilitada.
- A página usa uma SDK exclusiva, `persistSession: false`, auto refresh e detecção
  automática de URL desligados, storageKey separado e armazenamento somente em
  memória. Não lê/escreve o login principal e não publica sessão para outras abas.
- Exige callback explícito de tipo invite/recovery, com access/refresh token e
  token_type bearer. URL com erro, tipo diferente, parâmetro duplicado ou token
  ausente é recusada antes de criar cliente. Esta versão atende o fluxo implícito
  comprovado no Auth local; não implementa callback PKCE de reset.
- Remove fragmento/query da barra antes de inicializar a SDK isolada. Valida
  sessão e identidade no provedor e verifica novamente o mesmo usuário no envio.
- Sem link validado, mostra erro e não oferece campo de senha. Com link válido,
  exibe o e-mail verificado da conta que terá a senha alterada.
- Bloqueia reentrada/repetição após sucesso. Fecha somente a sessão isolada e
  encaminha para login, sem autenticar automaticamente nem trocar o login de
  outra aba. O usuário precisa entrar com e-mail e nova senha.
- Formulário continua protegido antes de hidratação e com POST. Nenhum token ou
  detalhe bruto do provedor é exibido ou persistido pelo novo fluxo.

Não é uma garantia de que um bearer token copiado deixe de valer antes do prazo
do provedor; uso único do link de e-mail e validade de JWT são conceitos distintos.
O caso corrigido é usar um login persistido como fallback de callback inválido.

## Verificação isolada

- 38 testes unitários, cobrindo callback ausente/erro/duplicidade/tipo, convite e
  recuperação válidos, identidade diferente, falhas do provedor e repetição.
- 40 testes de interface, sendo cinco novos com SDK Supabase real e HTTP Auth
  interceptado: principal previamente armazenado + URL ausente/expirada; convite
  e recovery de outra conta; token recusado pelo provedor. Principal preservado
  no localStorage, nenhuma senha enviada com seu bearer e nenhuma sessão de
  reset persistida. Hydrate em StrictMode testa inicialização única.
- 92 regressões de servidor/aplicadores, TypeScript e lint dos novos componentes/
  helpers passaram. Build isolado sem `.env`, chaves/URL locais sintéticas e
  fetch externo bloqueado. Não envia e-mail nem altera senha real nesses testes.
- O schema SQL não mudou; não é necessário aplicar migration para esta correção.

## Conferência da fixture do principal

`tests/homologation/sync-primary-fixture-password.py` verifica o login da fixture
primary somente em HTTP 127.0.0.1:55421. Primeiro tenta a senha já guardada. Se
ela falhar por credencial inválida, solicita a senha que o operador guardou com
entrada oculta em terminal interativo. Recusa entrada sem TTY/sem ocultação.

Valida ID/e-mail da resposta; somente depois pode atualizar o campo password da
fixture primary. Salva atomicamente com modo 0600 fora do Git, preservando outros
campos/usuários. Não altera senha no Auth, não segue redirects nem usa proxies,
não imprime credenciais e tenta fechar apenas a nova sessão usada na conferência.
O arquivo não é atualizado se a senha/identidade não for confirmada ou se outro
processo alterar a fixture durante a conferência.

Oito testes com HTTP/terminal simulados passaram: senha antiga válida, nova senha
validada, senha inválida, destino remoto, identidade errada, falha de provedor,
terminal não interativo e escrita concorrente. Execução real ainda depende do WSL.

## Próximos passos locais

1. Manter a janela do principal aberta. Atualizar Git e executar a conferência
   privada de senha. Enviar somente a saída de aprovação/falha, nunca a senha.
2. Parar Vite, copiar para a aplicação isolada os cinco arquivos: password-recovery.ts,
   integrations/supabase/client.ts, integrations/supabase/password-reset-client.ts,
   components/iga/PasswordResetPage.tsx e routes/reset-password.tsx. Reiniciar Vite.
3. Com principal conectado na janela normal, abrir `/reset-password` sem token e
   confirmar erro imediato, sem campo de senha, sem modificar a conta.
4. Gerar par de convites novos para conta exclusiva ainda não ativada, respeitando
   o intervalo de reenvio. Conferir recusa do anterior e aceite do mais recente
   em contexto limpo. Confirmar e-mail exibido e login explícito após atualização.
5. Revalidar recovery, erro/usado/expirado e preservação do principal no cenário
   com link de outra conta. Não inferir expiração a partir do erro genérico anterior.

No momento deste registro, cópia do novo fluxo, conferência da fixture e repetição
desses casos reais permanecem pendentes. Sem acesso à produção ou publicação.
