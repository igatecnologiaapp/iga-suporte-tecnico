# Melhorias de interface — 26/10/2026

Implementadas na ordem autorizada pelo operador após a revalidação local de
recuperação e convites. Revisão manual na aplicação WSL concluída; sem publicação.

## Comportamento

1. Auditoria: bolinha azul-clara à esquerda de cada alteração das últimas 24 horas,
   com legenda e texto equivalente para leitor de tela. Critério por data do evento,
   não por leitura do usuário; dados e ordem recebidos do servidor preservados.
   Atualiza o destaque a cada minuto e quebra detalhes longos no celular.
2. Ações de Usuários: descrição ao passar o mouse ou focar pelo teclado, inclusive
   quando desabilitadas. Explica conta própria, principal protegido, perfil sem
   autorização, cadastro pendente e solicitação em andamento. A chave ganhou
   rótulo visível “Recuperar senha”. Nenhuma permissão foi ampliada.
3. Senha repetida: código explícito `same_password` do Auth recebe orientação
   específica e permite nova tentativa na mesma sessão isolada. Outras falhas
   continuam sanitizadas; nenhuma mensagem bruta do provedor é exibida.
4. Convite com e-mail já confirmado: aviso informativo explica que nenhum convite
   foi enviado e orienta recuperação. A lista mantém a explicação visível mesmo
   com Reenviar desabilitado. Não muda a decisão do servidor de enviar ou não.
5. Temas: bordas de campos mais definidas, foco azul e contraste de ação destrutiva
   no tema escuro. Cartões de convites colocam ações abaixo dos dados no celular.
   Ajustes semânticos de CSS também alcançam os demais formulários da aplicação.

## Verificação executada

- 40 testes unitários aprovados, incluindo senha repetida, nova tentativa e
  sanitização de falha sem código reconhecido.
- 45 testes de interface aprovados, incluindo explicação de botão desabilitado
  por mouse/teclado, ausência de acionamento, auditoria recente/antiga, larguras
  360 e 1440 nos dois temas e regressões de login, recovery, seleção técnica e
  Empresas (incluindo 768 pixels).
- TypeScript, ESLint dos componentes/helpers novos ou alterados (exceto rota
  legada de Usuários, com formatação e any preexistentes) e build isolado aprovados.
- Inspeção visual das capturas sintéticas. Medição em Chromium do campo de exemplo:
  borda/cartão 3,26:1 claro e 3,19:1 escuro; texto/cartão 18,33:1 e 16,76:1.
  Esses valores são do campo medido, não certificação de toda a aplicação.
- Capturas de teste salvas em `../screenshots/admin-visual-{light,dark}-{360,1440}.png`.
  Não contêm contas reais, senhas, tokens ou links de ação.

## Aplicação no WSL

Parar somente Vite, atualizar o Git e copiar mantendo caminhos para a aplicação
isolada: `src/components/iga/AdminAudit.tsx`, `ActionHint.tsx`,
`AdminCreationOperations.tsx`, `src/lib/password-recovery.ts`,
`src/lib/admin-user-creation.ts`, `src/routes/_authenticated/users.tsx` e
`src/styles.css`. Reiniciar pelo launcher privado existente. Não requer migration.

## Conferência manual concluída — 26/10/2026

Após atualizar a aplicação isolada, operador aprovou os ajustes visuais de
Usuários, incluindo destaque da auditoria e explicações dos botões. Na recuperação,
confirmou a mensagem “A nova senha deve ser diferente da senha atual. Escolha
outra senha e tente novamente.” ao repetir a senha recém-definida; captura do
aviso apresentada, sem senha ou token. Ao reenviar convite de conta já confirmada,
captura mostrou aviso informativo azul de e-mail confirmado, ausência de novo
convite enviado e orientação de recuperação na lista de usuários.

Conferência manual dos cinco ajustes concluída por relatos e capturas do operador.
A ausência de novo e-mail nesta última tentativa não foi medida separadamente
no Mailpit; a captura confirma o aviso exibido. Sem acesso ou publicação em produção.
