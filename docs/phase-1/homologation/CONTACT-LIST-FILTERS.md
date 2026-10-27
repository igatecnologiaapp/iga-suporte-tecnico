# Contatos — organização e filtros — 27/10/2026

## Escopo combinado

O operador pediu o padrão visual de Empresas / Clientes para Contatos, com
cartões, seleção rápida Todos/Ativos/Inativos-Arquivados e tabela com Contato,
Empresa, Cargo/Função, Telefone, Status e Ações conforme o perfil. E-mail aparece
abaixo do nome; ícones de pessoa/empresa/telefone mantêm o padrão azul existente.
Campos opcionais ausentes não ganham valores inventados. WhatsApp é exibido com
rótulo próprio como alternativa quando não há telefone.

Nome, empresa, cargo, telefone, WhatsApp, e-mail e contato principal já existiam
no cadastro. Nenhuma nova coluna de dados foi criada. O formulário preserva os
campos existentes e mantém a empresa atual selecionada mesmo quando arquivada;
novos vínculos continuam oferecendo empresas ativas, como antes.

Ao esclarecer a referência, o operador confirmou o título **Empresa** para a
opção de vínculo no painel. Foram implementados apenas Empresa e Ordenar por
Nome A–Z/Z–A; não foi criada classificação extra de tipo de contato.

## Consulta e contadores

Nova função `list_paged_contacts` na migration 0024 aplica pesquisa, empresa,
situação e ordenação antes da paginação fixa de cinco registros. Usa a collation
portuguesa/natural da migration 0023 e desempate por identificador. Pesquisa por
nome, e-mail, cargo e telefones, incluindo as versões normalizadas já existentes.
O total do rodapé descreve a consulta final. Contadores de situação consideram
pesquisa e empresa, antes da situação rápida; cartões mantêm totais gerais.

Limpar filtros remove pesquisa/empresa/ordenação e preserva a situação rápida.
Apenas trocar a situação não habilita Limpar filtros. Trocar filtros retorna à
primeira página, reaproveitando o hook de paginação e seus estados de espera,
erro, tentativa novamente e proteção contra resposta antiga.

O painel inclui empresas arquivadas para permitir encontrar seus contatos, com
rótulo de situação. Nomes de empresa vêm do vínculo da linha retornada pelo banco.
Catálogo de opções carrega somente identificador/nome/situação para seletores.

A função é SECURITY INVOKER, exige perfil ativo e módulo Contatos, mantém RLS e
não aceita identidade fornecida pelo cliente. Valida páginas/filtros/tamanho;
a consulta é estática, sem interpolação de pesquisa. Contatos/empresas continuam
sujeitos às permissões de leitura existentes. Não altera políticas, campos,
cadastros, senhas ou a função compartilhada de paginação da migration 0023.
A compatibilidade dessa função anterior foi conferida no teste PostgreSQL.

## Verificação isolada

- Oito novos cenários de interface passaram: colunas e dados opcionais,
  cartões/contadores, filtros combinados por empresa e situação, empresa
  arquivada, ordem inversa, pesquisas, edição preservando vínculo e quatro
  combinações de largura 360/1440 com temas claro/escuro.
- Onze testes PostgreSQL passaram com todas as migrations em banco descartável:
  seis regressões da paginação anterior e cinco verificações dos filtros de
  Contatos, permissões, identidade, tamanho fixo, preservação da função anterior
  e respeito a RLS adicional na empresa vinculada.
- Trinta testes dos aplicadores 0023/0024 passaram, incluindo pré-verificação,
  instalação, repetição, locale ICU canônico e recusa de pré-requisitos inválidos.
- 43 testes unitários, TypeScript, lint dos componentes/hooks novos ou pequenos
  alterados e build em cópia isolada sem .env passaram. O passivo de lint de
  ResourcePage não foi objeto de limpeza global.

Interface usa serviços sintéticos; banco usa PostgreSQL real descartável com
contratos mínimos de Auth/Storage. Esses resultados não substituem a conferência
manual com Supabase/Auth no Ubuntu do operador. Não houve envio de WhatsApp,
e-mail, uso de credencial real, publicação, merge ou mudança de fase.

## Aplicar no Ubuntu de homologação

Manter Docker e Supabase local ligados, parar somente Vite com Ctrl+C e executar:

```bash
cd ~/projetos/iga-service-homologacao
(
  set -e
  git pull --ff-only
  IGA_HOMO_PRIVATE="$HOME/iga-homologacao/private" node tests/homologation/apply-contacts.mjs --apply
  cp --parents \
    src/components/iga/{ContactOverview,ContactToolbar,RecordName,ResourcePage}.tsx \
    src/components/iga/usePagedRecords.ts \
    src/integrations/supabase/types.ts \
    src/styles.css "$HOME/iga-homologacao/app/"
  node "$HOME/iga-homologacao/private/start-app.mjs"
)
```

O aplicador verifica API loopback 55421, container/porta Docker loopback 55422,
pré-requisitos da paginação e collation. Aplica somente 0024 em transação e
confere corpo/permissões da função. Repetição confere a instalação; evidência
fica na pasta privada. Se qualquer etapa falhar, o bloco para antes da cópia.

Em http://127.0.0.1:4180/contacts conferir filtros por empresas A/B, ordem inversa,
contadores, paginação de cinco, campos listados, cores e menu nos dois temas.
Conferência manual do operador permanece pendente.

A suíte completa de interface passou com 83 cenários. A pesquisa de telefone
sem pontuação também foi conferida em cenário focado após completar os testes
dos campos normalizados. Capturas sintéticas em `../screenshots/contacts-*`.

## Retorno do operador

O operador aprovou o resultado visual de Contatos e pediu em seguida máscara de
telefone/WhatsApp na digitação e exibição. Esse complemento está documentado em
[PHONE-FORMATTING.md](PHONE-FORMATTING.md), sem nova migration.
