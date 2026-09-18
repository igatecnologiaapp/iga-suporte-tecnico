# Fase 1.1 — Consolidação do IGA Service

## Objetivo
Corrigir somente as pendências essenciais da Fase 1, sem novos módulos.

## Interface
- Adicionar edição aos cadastros de Empresas, Contatos, Técnicos e Categorias/Subcategorias, reutilizando os formulários atuais.
- Filtrar subcategorias pela categoria escolhida ao abrir um chamado.
- Limitar as opções de status às transições permitidas, exigir solução antes de resolver e pedir confirmação para Resolver/Encerrar.
- Permitir acolhimento por Administrador/Supervisor sem cadastro técnico; manter responsável técnico separado.
- Adicionar filtros combináveis de status, prioridade, técnico e empresa na lista de chamados.
- Ocultar ações administrativas de Técnicos, Categorias, SLA e Administração conforme o papel real do usuário.
- Manter pesquisa, responsividade, temas e navegação atuais.

## Banco e segurança
- Criar uma migration aditiva para validar transições de status e solução obrigatória no banco.
- Registrar o usuário que acolheu separadamente do técnico responsável e registrar a data de reabertura.
- Atualizar a resolução atual após reabertura, preservando cada resolução anterior na timeline.
- Impedir número manual e alteração de número; impedir alteração de autoria em Empresas e Contatos.
- Atualizar automaticamente `sla_policies.updated_at`.
- Preservar RLS, anexos privados e imutabilidade da timeline.

## Validação
- Verificar compilação e segurança após as alterações.
- Entrar como Administrador e Técnico e executar o fluxo completo com dados controlados.
- Validar criação, edição, filtros, permissões, transições, anexo, timeline, encerramento, reabertura e nova resolução.
- Remover os dados temporários quando não forem necessários.
- Reportar apenas correções, migrations, teste ponta a ponta, pendências e segurança.

## Limites
- Sem novos módulos, dashboards, integrações, WhatsApp, IA ou Portal do Cliente.
- Sem suíte extensa de testes automatizados.
