# Formatação de telefones — 27/10/2026

> Regra de edição atualizada a pedido do operador: Telefone limitado a dez
> dígitos e WhatsApp a onze, contando DDD. Detalhes e comandos atuais em
> [PHONE-FIELD-LIMITS.md](PHONE-FIELD-LIMITS.md). O texto abaixo registra a
> primeira implementação da formatação.

Após aprovar o resultado visual de Contatos, o operador solicitou formatação
automática de telefone/WhatsApp na digitação e na visualização.

## Comportamento

PhoneInput aplica pontuação progressiva nos campos de telefone e WhatsApp dos
cadastros de Contatos e Empresas, e no telefone do formulário compartilhado de
Técnicos. Usa teclado tel sem acrescentar validação obrigatória de país/tamanho.
Formatos completos brasileiros: (11) 3333-4444 e (11) 91234-5678. Números com
código brasileiro explícito ou com 12/13 dígitos iniciados por 55 preservam o
código e aparecem como +55 (11) 91234-5678. DDD 55 em número nacional de onze
dígitos continua sendo DDD, sem ser confundido com código de país.

A tabela de Contatos formata telefone e a alternativa WhatsApp ao renderizar,
inclusive em registros antigos, sem efetuar gravação. Ao salvar um formulário,
o valor pontuado segue o fluxo já existente; todos os dígitos são preservados,
incluindo o código de país. Os gatilhos existentes de normalização continuam
gerando os mesmos campos normalizados usados nos vínculos e buscas.

Campos completos de oito/nove dígitos sem DDD exibem apenas hífen, sem inventar
DDD. Números estrangeiros, textos de ramal e sequências maiores que a máscara
brasileira são preservados, sem truncamento. O cursor acompanha os dígitos nas
edições; Backspace/Delete em separadores conseguem apagar dígitos, sem prender
a digitação. Selecionar/substituir, colar e apagar todo o conteúdo são suportados.
Nenhum cadastro antigo é atualizado em lote. Não exige migration.

## Verificação

- Quatro testes unitários cobrem formatos, prefixos, DDD 55, números sem DDD,
  preservação de dígitos em cada etapa de entrada, internacionais/ramais e cursor.
- Quatro cenários de interface passaram com componentes reais e serviços
  sintéticos: digitação progressiva, edição no meio, apagar tudo, Delete no hífen,
  colagem, número internacional, ramal, salvamento de telefone/WhatsApp em
  Contatos/Empresas e exibição de números antigos sem gravações.
- 47 testes unitários, TypeScript, lint de PhoneInput/CompanyFields/helper e build
  em cópia isolada sem .env aprovados. ResourcePage mantém seu passivo de lint.
- Sem comunicação externa, envio de mensagem/e-mail ou uso de credenciais reais.
  Conferência manual no Ubuntu pendente.

## Aplicar no Ubuntu

Parar somente Vite com Ctrl+C e manter Supabase local ligado:

```bash
cd ~/projetos/iga-service-homologacao
(
  set -e
  git pull --ff-only
  cp --parents \
    src/components/iga/{PhoneInput,CompanyFields,ResourcePage}.tsx \
    src/lib/phone-format.ts "$HOME/iga-homologacao/app/"
  node "$HOME/iga-homologacao/private/start-app.mjs"
)
```

Conferir em um contato fictício: digitar DDD e número no Telefone/WhatsApp,
apagar/editar, colar número com +55, salvar e verificar a apresentação na tabela.
O visual de Contatos da rodada anterior foi aprovado pelo operador antes deste
pedido; esta formatação ainda depende da conferência manual local.

Regressões de Empresas, Contatos e paginação também passaram: 55 cenários de
interface numa execução, além dos quatro cenários específicos de telefone.
