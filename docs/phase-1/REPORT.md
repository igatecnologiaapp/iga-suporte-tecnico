# IGA Service — reconstrução controlada da Fase 1

Esta entrega reconstrói as melhorias autorizadas sobre `f3396c80e72e9b93330d9935eacee435be3e9509`, preservando o trabalho posterior do Lovable. Não é uma restauração de `5f1997d` nem uma recuperação dos arquivos perdidos.

- Branch: [`codex/iga-service-fase-1`](https://github.com/igatecnologiaapp/iga-suporte-tecnico/tree/codex/iga-service-fase-1).
- Baseline: commit [`9a3fd0a`](https://github.com/igatecnologiaapp/iga-suporte-tecnico/commit/9a3fd0a).
- Código e testes: commit [`6221324`](https://github.com/igatecnologiaapp/iga-suporte-tecnico/commit/6221324).
- [Comparação completa com a base](https://github.com/igatecnologiaapp/iga-suporte-tecnico/compare/f3396c8...codex/iga-service-fase-1).
- [Baseline registrado](BASELINE.json), [resultados](RESULTS.json) e [comparação do lint](lint-comparison.json).

## Funcionalidades implementadas

Navegação lateral renovada, com item atual acessível, modo compacto, grupos recolhíveis e identificação visual IGA. O menu móvel usa o Sheet/Radix existente, com contenção de foco, Escape e retorno ao botão de abertura. A filtragem por módulos e o logout continuam vinculados aos contratos existentes.

Cabeçalhos com contexto da página, hierarquia tipográfica, espaçamentos e tokens semânticos compartilhados. Temas persistidos: azul/branco suave no claro, azul profundo e legível no escuro. Não foi importado o CSS integral do Figma nem adicionada dependência de fontes remotas. Há link para pular ao conteúdo, foco visível e respeito à preferência de movimento reduzido.

Empresas/Clientes recebeu resumo dos registros disponíveis ao usuário, área de pesquisa/filtros organizada, tabela com rolagem própria no celular, formulário modular separado em identificação/contato/endereço e apresentação das categorias/subcategorias já existentes. O resumo não representa contagem global de produção: reflete somente os registros retornados pelas permissões do usuário.

Estados de carregamento, vazio e falha ficaram distintos. Falha de leitura das categorias ou dos vínculos bloqueia cadastro/edição, com opção de repetir, para evitar gravar associações incompletas. Os diálogos restauram o foco ao botão de origem, inclusive após atualização da lista.

## Preservação crítica do contrato de Domínio

O comportamento de `f3396c8` foi mantido: **Domínio é texto livre opcional**. O salvamento remove apenas espaços externos e converte vazio explícito em `null`. Não altera caixa, protocolo, prefixo www ou caminho do valor armazenado. A normalização e validação anteriores do Lovable continuam sendo usadas **somente para gerar o link seguro de exibição**; textos que não são domínios válidos permanecem visíveis como texto.

A implementação dessa normalização foi extraída, sem mudança de regra, para `src/lib/company-domain.ts`. O helper `domainFromForm` acrescenta a proteção requerida: se o campo estiver ausente do FormData, preserva o valor existente. Campo presente e explicitamente vazio continua permitindo limpar o domínio, conforme a regra atual.

O formulário continua preenchendo o domínio na edição; a pesquisa continua incluindo-o; a coluna Detalhe continua mostrando o valor; duplicidade continua gerando aviso informativo sem bloquear a gravação. Nenhuma coluna, migration, tipo Supabase ou registro real foi alterado. Os testes de edição verificam tanto domínios simples quanto URLs com caixa/caminho e texto livre.

## Categorias e subcategorias do Lovable

A migration `0019`, os vínculos de subcategoria, a exibição pai/filho, a seleção múltipla, a remoção de filhos ao desmarcar o pai e a categoria padrão foram preservados.

O TypeScript inicial já falhava em `src/lib/iga.ts`, por acessar `linked[0].id` após verificar o tamanho do array. O único ajuste nesse arquivo usa `linked[0]?.id ?? ""`, mantendo a seleção existente e eliminando o acesso possivelmente indefinido. Os testes unitários verificam o filtro por filhos associados, fallback para todos os filhos ativos e ausência de padrão arbitrário quando existem vários filhos.

## Resultados novos desta reconstrução

| Verificação             | Baseline `f3396c8`           | Entrega                            |
| ----------------------- | ---------------------------- | ---------------------------------- |
| Build                   | Passou                       | Passou                             |
| TypeScript da aplicação | 1 erro TS2532 preexistente   | Passou                             |
| ESLint global           | 2.245 erros / 10 avisos      | 2.085 erros / 9 avisos             |
| Testes unitários        | Sem suíte declarada          | 9 passaram                         |
| Interface Chromium      | Sem suíte declarada          | 22 passaram                        |
| Responsividade          | Sem evidência nesta execução | 360, 768 e 1440 px, nos dois temas |

O lint global continua reprovado. A comparação por arquivo/regra/mensagem, ignorando mudanças de linha, não encontrou diagnósticos novos. A formatação ficou limitada aos arquivos trabalhados; não foi executada correção global de lint. A advertência de dependência do AppShell foi eliminada fazendo a inicialização da navegação acompanhar a rota.

Os testes unitários usam o código real de Domínio e os helpers reais de categorias/subcategorias. Os testes de navegador renderizam AppShell, ResourcePage, CompanyFields, Page e CSS reais, substituindo os serviços por arrays sintéticos. Verificam ausência de chamadas HTTP externas e erros de execução.

Cobertura da interface: pesquisa por domínio, link normalizado, edição sem apagar o domínio, campo ausente, texto livre e URL sem canonicalização no salvamento, duplicidade, limpeza explícita, criação sem domínio, vínculos pai/filho/padrão, filtro por subcategoria, remoção de filhos ao desmarcar pai, visualizador sem edição, ausência de módulos indisponíveis, carregamento/vazio/erros, repetição, temas persistidos, navegação compacta, menu móvel e teclado/foco.

## Capturas para homologação

As 18 capturas usam exclusivamente dados sintéticos. Abra as imagens no GitHub e utilize **Download raw file** para baixar; o acesso exige autenticação se o repositório for privado.

| Largura | Lista clara                                    | Lista escura                                  | Formulário claro                                  | Formulário escuro                                | Categorias claras                                       | Categorias escuras                                     |
| ------- | ---------------------------------------------- | --------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------ |
| 360     | [Imagem](screenshots/companies-360-light.png)  | [Imagem](screenshots/companies-360-dark.png)  | [Imagem](screenshots/company-form-360-light.png)  | [Imagem](screenshots/company-form-360-dark.png)  | [Imagem](screenshots/company-categories-360-light.png)  | [Imagem](screenshots/company-categories-360-dark.png)  |
| 768     | [Imagem](screenshots/companies-768-light.png)  | [Imagem](screenshots/companies-768-dark.png)  | [Imagem](screenshots/company-form-768-light.png)  | [Imagem](screenshots/company-form-768-dark.png)  | [Imagem](screenshots/company-categories-768-light.png)  | [Imagem](screenshots/company-categories-768-dark.png)  |
| 1440    | [Imagem](screenshots/companies-1440-light.png) | [Imagem](screenshots/companies-1440-dark.png) | [Imagem](screenshots/company-form-1440-light.png) | [Imagem](screenshots/company-form-1440-dark.png) | [Imagem](screenshots/company-categories-1440-light.png) | [Imagem](screenshots/company-categories-1440-dark.png) |

## Arquivos e escopo

Código existente alterado:

- `src/components/iga/AppShell.tsx`: estrutura visual e navegação acessível.
- `src/components/iga/Page.tsx`: cabeçalhos e estados reutilizáveis.
- `src/components/iga/ResourcePage.tsx`: organização visual, editor modular, estados e proteção do Domínio.
- `src/styles.css`: tokens e estilos semânticos.
- `src/lib/iga.ts`: correção pontual do erro de TypeScript preexistente.

Código adicionado:

- `src/components/iga/CompanyFields.tsx`.
- `src/components/iga/CompanyOverview.tsx`.
- `src/lib/company-domain.ts`.

Testes/documentação: `tests/package.json`, `tests/package-lock.json`, `tests/playwright.config.ts`, `tests/README.md`, `tests/unit/company-contract.test.ts`, `tests/interface/{index.html,vite.config.ts,main.tsx,supabase.mock.ts,records.mock.ts,companies.spec.ts}` e esta pasta de evidências.

A comparação com a base confirmou ausência de alterações em `drizzle/`, `supabase/`, `src/integrations/`, `src/routes/`, serviços WhatsApp/messaging, funções administrativas, SLA, `.env`, manifesto e lockfile principais. Não foram executadas migrations, escritas em produção, alterações de credenciais, merge ou publicação. Nenhum `.env` ou segredo novo foi incluído nos commits; o `.env` já versionado na base não foi alterado.

## Persistência e reprodução

Código, testes, relatório e capturas são versionados nesta branch; não dependem de arquivos temporários para serem recuperados. A referência de validação do código é `6221324`; o commit de evidências preserva este relatório e as capturas. O envio ao GitHub e a verificação da cópia remota são informados na entrega da conversa.

Para repetir ou navegar localmente sem publicar, consulte [tests/README.md](../../tests/README.md). O harness tem entrada própria e substituições de serviços apenas na configuração de testes. Ele não cria bypass de autenticação nas rotas oficiais.

## Limitações e riscos remanescentes

- Mocks não validam PostgreSQL, RLS, triggers, autenticação real, concorrência, transações ou a integração WhatsApp.
- A sincronização de categorias mantém as múltiplas operações anteriores; atomicidade é risco preexistente e não foi alterada nesta fase.
- Componentes compartilhados e tokens afetam visualmente outros módulos; os fluxos operacionais não foram modificados, mas precisam de homologação visual posterior.
- A cobertura funcional detalhada é de Empresas; não equivale a regressão completa de todos os cadastros ou chamados.
- Chromium automatizado não substitui testes em Safari/Firefox, dispositivos físicos, leitor de tela ou auditoria completa WCAG/contraste.
- O formulário longo mantém rolagem interna e a tabela permite rolagem horizontal no celular.
- O passivo de ESLint permanece e deve ser tratado em trabalho separado, evitando mudanças amplas nesta entrega.

## Próxima etapa recomendada

Homologar visualmente esta branch e o contrato de Empresas em ambiente de desenvolvimento exclusivo com dados sintéticos. Depois, mediante nova autorização, modernizar Contatos. Não avançar para etiquetas, mídia de saída, chamados ou mudanças de banco nesta fase.
