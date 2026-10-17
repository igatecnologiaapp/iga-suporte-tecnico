# Auxiliares de homologação funcional local

**Estado: preparados, verificados somente por sintaxe e lint; não executados contra banco real.** A pilha Supabase não iniciou por falta de espaço ao extrair as imagens PostgreSQL no Docker/vfs. Consulte `docs/phase-1/homologation/REPORT.md`.

Estes scripts não substituem a suíte de mocks de `tests/interface`. São destinados à aplicação real e a Supabase local, após revisão e resolução da infraestrutura.

## Barreiras de execução

- `IGA_HOMO_PRIVATE` deve indicar uma pasta privada fora do Git.
- `local-config.json` nessa pasta deve ser obtido por `supabase status -o json` **da instância local**, redirecionado diretamente ao arquivo, sem imprimir chaves no terminal ou relatório.
- Os clientes recusam URLs que não sejam loopback na porta 54321.
- O aplicador de migrations exige o container `supabase_db_iga-service-homologation` e banco vazio.
- Senhas sintéticas são aleatórias; `fixtures.json` é gravado apenas na pasta privada, modo 0600.
- Não copie arquivos `.env` de produção ou configurações da CLI vinculadas ao projeto oficial.
- Não execute em produção, contra URL remota ou com credenciais de produção.

## Ordem prevista após autorização e infraestrutura pronta

1. Exportar o código aprovado sem `.env` e sem configuração Supabase de produção para uma cópia descartável, mantendo dependências compatíveis.
2. Inicializar a CLI em outro diretório com `project_id = "iga-service-homologation"`, portas locais e serviços necessários. `SUPABASE_HOME` permite manter o estado da CLI na pasta privada. O registro oficial alternativo pode ser selecionado por `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` quando o ECR estiver bloqueado. Não alterar o daemon do host automaticamente.
3. Subir a pilha, confirmar integridade das imagens, saúde e portas em loopback. Salvar status JSON local em arquivo privado sem exibir valores.
4. Executar `apply-migrations.mjs` uma vez no banco vazio: aplica os arquivos históricos sem modificá-los e registra checksums/resultados sem segredos.
5. Executar `seed.mjs`: cria contas, dados e buckets fictícios e define o administrador primário específico da homologação.
6. Iniciar a aplicação descartável em `127.0.0.1:4180`, com TODAS as variáveis Supabase apontando para a instância local, sem carregar `.env` do projeto. Remover variáveis Meta/WhatsApp e de migração remota do processo e bloquear fetch não local.
7. Executar `rls.mjs` e depois `ui.mjs`. O segundo usa componentes, rotas, autenticação e serviços reais; intercepta somente um cenário explícito de indisponibilidade para testar o estado de erro. Não é o harness com mocks.
8. Revisar JSON e capturas antes de versioná-los. Não versionar a pasta privada, status bruto da CLI, fixtures com senhas, logs brutos, sessões do navegador ou traces com cabeçalhos.
9. Encerrar a aplicação e a pilha local e confirmar o descarte dos acessos temporários.

O identificador e a porta locais fazem parte das barreiras contra erros de destino, mas não substituem revisão de isolamento. Os scripts pressupõem schema histórico aplicado com sucesso e precisam de validação de execução antes de serem considerados reproduzíveis.
