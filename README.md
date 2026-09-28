# Sistema Suporte Técnico

PROMPT 1 — FUNDAÇÃO DO SISTEMA

Crie a primeira fase de um sistema web responsivo chamado provisoriamente IGA Service — Gestão de Atendimento Técnico, destinado à gestão de chamados técnicos de clientes.

Nesta fase implemente somente a estrutura fundamental do sistema. Não implementar ainda integração com WhatsApp, IA, Portal do Cliente ou dashboards avançados.

1. ESTRUTURA PRINCIPAL

Criar menu lateral recolhível, organizado em:

OPERAÇÃO

Chamados

CADASTROS

Empresas / Clientes

Contatos

Técnicos

Categorias de Chamados

GESTÃO

SLA

ADMINISTRAÇÃO

Usuários

Configurações

Preparar a arquitetura para inclusão futura de Dashboard, Caixa de Entrada, Base de Conhecimento, Satisfação, Relatórios e Integrações.

2. EMPRESAS / CLIENTES

Criar cadastro com:

Razão Social

Nome Fantasia

CNPJ/CPF

Telefone

WhatsApp

E-mail

CEP

Endereço

Número

Complemento

Bairro

Cidade

UF

Status: Ativo/Inativo

Observações

Cada empresa poderá possuir vários contatos.

3. CONTATOS

Criar cadastro vinculado obrigatoriamente a uma Empresa/Cliente:

Nome

Cargo/Função

Telefone

WhatsApp

E-mail

Contato principal: Sim/Não

Status: Ativo/Inativo

Estruturar o telefone/WhatsApp para permitir futura identificação automática do cliente pelas mensagens recebidas.

4. TÉCNICOS

Criar cadastro de técnicos vinculado aos usuários do sistema:

Nome

Telefone

E-mail

Especialidade

Status: Ativo/Inativo

5. CATEGORIAS DE CHAMADOS

Permitir cadastrar categorias e subcategorias.

Exemplos:

Sistema > Erro
Sistema > Dúvida
Configuração > Alteração
Treinamento > Orientação
Infraestrutura > Problema técnico

Não limitar o sistema aos exemplos acima.

6. CHAMADOS

Criar numeração automática no padrão:

CH-000001

Campos principais:

Número

Data/hora de abertura

Empresa/Cliente

Contato solicitante

Telefone do solicitante

Canal de origem

Categoria

Subcategoria

Assunto

Descrição

Prioridade

Status

Técnico responsável

Técnico que acolheu

Data/hora do acolhimento

Data/hora da primeira resposta

Data/hora da resolução

Data/hora do encerramento

Solução apresentada

Observações internas

Canais de origem preparados para:

Manual

WhatsApp

E-mail

Portal

Outro

Nesta fase somente Manual precisa estar operacional.

Prioridades:

Baixa

Normal

Alta

Urgente

Status:

Novo

Triagem

Em atendimento

Aguardando cliente

Aguardando terceiro

Agendado

Resolvido

Encerrado

Reaberto

Cancelado

Duplicado

7. HISTÓRICO / TIMELINE

Cada chamado deve possuir timeline automática e imutável registrando eventos relevantes, incluindo:

criação;

acolhimento;

atribuição ou troca de técnico;

alteração de prioridade;

alteração de status;

notas internas;

solução;

resolução;

encerramento;

reabertura.

Registrar:

data/hora;

usuário responsável;

tipo de evento;

informação anterior e nova quando aplicável;

observação.

8. ANEXOS

Permitir anexar arquivos aos chamados.

Registrar:

arquivo;

nome;

tipo;

data/hora;

usuário que anexou;

chamado relacionado.

Preparar a estrutura para que futuramente anexos recebidos pelo WhatsApp possam utilizar o mesmo repositório.

9. SLA — ESTRUTURA INICIAL

Criar configuração básica de SLA por prioridade contendo:

prazo para acolhimento;

prazo para primeira resposta;

prazo para resolução.

Registrar os timestamps necessários nos chamados para permitir cálculos posteriores.

Nesta fase não desenvolver dashboards avançados de SLA.

10. USUÁRIOS E PERMISSÕES

Criar inicialmente os perfis:

Administrador

acesso total.

Supervisor

gestão dos chamados e equipe.

Técnico

acesso operacional aos chamados permitidos.

Visualização

somente consulta.

Aplicar controle de acesso e políticas de segurança/RLS adequadas.

11. INTERFACE

Sistema responsivo para desktop, tablet e celular.

Utilizar identidade visual profissional da IGA Tecnologia.

Implementar:

modo claro;

modo escuro;

menu lateral recolhível;

tabelas com pesquisa e filtros;

formulários objetivos;

badges visuais para status e prioridades;

confirmação para operações críticas.

Modo claro: predominância de azul e branco, com cores auxiliares suaves para alertas e indicadores.

Modo escuro: visual sóbrio, moderno e profissional.

12. REGRAS DE IMPLEMENTAÇÃO

Criar banco de dados e migrations necessárias.

Utilizar relacionamentos adequados entre empresas, contatos, usuários, técnicos e chamados.

Evitar duplicação de código e componentes.

Centralizar regras de negócio importantes.

Não criar dados fictícios desnecessários.

Não implementar funcionalidades fora deste escopo.

Não implementar WhatsApp ou IA nesta fase.

Preparar a arquitetura para expansão sem reconstrução dos módulos existentes.

Preservar segurança, responsividade e integridade referencial.

CRITÉRIO DE CONCLUSÃO

Ao final desta fase deve ser possível:

Cadastrar Empresa → cadastrar Contato → cadastrar Técnico → abrir Chamado manualmente → atribuir Técnico → alterar Status/Prioridade → registrar atendimento/Solução → adicionar Anexos → visualizar Timeline → resolver/encerrar o Chamado.

Antes de concluir, valide o fluxo completo e corrija erros encontrados sem ampliar o escopo.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://iga-suporte-tecnico.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d36db90d-6d92-4408-b8e4-708830f99b19).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
