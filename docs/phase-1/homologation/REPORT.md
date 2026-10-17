# Homologação funcional da Fase 1 — bloqueio de infraestrutura

**Resultado: homologação funcional NÃO concluída.** Nenhum teste com banco, autenticação real, RLS ou Storage foi executado. Não há aprovação funcional nesta entrega.

Código de referência: `1599367012492a3c9482ccaa258d2250cb0b0b9e`, branch `codex/iga-service-fase-1`. O código aprovado visualmente e o relatório anterior permanecem intactos.

## Trabalho realizado

- Confirmada a branch e o commit; `main` continua em `f3396c8`.
- Exportada uma cópia descartável da aplicação, sem `.env` e sem `supabase/config.toml` de produção, em diretório separado do checkout.
- Instalada a CLI oficial Supabase 2.121.0 em diretório local separado, sem instalar ferramentas no sistema.
- Criada configuração exclusiva de homologação, com identificador local próprio e serviços extras desativados para limitar recursos.
- Revisadas as 20 migrations `0000` a `0019`, sem alterar os arquivos. Checksums e situação em [migrations.json](migrations.json).
- Identificado bootstrap de administrador primário condicionado a identidade histórica. O seed preparado usa contas fictícias e inicialização específica do banco local, sem reutilizar essa identidade.
- Preparados auxiliares de aplicação de migrations, fixtures, testes API/RLS/Storage e interface real, em `tests/homologation/`.
- Preparado fora do repositório um lançador com variáveis somente locais e bloqueio de fetch não local. Ele não chegou a executar a aplicação.

## Bloqueios observados

1. O registro `public.ecr.aws` retornou HTTP 403 no download das imagens. A tentativa foi encerrada e o registro oficial alternativo Docker Hub foi utilizado, sem desativar TLS ou verificações de checksum.
2. O Docker utiliza o driver `vfs`. A extração de `supabase/postgres:17.11.0.004` falhou com `failed to register layer: no space left on device`.
3. Uma nova tentativa com PostgreSQL 15, suportado pela mesma CLI, também falhou com a mesma mensagem ao extrair `supabase/postgres:15.19.0.004`.

A observação de capacidade em um container descartável indicou filesystem de aproximadamente 31,5 GB e cerca de 19 GB livres naquele momento; isso não garantiu espaço suficiente para a extração das camadas pelo driver `vfs`. Não foi dimensionado um mínimo de armazenamento para uma próxima máquina.

As tentativas foram interrompidas após confirmação do bloqueio. Não foram alterados driver, configuração do daemon, partições ou armazenamento do host. Não foram usadas imagens modificadas, checksums substituídos ou verificação de integridade desativada.

## Resultados e limites da evidência

| Verificação                                  | Resultado desta execução                                    |
| -------------------------------------------- | ----------------------------------------------------------- |
| Docker disponível                            | Confirmado, versão 28.4.0, driver vfs                       |
| Download das imagens de Auth/API/Storage     | Obtidas pelo registro alternativo; pilha não iniciada       |
| PostgreSQL local pronto                      | Não; extração bloqueada por espaço                          |
| Migrations aplicadas                         | **0**                                                       |
| Usuários sintéticos criados                  | **0**                                                       |
| Registros sintéticos criados                 | **0**                                                       |
| Testes unitários reais de Domínio/categorias | **9 passaram; 0 falharam; 0 pulados**                       |
| Sintaxe dos cinco auxiliares novos           | Passou                                                      |
| ESLint dos auxiliares novos                  | Passou                                                      |
| Autenticação/RLS/Storage reais               | **Não executados: backend indisponível**                    |
| Interface com persistência real              | **Não executada: backend indisponível**                     |
| Capturas funcionais novas                    | Não geradas; não havia aplicação conectada a backend pronto |

As 22 aprovações de interface com mocks registradas na Fase 1 anterior não foram reutilizadas como evidência de homologação funcional. Build/TypeScript e o passivo de lint da entrega anterior também não constituem novos resultados desta execução. Não houve alterações no código da aplicação que exigissem novo build nesta preparação bloqueada.

