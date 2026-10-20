# Recuperação administrativa de senha — primeiro lote

Data: 20/10/2026. Branch: `codex/iga-service-fase-1`.

## Alteração

O endpoint recebe somente um UUID validado. Exige sessão, papel admin e módulo
Usuários; resolve conta, papel e principal no servidor. Administrador comum não
pode recuperar principal nem outros administradores. Principal pode solicitar
para outros usuários. Solicitação para si é recusada neste endpoint.

A recuperação utiliza `resetPasswordForEmail` para o endereço confirmado do
próprio titular. O operador recebe apenas estado da solicitação e auditoria;
não recebe resposta do Auth, token ou link. Botões refletem a mesma política,
mas a autorização efetiva continua no servidor.

A auditoria de intenção precisa ser gravada antes de chamar Auth. O resultado
é registrado separadamente, com identificador de correlação e sem e-mail ou
credenciais. Falha ao registrar conclusão retorna `audit: pending`, sem repetir
o envio. Aceite pelo Auth não comprova entrega. E-mail e SQL não são uma
transação única; falhas de rede podem deixar a entrega indeterminada.

O destino vem de `APP_SITE_URL`, origem HTTPS sem caminho/query/fragmento ou
credenciais. Sem configuração, somente Supabase HTTP em localhost nas portas
54321/55421 habilita o destino de homologação `http://127.0.0.1:4180/reset-password`.
Não foi configurado destino de produção neste lote.

A rota de nova senha usa o componente real `NewPasswordForm`, desabilitado antes
da hidratação, envio POST e bloqueio enquanto processa. Sem sessão válida não
chama atualização de senha. Falhas do provedor recebem mensagem genérica.

## Verificação executada no ambiente isolado

- 26 testes unitários: 17 existentes e 9 novos.
- 25 testes de servidor: 12 do handler administrativo e 13 de recuperação.
  Incluem requisição direta, injeção de ator/e-mail, autorização, falhas de
  leitura, auditoria, envio e ausência de links na resposta.
- 32 testes de interface: 28 existentes e 4 novos, usando Chromium.
  Novos casos exercitam o componente real sem JavaScript, hidratação atrasada,
  clique/Enter, submissão nativa POST e liberação após falha.
- TypeScript sem erros, ESLint dos novos componentes/helpers e rota sem erros,
  `git diff --check` limpo.
- Build passou em cópia sem `.env`, com configuração e chaves sintéticas locais
  e bloqueio de fetch externo. Marcadores do helper servidor ausentes no JS público.

Os testes de servidor simulam Auth e banco; os de interface simulam a conclusão.
Não demonstram entrega real, expiração ou uso único de token. Não houve envio
real de e-mail, alteração de credenciais, migration, deploy ou acesso à produção.
Criação/convites e seu fallback antigo de link continuam pendentes de outro lote.

## Próxima verificação no Ubuntu do operador

1. Atualizar a branch com `git pull --ff-only origin codex/iga-service-fase-1`.
2. Parar somente o Vite com Ctrl+C. Preservar Supabase e dados existentes.
3. Copiar para `~/iga-homologacao/app/`, mantendo os caminhos, estes seis arquivos:
   `src/lib/admin-users.functions.ts`, `src/lib/password-recovery.ts`,
   `src/lib/password-recovery.server.ts`, `src/components/iga/NewPasswordForm.tsx`,
   `src/routes/reset-password.tsx`, `src/routes/_authenticated/users.tsx`.
4. Reiniciar com `node ~/iga-homologacao/private/start-app.mjs`.
5. Como admin comum, confirmar recuperação indisponível para principal,
   outros administradores e a própria conta. Para usuário fictício comum,
   solicitar recuperação e conferir destinatário no Mailpit local
   `http://127.0.0.1:55424`. Nenhum link deve aparecer na tela administrativa.
6. Conferir auditoria com ator, alvo, intenção e resultado. Testar abertura do
   link em sessão separada e destino local, usando exclusivamente conta fictícia.
   Não compartilhar link, senha, token ou captura do conteúdo da mensagem.
7. Antes de trocar senha de fixture compartilhada, preparar conta descartável
   local e plano de atualização dos arquivos privados. Não alterar senha de
   primary/admin nem invalidar as credenciais dos testes anteriores.
8. Ainda pendentes no Auth local: expiração, uso único, reenvio/limite e alvo
   inexistente. Não declarar homologação integral antes dessas verificações.
