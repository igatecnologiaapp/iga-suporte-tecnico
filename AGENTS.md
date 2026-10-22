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

- Operational first-response alerts use immutable customer communication events, not tickets.first_response_at (legacy SLA timestamp); database message triggers capture the ticket at send time and invalidate failed WhatsApp evidence. Why: status changes must never qualify as customer communication.
- First-response reads use a security-invoker RPC with existing ticket RLS; shared header polling and origin-scoped Web Locks coordinate sound. Why: preserve module visibility and consolidate tabs without persistent duplicate notifications.
