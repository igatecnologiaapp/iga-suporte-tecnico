# Plano — IGA Service, fase 1

## Objetivo
Entregar a base operacional do IGA Service para cadastrar clientes, contatos e técnicos; abrir chamados manuais; acompanhar atendimento; anexar arquivos; e concluir o chamado com histórico íntegro.

## Experiência do sistema
- Criar uma área autenticada com navegação lateral recolhível, agrupada em Operação, Cadastros, Gestão e Administração.
- Implementar modo claro azul e branco e modo escuro sóbrio, com preferência persistida no navegador.
- Adaptar navegação, tabelas, filtros e formulários para desktop, tablet e celular.
- Usar estados vazios claros, badges consistentes e confirmações em operações críticas.
- Deixar itens futuros fora do menu ativo, mas manter a organização preparada para expansão.

## Acesso e segurança
- Disponibilizar entrada por e-mail/senha e Google.
- Criar perfis próprios vinculados ao acesso, contendo nome de exibição, foto e preferências essenciais.
- Manter papéis em tabela separada: Administrador, Supervisor, Técnico e Visualização.
- Aplicar políticas no banco: Administrador com acesso total; Supervisor com gestão operacional; Técnico limitado ao trabalho permitido; Visualização somente leitura.
- Proteger páginas privadas e validar novamente as permissões nas operações de leitura e gravação.

## Banco de dados
- Criar empresas, contatos, perfis, papéis, técnicos, categorias, SLA, chamados, eventos da timeline e metadados de anexos.
- Usar relacionamentos e exclusões protegidas para preservar integridade referencial.
- Normalizar telefone e WhatsApp para identificação futura sem implementar a integração agora.
- Gerar números de chamados de forma transacional no padrão `CH-000001`.
- Registrar automaticamente timestamps de acolhimento, primeira resposta, resolução e encerramento.
- Tornar a timeline imutável por políticas e gatilhos, registrando usuário, evento, valor anterior, novo valor e observação.
- Criar repositório privado de anexos com acesso condicionado ao chamado relacionado.

## Páginas e fluxos
- **Entrada:** acesso, cadastro e recuperação de senha.
- **Chamados:** listagem pesquisável e filtrável, abertura manual, detalhes, atribuição, prioridade, status, atendimento, solução, anexos e timeline.
- **Empresas / Clientes:** listagem, cadastro e edição com todos os campos solicitados.
- **Contatos:** listagem, cadastro e edição com vínculo obrigatório à empresa.
- **Técnicos:** listagem, cadastro e edição com vínculo ao usuário.
- **Categorias:** cadastro hierárquico de categorias e subcategorias sem limitar os exemplos.
- **SLA:** configuração dos três prazos por prioridade.
- **Usuários:** visualização e administração dos perfis e papéis conforme permissão.
- **Configurações:** preferências básicas do sistema, sem integrações externas.

## Implementação técnica
- Centralizar tipos, validações, rótulos de status/prioridade e regras de transição para evitar duplicação.
- Usar funções protegidas para todas as operações privadas e consultas paginadas para tabelas.
- Separar componentes reutilizáveis de navegação, tabelas, formulários, badges, diálogos e estados vazios.
- Não implementar WhatsApp, IA, Portal do Cliente, dashboards avançados, relatórios ou integrações nesta fase.

## Validação final
- Validar segurança e permissões no banco.
- Testar o fluxo completo: Empresa → Contato → Técnico → Chamado manual → atribuição → mudança de status/prioridade → atendimento/solução → anexo → timeline → resolução → encerramento.
- Verificar telas em desktop e celular, além dos estados claro e escuro.
- Corrigir erros encontrados sem ampliar o escopo.
