# Limites por campo de telefone — 27/10/2026

O operador identificou que a máscara anterior aceitava dígitos extras e pediu
limites distintos: Telefone com DDD e oito dígitos (dez no total), WhatsApp com
DDD e nove dígitos (onze no total). Esta regra substitui o campo de edição
flexível da rodada anterior.

## Comportamento atual

- Telefone usa sempre agrupamento (11) 9999-9999, no máximo dez dígitos.
- WhatsApp usa sempre (11) 99999-9999, no máximo onze dígitos.
- Digitação, inserção no meio e colagem que excedam o limite são recusadas,
  mantendo o valor anterior e exibindo orientação junto ao campo. Colagens
  longas não são cortadas para formar um número diferente.
- Campos nacionais esperam DDD e número, sem código de país. Colagem com DDI
  precisa ser corrigida pelo operador; o componente não remove prefixos sozinho.
- Selecionar/substituir um dígito, apagar, colar valor válido e limpar o campo
  continuam funcionando. Os campos permanecem opcionais como antes.
- Valores antigos fora do limite ficam intactos na exibição e ao abrir o editor.
  Ganham aviso e validade nativa negativa, exigindo correção antes de salvar.
  Nenhuma alteração ou truncamento em lote é executado.

O tipo do campo é passado explicitamente por Contatos/Empresas e pelo formulário
compartilhado de Técnicos (somente Telefone). A máscara de visualização dos
registros antigos continua preservando seus dígitos. Não há migration ou mudança
de políticas, autorizações, contatos ou consultas de listagem nesta rodada.

## Validação

Cinco cenários de interface passaram: limites distintos em digitação e colagem,
inserção no meio do número completo, substituição, correção de número antigo
sem perda, bloqueio de salvamento de valor antigo acima do limite, máscaras de
Empresas, Delete em separador, edição/exclusão progressivas, gravação dos valores
permitidos e visualização de números antigos sem gravações.

48 testes unitários passaram, incluindo máscaras específicas, limites com DDD,
rejeição de DDI e preservação de dados antigos. TypeScript, lint dos componentes
pequenos/helper e build em cópia isolada sem .env passaram. Testes de interface
usam serviços sintéticos; não houve acesso a credenciais ou envio de mensagens.
A conferência manual no Ubuntu permanece pendente.

## Aplicar no Ubuntu

Parar somente Vite com Ctrl+C e manter o Supabase local ligado:

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

Em um cadastro fictício, preencher Telefone com 1199999999 e WhatsApp com
11999999999. Confirmar as duas máscaras e tentar mais um dígito no fim e no meio.
Colar número maior deve manter o anterior e mostrar o aviso. Corrigir um dígito
selecionado e apagar o número devem continuar possíveis. Não precisa reaplicar
as migrations 0023/0024.

As regressões de Empresas, Contatos e paginação passaram em uma execução:
55 cenários, além dos cinco cenários específicos dos limites de telefone.
