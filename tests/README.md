# Homologação isolada — Fase 1

Use Node 24 e as dependências principais preparadas pelo script de instalação do ambiente. O lockfile principal é preservado; o ambiente utiliza uma cópia auxiliar com os tarballs do registro público e os checksums originais para contornar URLs privadas do Lovable.

```sh
npm ci --prefix tests
npm --prefix tests run test:unit
npm --prefix tests test
```

O Chromium padrão é `/usr/bin/chromium`; use `CHROMIUM_PATH` para outro caminho. O Playwright inicia e encerra um Vite exclusivo na porta 4175. Os resultados temporários ficam em `/tmp/iga-phase1-test-results`.

Para navegar localmente pela interface sem publicar nem conectar ao banco:

```sh
npm --prefix tests run preview
```

Abra a porta 4175 em seu próprio computador, ou utilize o encaminhamento autenticado de portas do seu ambiente de desenvolvimento. A entrada `/companies` permite testar a listagem, temas, pesquisa, formulário e categorias com dados sintéticos. Nenhuma prévia pública é criada por estes comandos. O harness não substitui autenticação nem altera rotas da aplicação oficial.

## Isolamento e limites

A configuração `interface/vite.config.ts` importa os componentes reais e substitui o cliente Supabase e as funções administrativas por módulos locais em memória. `envDir` aponta para a pasta isolada, sem carregar o `.env` principal. Requisições HTTP externas são bloqueadas e reprovam os testes. Erros de execução no navegador também reprovam os cenários.

Os testes não validam PostgreSQL, RLS, triggers, concorrência, transações, integrações reais ou credenciais. Ações administrativas destrutivas são deliberadamente recusadas pelo mock. Não aponte os testes para produção.

O contrato de Domínio segue `f3396c8`: texto livre é salvo com trim externo, sem canonicalização; normalização e validação servem apenas para exibir links válidos. Campo ausente preserva o valor anterior; campo explicitamente vazio permite limpar. As categorias/subcategorias e sua seleção padrão seguem as regras atuais do Lovable.

As capturas de lista, formulário e categorias nas larguras 360, 768 e 1440, nos dois temas, são salvas em `docs/phase-1/screenshots`. Elas contêm apenas dados sintéticos.
