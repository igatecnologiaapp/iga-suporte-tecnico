# Entrada em todos os registros e filtro de tipo

As telas de Empresas, Contatos e Categorias começam com Todas/Todos.
Técnicos inclui inativos na entrada; Chamados começa em Todos também quando
há técnico associado à sessão. Os filtros continuam selecionáveis e a mudança
de situação rápida, sozinha, não habilita Limpar filtros. Ao voltar a outro
cadastro, a situação inicial é restaurada para todos.

As etiquetas de categorias e subcategorias recebem fundos mais fortes nas sete
cores, com texto de contraste próprio em cada tema. Os nomes, associações e
cores gravadas permanecem iguais. O título principal de Page e o nome da página
no cabeçalho de AppShell usam peso 700.

Em Categorias, Filtros / Exibir permite Categorias e subcategorias, Somente
categorias ou Somente subcategorias. O tipo combina com pesquisa, situação e
A–Z/Z–A. A troca volta à primeira página e os contadores respeitam o recorte;
os cartões de resumo continuam gerais. Limpar restaura ambos os tipos e a ordem
A–Z, limpa a pesquisa e conserva a situação rápida escolhida.

## Banco local

A migration 0026 cria `list_paged_categories`, SECURITY INVOKER, sem alterar
funções publicadas ou políticas. Filtra o tipo no banco antes de limitar a cinco
registros. Valida identidade ativa, módulo, tamanho da página e lista permitida
de filtros. Apenas authenticated pode executar a função.

O aplicador confere loopback, container, portas, migrations anteriores (incluindo
a coluna de cor), ordenação ICU, corpo SQL e permissões. Repetir a instalação
compatível não reescreve a função. A evidência fica na pasta privada.

Pare o app com Ctrl+C e execute:

```bash
(
  set -e
  cd ~/projetos/iga-service-homologacao
  git pull --ff-only origin codex/iga-service-fase-1
  IGA_HOMO_PRIVATE="$HOME/iga-homologacao/private" node tests/homologation/apply-category-filters.mjs --apply
  cp -a src/. "$HOME/iga-homologacao/app/src/"
  node "$HOME/iga-homologacao/private/start-app.mjs"
)
```

## Roteiro manual

1. Entrar em Empresas, Contatos, Categorias, Técnicos e Chamados. Conferir
   Todos/Todas na entrada, totais e títulos em negrito. Escolher outra situação,
   sair da seção e voltar para confirmar a situação inicial.
2. Comparar as sete cores de etiquetas nos temas claro e escuro; conferir o
   mesmo resultado em Categorias e nos vínculos das Empresas.
3. Em Categorias, escolher Somente categorias e depois Somente subcategorias.
   Testar busca e Z–A em conjunto. Os resultados não podem misturar os tipos.
4. Com mais de cinco resultados, avançar página e trocar o tipo. Deve voltar à
   primeira página, com totais corretos. Testar também combinação sem resultados.
5. Escolher uma situação rápida e usar Limpar filtros: tipo, ordem e pesquisa
   voltam ao padrão; a situação escolhida permanece.
6. Repetir no celular e com perfil de visualização, que deve poder filtrar sem
   receber ações de edição.

Depois dessa validação, a próxima etapa sugerida é padronizar Técnicos e então
revisar a organização de Chamados. A confirmação manual deste ajuste no Ubuntu
permanece pendente; os cenários automatizados usam dados sintéticos.

## Verificação automatizada da rodada

- 15 cenários específicos de Categorias e entrada em Todos aprovados.
- Regressão de 116 cenários: 114 aprovações na rodada completa; dois testes
  antigos precisaram adequar o estado inicial à entrada em Todos. Os 13 cenários
  dos arquivos de paginação/cabeçalho e contadores passaram após essa adequação,
  incluindo as duas verificações pendentes. Nenhuma correção adicional no app
  foi necessária para essa repetição.
- 58 testes unitários aprovados, incluindo contraste das sete cores nos dois temas.
- 16 cenários de PostgreSQL descartável aprovados com migrations 0000–0026:
  tipos, pesquisa, situação, páginas, contadores, validação e papel/módulo.
- 17 testes do aplicador aprovados, incluindo ICU canônico e coluna de cor ausente.
- TypeScript, lint dos componentes específicos e build em cópia isolada aprovados.
