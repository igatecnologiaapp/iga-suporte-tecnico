# Endereço por CEP e Sem número — 27/10/2026

## Comportamento solicitado

Empresas / Clientes consulta o CEP completo após a digitação e preenche Endereço,
Bairro, Cidade e UF. A consulta utiliza o serviço público ViaCEP, enviando somente
os oito dígitos do CEP, sem credenciais ou referência da página. Todos os campos
continuam editáveis. Número e complemento não são obtidos pela consulta.

O rótulo passou a **Complemento (Opcional)**. Ao lado de Número há **Sem número**:
marcar desabilita a entrada e envia S/N no campo existente `address_number`.
Desmarcar durante a mesma edição restaura o número anterior; abrir novamente
um cadastro salvo como S/N reconhece a opção marcada. Não cria coluna nova.

## Preservação e estados da consulta

- Abrir um cadastro com CEP preenchido não inicia consulta nem sobrescreve dados.
- CEP ganha o hífen de apresentação; consulta exige exatamente oito dígitos.
  Entradas maiores não são cortadas para pesquisar um CEP diferente.
- Aguarda 350 ms após a mudança e cancela a consulta antiga ao trocar CEP ou
  fechar o editor. Resposta antiga não se aplica ao CEP novo.
- Campos de endereço editados durante a espera mantêm a edição manual; número
  e complemento são sempre preservados. A resposta só atualiza os quatro campos
  previstos no contrato validado.
- O formulário aguarda a consulta antes de salvar. A espera é limitada a oito
  segundos. Erro ou CEP não encontrado liberam preenchimento manual e nova
  tentativa, preservando os dados existentes.
- CEP geral sem rua/bairro informa que é necessário completar o endereço. Os
  campos sem correspondência ficam vazios, evitando reaproveitar uma rua antiga
  quando o CEP mudou, exceto quando o operador a editou durante a espera.
- Ajustar apenas a pontuação do mesmo CEP não reinicia a consulta ou prende o
  botão Salvar. Limpar CEP mantém o endereço para preenchimento manual.

## Localização do código

[CompanyAddressFields](../../../src/components/iga/CompanyAddressFields.tsx)
concentra o estado do formulário, Sem número, consulta e controle de respostas.
[postal-code](../../../src/lib/postal-code.ts) valida a resposta, limita o destino
a ViaCEP e trata cancelamento/tempo de espera. CompanyFields integra a seção;
ResourcePage evita submissão antes de completar a consulta. As funções novas
possuem comentários internos e estão indicadas no [mapa](../CODE-MAP.md).

Não altera permissões, consultas paginadas, migrations ou regras dos campos
obrigatórios. O envio continua usando os campos existentes do cadastro.

## Verificações

- Sete cenários de interface passaram: consulta completa e persistência,
  preservação de número/complemento, edição durante a espera, CEP ausente/falha/
  nova tentativa, troca de CEP, cancelamento do editor, S/N e reabertura, CEP
  geral e ausência de consulta automática ao abrir cadastro existente.
- A suíte completa passou com 101 testes de interface.
- 55 testes unitários passaram, incluindo contrato/destino da consulta, ausência
  de credenciais, resposta de outro CEP, UF/cidade inválidas, limite de espera e
  cancelamento. TypeScript, lint dos componentes pequenos/helper e build em
  cópia isolada sem .env aprovados.
- As consultas dos testes são simuladas. Uma tentativa de verificação pública
  no executor não completou (URLError); disponibilidade real do serviço não foi
  confirmada a partir desse ambiente. Conferência com CEP real no navegador do
  operador permanece pendente. Falhas reais têm o preenchimento manual previsto.
- Não houve envio de dados da empresa ao serviço: somente CEP é necessário.
  Sem migração, envio de mensagem, alteração de senha ou publicação nesta rodada.

## Aplicar no Ubuntu

Manter Supabase local ligado e parar somente Vite com Ctrl+C:

```bash
cd ~/projetos/iga-service-homologacao
(
  set -e
  git pull --ff-only
  cp --parents \
    src/components/iga/{CompanyAddressFields,CompanyFields,ResourcePage}.tsx \
    src/lib/postal-code.ts "$HOME/iga-homologacao/app/"
  node "$HOME/iga-homologacao/private/start-app.mjs"
)
```

Abrir uma empresa fictícia, informar um CEP conhecido e conferir os quatro
campos retornados. Informar número/complemento manualmente ou marcar Sem número,
salvar e reabrir para confirmar. Conferir também cancelamento sem salvar.

Capturas sintéticas da seção de endereço nos dois temas:
`../screenshots/company-address-cep-{light,dark}.png`.
