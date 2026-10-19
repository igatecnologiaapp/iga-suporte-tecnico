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
- Testes unitários e ESLint não reexecutados nesta rodada.
- Estados de carregamento, vazio e erro ainda exigem validação sistemática.
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