Os auxiliares preparados ainda não têm execução de ponta a ponta validada. Sucesso de sintaxe/lint não comprova sua execução contra Supabase. Eles devem ser revisados ao retomar os testes.

Resultados estruturados: [RESULTS.json](RESULTS.json).

[Captura do registro de infraestrutura](screenshots/infra-bloqueio.png): representa os resultados registrados acima, **não uma tela funcional do IGA Service**. Nenhuma captura antiga com mocks foi reapresentada como teste com banco real.

## Isolamento e encerramento

- Nenhum acesso ao Supabase de produção foi realizado.
- Nenhuma credencial administrativa, conta ou registro real foi reutilizado.
- A cópia descartável não recebeu o `.env` principal ou configuração vinculada à produção.
- O código-fonte, as migrations históricas, as regras de autenticação, RLS, atendimento, SLA e WhatsApp não foram modificados.
- Nenhuma mensagem WhatsApp foi enviada e nenhum token Meta foi configurado.
- Nenhum recurso externo, túnel público ou implantação foi criado.
- Ao encerrar as tentativas, a inspeção do Docker confirmou **zero containers e zero volumes**. As imagens já obtidas permanecem em cache para eventual retomada.
- Configurações e logs locais de preparação ficam fora do Git. Não foram incluídos nos commits senhas, tokens, JWTs, chaves, URLs de conexão com credenciais ou arquivos `.env`.

## Matriz de testes pendentes

Todos os itens abaixo continuam **não executados com backend real**:

1. Criar empresa com domínio e sem domínio; editar domínio; editar outros campos sem apagá-lo; enviar formulário sem o campo; verificar limpeza explicitamente solicitada.
2. Pesquisar e exibir domínio; confirmar aviso informativo de duplicidade; recarregar página e conferir persistência.
3. Preservar texto livre/URL exatamente conforme o contrato atual de armazenamento, usando normalização apenas na exibição do link.
4. Associar pais e subcategorias, alternar padrão, validar restrição da migration `0019` e a unicidade da categoria padrão.
5. Criar e pesquisar contatos, validando vínculo com empresa.
6. Autenticar administrador primário, administrador, supervisor, técnico e visualizador; testar também conta inativa e usuário sem módulo.
7. Comparar permissões da interface, funções de servidor e RLS com operações permitidas e proibidas.
8. Validar upload/leitura local do Storage com perfis autorizados e bloqueios para perfis sem permissão.
9. Exercitar carregamento, vazio, falha local controlada e repetição; responsividade em 360/768/1440 e temas claro/escuro com aplicação real.

## Problemas e recomendações

O único bloqueio confirmado nesta execução é de infraestrutura. **Não há base para concluir que a aplicação passou ou falhou na homologação funcional.** Nenhum defeito funcional novo foi confirmado, porque os cenários reais não puderam iniciar.

Riscos já conhecidos que devem ser investigados posteriormente: múltiplas operações na sincronização de categorias, ordem de gravação pai/filho exigida pela migration `0019`, diferença entre papel e módulo de acesso, e preparação do administrador primário em banco vazio.

Para retomar, é necessário um ambiente Docker local com armazenamento suficiente para as imagens oficiais e extração das camadas, ou um driver de armazenamento adequado e suportado pela plataforma. Essa alteração de infraestrutura não foi executada automaticamente, conforme a restrição de interromper diante de dependência fora do ambiente isolado.

Depois de disponibilizado o ambiente, revisar os auxiliares, subir a pilha local, confirmar portas somente em loopback, aplicar `0000`–`0019` sem alterações, criar fixtures fictícias e executar os testes reais. Não reutilizar configurações de produção.

A Fase 2 permanece não iniciada. Não houve merge, publicação ou alteração de `main`. A retomada depende de orientação/autorização para resolver a infraestrutura.
