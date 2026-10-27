# Categorias de Chamados — organização e cores

A listagem segue Empresas / Clientes: cartões de totais, busca, filtros rápidos
Todas / Ativas / Inativas e arquivadas, ordenação A–Z/Z–A e cinco registros por
página consultados no banco. Limpar filtros preserva a situação rápida.

O formulário oferece sete círculos abaixo do Nome: azul, amarelo, rosa, roxo,
verde, laranja e vermelho. A seleção tem marca de confirmação e prévia com o
nome digitado. Categoria e subcategoria guardam cores independentes.

As etiquetas da tabela e dos vínculos em Empresas usam o mesmo componente,
com contraste próprio em cada tema. Cada família mostra o pai antes dos filhos;
a família padrão vem primeiro e a subcategoria conserva o prefixo do pai.
A ordenação visual não cria nem remove associações.

A edição de subcategoria conserva o pai atual mesmo quando estiver inativo.
Os demais pais disponíveis continuam sendo categorias principais ativas.
Permissões de papel e módulo, arquivamento e exclusão continuam vigentes.

## Banco e atualização local

A migration 0025 acrescenta apenas `ticket_categories.color`, obrigatória,
com azul como padrão e CHECK das sete escolhas. Não altera nomes, situação,
parentesco, vínculos, políticas nem funções publicadas de paginação. Instale-a
antes de copiar a interface: as consultas novas pedem a coluna `color`.

O aplicador abaixo verifica API loopback, container, portas, pré-requisitos,
definição instalada e permissões. Pode ser repetido quando a coluna já estiver
compatível. O resultado fica na pasta privada; nenhuma credencial é exibida.

Interrompa o app com Ctrl+C e execute no Ubuntu:

```bash
(
  set -e
  cd ~/projetos/iga-service-homologacao
  git pull --ff-only origin codex/iga-service-fase-1
  IGA_HOMO_PRIVATE="$HOME/iga-homologacao/private" node tests/homologation/apply-category-colors.mjs --apply
  cp -a src/. "$HOME/iga-homologacao/app/src/"
  node "$HOME/iga-homologacao/private/start-app.mjs"
)
```

## Validação

- Nove cenários específicos de interface: totais e paginação, pesquisa e ordem,
  limpar filtros, pai arquivado, perfil de visualização, 360/1440 px nos dois
  temas, seleção e persistência de cor e pai antes de filho em Empresas.
- Regressão completa: 110 cenários de interface aprovados.
- 58 testes unitários aprovados verificam paleta, contraste dos textos, agrupamento,
  ausência de pai e preservação dos dados de entrada.
- PostgreSQL descartável com migrations 0000–0025: treze cenários de contratos
  e segurança, incluindo paleta, vínculos e restrições reais de papel/módulo.
- Dez testes do aplicador: simulação, instalação, repetição e recusa de destino,
  permissões ou definição incompatíveis.
- TypeScript, lint dos componentes novos e build isolado, sem ambiente de produção.

Verificação manual ainda pendente no Ubuntu do operador: criar e editar cores,
recarregar a página e conferir as etiquetas e sua ordem em Empresas / Clientes.
