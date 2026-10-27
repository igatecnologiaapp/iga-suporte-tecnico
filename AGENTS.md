<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Access = role (user_roles) + per-module rows (user_modules) checked by has_module() in restrictive RLS and the _authenticated gate; primary admin (primary_admin table) has all modules. Why: least privilege enforced in the database, not just the menu.
- User creation, role and module changes go through assertPrimary() in admin-users.functions.ts. Why: single point to delegate admin actions later.

## Comentários internos solicitados pelo usuário

- Documente em português a responsabilidade de cada módulo e de cada função
  nomeada nova ou alterada, usando comentários próximos ao código. Explique a
  finalidade, entradas relevantes, efeitos e restrições quando ajudarem a
  manutenção; evite repetir literalmente o nome da função ou comentar cada linha.
- Ao adicionar um fluxo, atualize o mapa em `docs/phase-1/CODE-MAP.md` quando
  mudar a localização ou a responsabilidade das partes. Comentários não devem
  incluir credenciais, tokens, links de ação ou dados privados.
- Preserve migrations já publicadas e arquivos gerados. Documente o contexto
  desses contratos junto aos chamadores e no mapa, sem alterar definições SQL
  já instaladas apenas para acrescentar comentários.
