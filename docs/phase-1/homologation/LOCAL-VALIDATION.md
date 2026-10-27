# Homologação local — Fase 1

## Ambiente e escopo
- Branch: codex/iga-service-fase-1.
- Commit-base: c394a47.
- Windows 11, Ubuntu WSL2 e Docker Desktop com driver overlayfs.
- Máquina informada: 8 GB de RAM.
- Supabase CLI 2.121.0, Bun 1.3.11 e Node.js 24.
- Supabase separado da produção, com dados e usuários sintéticos.
- API local na porta 55421; PostgreSQL na 55422.
- Portas publicadas em 127.0.0.1 e ::1, conforme saída apresentada.
- Aplicação em cópia separada, sem arquivos .env de produção.
- Nenhum merge, publicação ou início da Fase 2 realizado neste acompanhamento.

## Evidências e resultados
- Migrations históricas 0000 a 0019 aplicadas no banco local:
  migrations.json.
- Testes reais de Auth/API/RLS/Storage: 27 aprovados e zero falhas,
  conforme rls-results.json e saída apresentada.
- TypeScript: saída 0, sem erros, informada pelo operador.
- Build: saída 0, informada pelo operador.
- Logs completos de build e TypeScript não foram anexados.
- Verificações manuais realizadas pelo operador na interface local,
  acompanhadas de relatos e capturas nesta conversa.

## Verificações manuais aprovadas
- Edição de nome fantasia preservando Domínio e associações.
- Cadastro sem Domínio.
- Edição, exibição, persistência e pesquisa por Domínio.
- Domínio duplicado permitido com aviso identificando outra empresa.
- Pesquisa retornando ambas as empresas com o mesmo domínio.
- Persistência de categorias e subcategorias por empresa.
- Troca da categoria padrão persistida após recarregar.
- Vínculo de contato com empresa preservado após edição.
- Textos legíveis e alternância entre temas funcionando.
- Responsividade relatada em 360, 768 e 1440 pixels.
- Rolagem horizontal da lista permite acessar informações e ações.
- Visualização: ações de cadastro e edição indisponíveis.
- Técnico: ações de cadastro e edição disponíveis.
- Supervisor: módulos operacionais, SLA e Técnicos disponíveis;
  Usuários e Integrações ausentes.
- Administrador comum: acesso a Usuários e Integrações; perfil e
  módulos bloqueados; alteração de nome persistida sem mudar acessos.
- Perfil restrito: somente Chamados no menu e acesso direto a Empresas recusado.
- Conta inativa: acesso à aplicação bloqueado com mensagem específica.

## Pendências de interface
1. Reforçar bordas e diferenciação dos campos no tema claro.
2. Aplicar destaque vermelho no hover e foco do botão Excluir de empresas.
3. Exibir mensagem específica para CNPJ/CPF duplicado.
4. Mostrar descrição visível para o botão de redefinição de senha.
5. Adicionar confirmação ao sair, recomendação do usuário.
Estas melhorias não foram implementadas neste acompanhamento.

## Problemas encontrados nos auxiliares
- Inserts em lote omitindo status ou is_default produziram valores NULL.
- Retorno select("*") de técnicos solicitou colunas de leitura restrita.
- Recuperação realizada por etapas, exclusivamente nos dados sintéticos.
- O seed original ainda precisa incorporar correções e permitir retomada segura.
- local-support.mjs foi ajustado para aceitar a porta local 55421.
- Windows reservava as portas padrão; a configuração local usa outras portas.

## Limitações e riscos
- Alguns testes de recusa aceitam qualquer erro; falta confirmar a causa
  específica para evitar falsos positivos.
- Login de conta inativa no Auth não significa acesso à aplicação;
  o bloqueio foi confirmado manualmente na interface.
- Suíte automatizada de interface não executada neste acompanhamento local.
- Testes unitários e ESLint executados; resultados complementares abaixo.
- Estados de carregamento, vazio, erro e recuperação de Empresas verificados na rodada complementar.
- Revisão estática identificou possibilidade de atualização parcial em
  updateAdminUser: dados básicos podem ser salvos antes da recusa de
  mudança de perfil/módulos. Não reproduzido neste acompanhamento.
- Cinco capturas desta rodada salvas localmente no repositório; envio ao GitHub pendente.
- Sem testes de envio real de WhatsApp ou uso de credenciais de produção.

## Próximos passos
- Completar verificações pendentes e salvar evidências sem segredos.
- Corrigir e revisar auxiliares em alteração específica de testes.
- Revisar diff e arquivos explicitamente selecionados antes do commit.
- Não versionar private/, .env, credenciais ou supabase/.temp/.
- Submeter melhorias de produto à autorização.
- Manter main intacta e aguardar homologação antes da Fase 2.

## Conclusão
Resultados positivos nos cenários executados, com ressalvas e pendências.
Este relatório não declara homologação integral ou autorização de publicação.

## Capturas locais

- [empresas-desktop-claro.png](screenshots/local/empresas-desktop-claro.png)
- [empresas-desktop-escuro.png](screenshots/local/empresas-desktop-escuro.png)
- [empresas-mobile-360.png](screenshots/local/empresas-mobile-360.png)
- [empresa-formulario-dominio.png](screenshots/local/empresa-formulario-dominio.png)
- [empresa-formulario-categorias.png](screenshots/local/empresa-formulario-categorias.png)

## Rodada complementar de validação

