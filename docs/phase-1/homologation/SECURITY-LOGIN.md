# Correção de segurança do formulário de acesso

Base: `55c0aa1`, branch `codex/iga-service-fase-1`.

## Problema e correção

O formulário podia executar uma submissão HTML nativa GET antes de React
interceptar o evento, colocando os campos de credenciais na URL.

O formulário agora utiliza `AuthForm`, com:

- Campos e botão de envio desabilitados no HTML inicial e até a execução
  do efeito de montagem do React. Enter não envia credenciais nesse intervalo.
- `method="post"` explícito: mesmo uma submissão nativa que ignore o handler
  envia os campos no corpo, em vez de parâmetros da URL.
- Bloqueio dos controles também durante uma operação em andamento.
- Orientação para ativar JavaScript quando ele estiver desativado.

O POST nativo é apenas uma defesa adicional contra exposição em URL; ele
não implementa login sem JavaScript. O login normal permanece no SDK Supabase.
Não foram alterados usuários, RLS, regras de autenticação ou credenciais.
Domínio, categorias, chamados e WhatsApp não tiveram código alterado.

## Validação executada no ambiente de desenvolvimento

| Verificação | Resultado |
| --- | --- |
| TypeScript | Aprovado |
| Build em cópia sem `.env`, com variáveis sintéticas locais | Aprovado |
| Testes unitários | 9 aprovados |
| Suíte Playwright existente + regressões de segurança | 25 aprovados |
| Rota real `/auth`, com respostas interceptadas | 3 aprovados |
| ESLint dos arquivos novos e da configuração de teste | Zero erros e avisos |
| ESLint global | 2085 erros e 9 avisos, totais iguais aos anteriores |

As três regressões da suíte verificam JavaScript desativado, hidratação
deliberadamente atrasada com envio por clique/Enter após sua liberação, e
submissão nativa forçada por POST sem parâmetros de credenciais na URL.
O teste atrasado não injeta um preventDefault de proteção no navegador:
utiliza o componente de produção e seu handler de teste.

O script `tests/homologation/auth-security.mjs` verifica a rota real sem
JavaScript, a solicitação JSON de login após montagem e o fallback nativo POST.
Utiliza somente valores fictícios definidos no próprio teste e intercepta
o Auth e a submissão nativa; não autentica usuários reais nem acessa banco.
Resultado: [auth-security-results.json](auth-security-results.json).

## Repetição

Com dependências de aplicação, testes e Chromium instaladas:

```bash
npm --prefix tests run test:unit
npm --prefix tests test
IGA_AUTH_TEST_URL=http://127.0.0.1:4180 node tests/homologation/auth-security.mjs
```

O último comando exige que a aplicação corrigida esteja funcionando localmente.
O script aceita somente HTTP em loopback, nas portas 4180 ou 4182, e bloqueia
requisições do navegador para hosts externos. O executável do navegador pode
ser indicado por `CHROMIUM_PATH`. As credenciais de fixtures não são utilizadas.

No WSL, a validação deve usar a cópia corrigida de `src/routes/auth.tsx` e o
novo `src/components/iga/AuthForm.tsx`; apenas atualizar o checkout Git não
atualiza automaticamente a cópia descartável em `~/iga-homologacao/app`.
Também é necessário apontar o teste ao Playwright/Chromium auxiliares compatíveis.

## Limitações e próximos passos

- Os testes desta correção não reexecutam Auth/RLS/Storage contra o Supabase
  do computador Windows; esse ambiente é separado do workspace de desenvolvimento.
- Login real no WSL com a cópia atualizada confirmado manualmente pelo usuário
  em 20/10/2026, conforme registro abaixo.
- Resultados históricos anteriores à correção permanecem como evidência histórica.
- Esta correção não remove URLs de logs/históricos antigos. Na homologação,
  a senha fictícia exposta já havia sido substituída.
- O risco de atualização parcial na administração de usuários e as melhorias
  visuais continuam fora deste lote.
- Sem migrations, acesso a produção, publicação, merge em main ou Fase 2.

## Confirmação manual no Windows/WSL — 20/10/2026

Após atualizar a branch e copiar os dois arquivos de produção desta correção
para a aplicação isolada, o usuário informou nesta conversa:

- Login concluído com o administrador fictício local.
- Endereço após login contendo somente o endereço local e `/tickets`, sem
  e-mail ou senha nos parâmetros da URL.
- Acesso normal ao menu Empresas/Clientes, ao cadastro e aos formulários
  de edição existentes.
- Empresas fictícias cadastradas no dia anterior preservadas após desligar
  e reiniciar o computador e os serviços locais.

Esses resultados são relatos de execução manual pelo usuário; não são uma
nova execução automatizada nem demonstram que todos os fluxos foram retestados.
Com os testes automatizados descritos acima, encerram a validação deste lote
de correção do envio de credenciais pela URL. As demais ressalvas de homologação
e o risco de atualização parcial na administração de usuários permanecem abertos.
