# Preferência do contato, campos obrigatórios e comentários — 27/10/2026

## Comportamento pedido

A caixa Contato principal já existia no cadastro. Agora orienta o número exibido
na tabela: marcada prefere WhatsApp; desmarcada prefere Telefone. Quando o canal
preferido está vazio, utiliza o outro; se ambos estiverem vazios, exibe travessão.
A opção não muda a ordem alfabética, os números cadastrados ou as conversas.
Quando WhatsApp é exibido, a coluna identifica esse canal.

Foi acrescentado um asterisco vermelho ao lado do nome dos campos obrigatórios
nos formulários de cadastro e nas demais entradas da aplicação. O componente
Label recebe a condição de obrigatoriedade e RequiredMark apresenta somente o
símbolo visual, separado do texto do rótulo. Isso preserva nomes acessíveis e
seletores por nome. Campos opcionais e filtros não recebem asterisco. Não foi
adicionada legenda ou explicação à interface, conforme pedido.

As condições acompanham as regras já existentes: e-mail de usuário apenas na
criação, novo contato na identificação da conversa apenas quando não foi
selecionado contato existente, permissões de módulo exigidas na criação e
motivos/variáveis já validados pelas ações correspondentes. As validações e
permissões anteriores foram preservadas; o estado adicional da identificação
serve somente para apresentar os marcadores condicionais.

## Comentários internos

Componentes próprios, funções de negócio, serviços, rotas e scripts de apoio
receberam comentários de área e de responsabilidade perto das funções nomeadas.
O CSS identifica blocos de tema, navegação, listagens e paginação. A anotação
automatizada dos comentários conferiu que a impressão da árvore sintática sem
comentários permanecia idêntica, antes de gravar cada arquivo; o helper Python
teve igualdade de AST conferida. Os casos de alteração funcional desta rodada
foram tratados separadamente.

[CODE-MAP.md](../CODE-MAP.md) reúne arquivos e pontos de entrada por área.
[AGENTS.md](../../../AGENTS.md) registra a orientação para funções novas/alteradas
nas próximas rodadas. Arquivos gerados não receberam regras de negócio e as
migrations publicadas permaneceram intactas, com seu contexto documentado nos
chamadores e no mapa. Nenhuma credencial ou dado privado foi acrescentado aos
comentários.

## Verificação

- Seis cenários novos passaram: alternância da preferência do contato preservando
  os dois números e os marcadores de Empresas, Contatos, Categorias, Técnicos e
  abertura de Chamados. Dois cenários de regressão também passaram na revisão
  do rótulo, preservando a localização dos campos pelo nome.
- 27 controles nativamente obrigatórios foram conferidos estaticamente com a
  mesma expressão de obrigatoriedade no rótulo. Campos com regras manuais foram
  revisados nos respectivos fluxos.
- 50 testes unitários e 106 testes de funções administrativas/aplicadores passaram.
  O helper privado de login passou em oito testes simulados. Não foi executado
  login real nem alteração de senha nesta rodada.
- TypeScript, lint dos componentes pequenos/helpers alterados e build em cópia
  isolada sem .env aprovados. Não houve limpeza do passivo global de lint.
- Interface e serviços dos testes são sintéticos. A validação manual no Ubuntu
  permanece pendente. Não há nova migration, envio real de mensagem ou publicação.

## Aplicar no Ubuntu

Como os comentários abrangem várias áreas, esta rodada atualiza a pasta de código
fonte inteira. O comando não copia a configuração da raiz do repositório.
Manter Supabase local ligado e parar somente Vite com Ctrl+C:

```bash
cd ~/projetos/iga-service-homologacao
(
  set -e
  git pull --ff-only
  cp -a src/. "$HOME/iga-homologacao/app/src/"
  node "$HOME/iga-homologacao/private/start-app.mjs"
)
```

Conferir em um contato fictício com os dois números preenchidos: marcar Contato
principal e salvar deve mostrar WhatsApp; desmarcar e salvar deve mostrar o fixo.
Conferir os asteriscos de Empresa/Nome em Contatos, documento/nome/razão em
Empresas e ausência de marcador em telefones/cargo/e-mail opcionais. Os comentários
podem ser consultados no editor pelo arquivo ou pelo mapa do código no repositório.

A execução final da suíte completa passou: 94 testes de interface. Inclui os
fluxos de acesso/recuperação, documento duplicado, saída, paginação, telefones e
os cenários novos de preferência do contato e indicação de obrigatoriedade.

Capturas sintéticas dos dois temas em `../screenshots/contact-required-*.png`
e `../screenshots/contact-preferred-*.png` mostram os marcadores e o canal
WhatsApp escolhido pela preferência. Os formulários foram conferidos visualmente.

## Conferência manual confirmada pelo operador — 27/10/2026

O operador confirmou a preferência exibida na tabela: telefone fixo normalmente
e WhatsApp quando preenchido e marcado como principal. Confirmou também os
asteriscos nos campos obrigatórios nos temas claro e escuro. Esses pontos ficam
validados manualmente, além da cobertura automatizada acima.
