# Empresas e navegação — 26/10/2026

Lote autorizado após a conferência dos cinco ajustes de Usuários. Implementado
na ordem combinada; aplicação e conferência manual no WSL ainda pendentes.

## Comportamento

- Excluir recebe texto/ícone, fundo e foco em vermelho no hover e foco de teclado.
  A confirmação de exclusão definitiva também usa a variante destrutiva. O
  componente compartilhado de cadastros recebe a apresentação; papéis, motivo,
  inspeção de referências e funções de exclusão/arquivamento não foram alterados.
- Conflito de CNPJ/CPF mostra orientação junto ao campo, com `aria-invalid`,
  descrição associada e foco no documento. Mantém o formulário preenchido e
  não inicia sincronização de categorias após falha ao salvar a empresa.
  Ao editar o documento, limpa o aviso; uma tentativa corrigida pode prosseguir.
- Mensagem específica exige código SQL 23505 e a constraint existente
  `companies_tax_id_key`. Outras falhas de Empresas recebem mensagem genérica,
  sem detalhes SQL. Não muda normalização, validação ou unicidade do banco;
  não exige migration. Cadastros arquivados também continuam sujeitos à constraint.
- A pedido do operador, Sair também recebe destaque vermelho no hover e foco
  de teclado, como Excluir, mantendo a confirmação já implementada.
- Sair abre confirmação com Cancelar em foco. Escape/Cancelar preservam a sessão
  e devolvem o foco ao botão, inclusive no menu móvel. Apenas confirmação solicita
  signOut; durante a espera bloqueia repetição e cancelamento. Falha exibe aviso
  sanitizado e permite nova tentativa. Navega ao login somente após signOut sem
  erro. Usa o mesmo botão no menu expandido, recolhido e móvel.

## Verificação

- 34 cenários de interface de Empresas/navegação passaram em uma execução.
- Mais oito verificações focadas passaram após estabilizar capturas de animações,
  incluindo dois novos cenários de saída no tema escuro: 36 cenários distintos.
- Cobrem CNPJ duplicado em inclusão/edição, inclusive empresa arquivada,
  preservação de dados/categorias e correção posterior; conflito de servidor não
  presente na lista e outra constraint não confundida com documento.
- Cobrem hover/foco de Excluir em 360/1440 nos dois temas sem confirmar exclusão;
  Cancelar/Escape na saída com foco restaurado nos mesmos tamanhos/temas;
  confirmação explícita, bloqueio de repetição e falha com nova tentativa.
- Regressões de Domínio/categorias, permissões, filtros, formulário, foco e temas
  em 360/768/1440 passaram. Serviços de banco/Auth são sintéticos nos testes de UI;
  não equivalem a exclusão ou logout real no ambiente do operador.
- TypeScript, ESLint de LogoutButton/AppShell/CompanyFields/helper de feedback e
  build em cópia isolada sem `.env` aprovados. ResourcePage preserva os usos de
  any e o passivo de lint anteriores; não houve limpeza global.
- Inspeção visual das confirmações no celular e capturas sintéticas em
  `../screenshots/logout-confirmation-{360,1440}-{light,dark}.png`.

## Aplicar e revisar no WSL

Parar Vite, atualizar Git, copiar mantendo caminhos `src/components/iga/LogoutButton.tsx`,
`AppShell.tsx`, `CompanyFields.tsx`, `ResourcePage.tsx` e
`src/lib/company-save-feedback.ts` para a aplicação isolada. Reiniciar pelo
launcher privado existente. Manter Supabase ligado. Não aplicar migration.

Conferir primeiro Sair/Cancelar e destaque de Excluir sem executar exclusão.
Depois conferir mensagem de duplicidade com documento idêntico ao de uma empresa
fictícia existente, preservando os dados e cancelando o formulário após observar
recusa. A confirmação real de saída pode usar conta de teste em janela separada.
Após essa conferência, próxima etapa combinada é modernização visual de Contatos.
Sem merge, publicação ou credenciais registradas neste lote.