Atualização posterior: a correção do formulário e seus testes estão descritos em
[SECURITY-LOGIN.md](SECURITY-LOGIN.md). Os achados abaixo preservam o histórico
da rodada anterior; a confirmação manual no WSL com a cópia corrigida foi
informada pelo usuário em 20/10/2026 e está registrada no relatório de segurança.

- Testes unitários: 9 aprovados; zero falhas, ignorados ou cancelados.
- Interface com serviços simulados: 22 aprovados, zero ignorados ou instáveis.
- Interface com Supabase local: 5 verificações aprovadas de login após
  interação pronta, busca vazia, carregamento, erro e recuperação.
- Recusas específicas: 5 verificações aprovadas com causas de permissão/RLS
  e resposta 403 do Storage.
- Os testes originais de Auth/API/RLS/Storage permanecem registrados: 27 aprovados.
- ESLint: base com 2245 erros e 10 avisos; atual com 2085 erros e 9 avisos.
- Nenhum grupo novo ou aumentado por arquivo, regra e mensagem.
- ESLint permanece reprovado; nenhuma correção indiscriminada realizada.
- Evidências: [VALIDATION-SUMMARY.json](VALIDATION-SUMMARY.json).
- A suíte completa ui.mjs não foi executada; foram usados testes
  complementares e as verificações manuais já descritas.

### Falha de segurança observada
A primeira tentativa automatizada resultou em submissão GET do login,
incluindo credenciais fictícias na URL. O formulário depende do JavaScript
para impedir a submissão nativa. A interação da tela funcionou posteriormente.
O momento exato da hidratação não foi instrumentado.

A senha fictícia foi substituída e o resultado local foi sanitizado.
O teste posterior aguardou interação e bloqueou submissão nativa somente
no navegador de teste. Essa proteção não corrige o produto.
Nenhuma credencial é incluída neste relatório.

### Conclusão complementar
Homologação com ressalvas, sem aprovação integral de segurança.
Recomenda-se corrigir o formulário antes de disponibilizar o sistema a usuários.
A revisão estática sobre atualização parcial de usuários permanece sem
reprodução experimental. Melhorias visuais e confirmação ao sair continuam
pendentes de autorização. Sem publicação, merge ou início da Fase 2.


## Atualização de interface — 26/10/2026

Bordas/contraste, auditoria recente e descrições de recuperação foram implementados
e aprovados manualmente no lote registrado em
[VISUAL-IMPROVEMENTS-2026-10-26.md](VISUAL-IMPROVEMENTS-2026-10-26.md).
Destaque de Excluir, mensagem de CNPJ/CPF duplicado e confirmação ao sair estão
implementados e verificados em ambiente isolado; conferência manual no WSL pendente.
Detalhes em [COMPANIES-NAVIGATION-POLISH.md](COMPANIES-NAVIGATION-POLISH.md).
Após esse lote, a próxima etapa combinada é modernizar visualmente Contatos.
As seções anteriores preservam o histórico das respectivas rodadas.


## Referência de listagem aplicada — 26/10/2026

Operador aprovou as dicas dos ícones de cadastro e pediu organização de Empresas
com filtros de situação, cores e painel de filtros adicionais nos dois temas.
Aceitou Inativas/Arquivadas no mesmo filtro com rótulo combinado, sem distinguir
novos estados no banco. Implementação e verificações isoladas registradas em
[COMPANY-LIST-FILTERS.md](COMPANY-LIST-FILTERS.md); conferência no WSL pendente.


## Paginação no banco e navegação — 26/10/2026

Operador escolheu explicitamente paginação também nas consultas ao banco.
Implementação, verificações isoladas e comandos de instalação local estão em
[PAGINATION-HEADER-ICONS.md](PAGINATION-HEADER-ICONS.md). Migration 0023 deve
preceder a atualização da cópia da aplicação. Conferência manual no WSL pendente.

## Sidebar, contadores e paginação fixa — 26/10/2026

Implementados os ajustes pedidos de cores de contadores, marcador da aba ativa
no menu recolhido, selo de não lidas na Caixa de Entrada e cinco registros fixos
por página. Detalhes e comandos em
[SIDEBAR-COUNTERS-FIXED-PAGES.md](SIDEBAR-COUNTERS-FIXED-PAGES.md).
Não exige nova migration; conferência manual no Ubuntu pendente.

## Encerramento das pendências manuais de CNPJ e saída

Operador confirmou o aviso de documento duplicado e o funcionamento de Sair
com confirmação e com cancelamento no Ubuntu. Registro complementar em
[COMPANIES-NAVIGATION-POLISH.md](COMPANIES-NAVIGATION-POLISH.md).
A próxima etapa visual combinada permanece Contatos.

## Contatos — 27/10/2026

Implementada a etapa visual de Contatos no padrão de Empresas / Clientes, com
campos existentes reorganizados, situação rápida e filtros Empresa/A–Z/Z–A no
banco. Migration 0024 e instruções em
[CONTACT-LIST-FILTERS.md](CONTACT-LIST-FILTERS.md).
A opção foi rotulada Empresa conforme esclarecimento do operador; não foi
introduzido filtro adicional de tipo. Aplicação/conferência no Ubuntu pendente.

## Contatos aprovado e formatação de telefone — 27/10/2026

Operador aprovou o resultado da tela de Contatos. Foi implementado o pedido
seguinte de formatação progressiva de telefone/WhatsApp e apresentação na tabela,
com comandos em [PHONE-FORMATTING.md](PHONE-FORMATTING.md). Não exige migration;
conferência manual desta formatação no Ubuntu pendente.
