# Categorias de Chamados — organização e cores

A listagem segue Empresas / Clientes: cartões de totais, busca, filtros rápidos
Todas / Ativas / Inativas e arquivadas, ordenação A–Z/Z–A e cinco registros por
página consultados no banco. Limpar filtros preserva a situação rápida.
A coluna Tipo identifica os registros como Categoria ou Subcategoria.

O formulário oferece sete círculos abaixo do Nome: azul, amarelo, rosa, roxo,
verde, laranja e vermelho. A seleção tem marca de confirmação e prévia com o
nome digitado. Categoria e subcategoria guardam cores independentes.

As etiquetas da tabela e dos vínculos em Empresas usam o mesmo componente,
com contraste próprio em cada tema. Cada família mostra o pai antes dos filhos;
a família padrão vem primeiro. Cada etiqueta mostra somente seu próprio nome,
sem repetir o nome do pai nas subcategorias.
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
- PostgreSQL descartável com migrations 0000–0025: quatorze cenários de contratos
  e segurança, incluindo paleta, vínculos e restrições reais de papel/módulo.
- Treze testes do aplicador: simulação, instalação, repetição e recusa de destino,
  permissões ou definição incompatíveis.
- TypeScript, lint dos componentes novos e build isolado, sem ambiente de produção.

Verificação manual ainda pendente no Ubuntu do operador: criar e editar cores,
recarregar a página e conferir as etiquetas e sua ordem em Empresas / Clientes.

## Compatibilidade com permissões padrão do Supabase

O Supabase local pode conceder SELECT/UPDATE a `anon` por privilégios padrão.
Isso não libera registros quando a RLS está ativa e não há política permissiva
aplicável a esse papel. O aplicador confere RLS, ausência de bypass e políticas
aplicáveis diretamente, por PUBLIC ou por herança de papéis; registra o grant
SQL separadamente. Nenhum GRANT ou política é alterado pela correção.

A versão inicial interrompia a conferência depois de instalar a coluna nesse
ambiente. Basta atualizar o script e repetir o mesmo comando: a definição
compatível já instalada é reconhecida e a migration não é reaplicada.
Os testes incluem grants reais a anon com leitura/atualização bloqueadas e
recusa de uma política pública de leitura, usando a consulta real do aplicador.
