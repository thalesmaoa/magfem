# Geometria (CAD)

O desenho do MagFEM é **paramétrico**, no estilo do Onshape: você desenha à mão livre e depois prende a forma
com **restrições** (horizontal, tangente, coincidente…) e **cotas** (distâncias, raios, ângulos). As cotas
aceitam unidades e expressões com variáveis, então mudar uma variável redesenha o modelo inteiro. O solver de
restrições é o PlaneGCS, o mesmo do FreeCAD.

## Ferramentas de desenho

| Ferramenta | Tecla | Uso |
|---|---|---|
| Selecionar | `S` ou `Esc` | clique seleciona, Shift adiciona; arraste para mover |
| Medir (régua) | `U` | dois cliques medem distância; não muda o desenho |
| Linha / polilinha | `L` | cada clique continua a polilinha; termina ao fechar num ponto existente, com duplo clique ou com `Esc` |
| Linha de construção | `Shift+L` | linha auxiliar: guia o desenho mas não forma regiões |
| Retângulo | `R` | dois cantos opostos (nasce agrupado, com H/V) |
| Retângulo pelo centro | `Shift+R` | centro e um canto (simétrico em torno do centro) |
| Círculo | `C` | centro e um ponto da borda |
| Arco por três pontos | `A` | início, fim e um ponto do arco |
| Arco pelo centro | `Shift+A` | centro, início e fim (o movimento do mouse escolhe o sentido) |
| Ponto | `P` | ponto livre (útil como referência de cotas) |

Os botões com uma setinha agrupam variantes (linha/construção, retângulo/pelo centro, arco por três
pontos/pelo centro); o botão mostra a última variante usada.

## Encaixes (snap)

Durante o desenho, o cursor encaixa, nesta ordem, em:

1. **pontos** existentes (pontas, centros, a Origem): o novo ponto passa a ser o mesmo ponto;
2. **pontos médios** de linhas: cria a restrição "ponto médio";
3. **curvas**: cria "ponto sobre a curva";
4. **eixos x e y** (r e z no axissimétrico): cria uma restrição vertical ou horizontal com a Origem.

Na linha, o segundo ponto também infere **horizontal ou vertical** quando está quase alinhado, e encaixa na
interseção dessa direção com a curva mais próxima. Todas essas restrições aparecem na árvore
(**Geometria › Restrições**) e podem ser apagadas.

::: tip A Origem
Clicar na origem cria um ponto próprio com a restrição **Coincidente** com a Origem. Para soltar a peça, apague
essa restrição. Desenhos antigos em que a curva usa a própria Origem mostram **Soltar da origem** no painel de
propriedades.
:::

## Restrições

Selecione as entidades e clique no botão da restrição (ou use a tecla).

| Restrição | Tecla | Entidades |
|---|---|---|
| Coincidente | `I` | dois pontos, ou ponto e curva (ponto sobre) |
| Horizontal / Vertical | `H` / `V` | uma linha, ou dois pontos |
| Paralela / Perpendicular | | duas linhas |
| Tangente | `T` | linha e arco/círculo, ou dois arcos/círculos |
| Igual | `E` | duas linhas (comprimento) ou dois arcos/círculos (raio) |
| Ponto médio | `M` | ponto e linha |
| Simétrica | | dois pontos e um eixo (linha) |
| Concêntrica | | dois arcos/círculos |
| Fixar | | prende pontos na posição atual |

A cor mostra o estado: **azul** ainda tem graus de liberdade, **preto** (ou branco no tema escuro) está
totalmente definido. A barra de status mostra quantos graus de liberdade faltam. Uma restrição que conflita
com as outras é recusada, com uma mensagem na barra de status.

## Cotas e variáveis

Com a ferramenta **Cota** (`D`), clique numa entidade (ou em duas) e depois onde quer o texto; digite o valor.

- Uma linha ou dois pontos dão distância; a posição do texto escolhe entre a distância **alinhada**,
  **horizontal** ou **vertical**.
- Um círculo dá diâmetro; um arco dá raio; duas linhas dão ângulo; ponto e linha dão a distância ponto-linha.
- O valor aceita número (na unidade do projeto), número com unidade (`2 cm`, `0.5 in`) ou expressão com
  variáveis (`Ds/2 - g`).

As variáveis ficam em **Geometria › Variáveis** (`+` cria). Um duplo clique numa cota edita o valor.

## Editar

| Ação | Tecla | Descrição |
|---|---|---|
| Tesoura | `X` | clique no trecho da curva para removê-lo, até as interseções mais próximas. Numa ponta, encurta; no meio, divide em duas; um círculo cortado vira arco; uma curva sem cruzamentos é apagada |
| Offset | `O` | cópia paralela a uma distância (associativa: segue o original) |
| Espelho | | reflete a seleção em torno de uma linha ou eixo |
| Padrão linear / circular | | cópias em grade ou em volta de um centro |
| Mover / girar | `G` | translada e gira a seleção por valores digitados |
| Agrupar / Desagrupar | `Ctrl+G` / `Ctrl+Shift+G` | o grupo é selecionado e movido como uma peça; duplo clique entra no grupo para editar uma entidade |
| Construção | `Q` | alterna a curva entre normal e de construção |
| Apagar | `Del` | apaga a seleção |
| Ajustar à tela | `F` | enquadra o desenho |
| Desfazer / Refazer | `Ctrl+Z` / `Ctrl+Shift+Z` (ou `Ctrl+Y`) | |

Offset, espelho e padrões são **associativos**: a cópia acompanha o original quando ele muda, e a distância ou
o número de cópias ficam editáveis nas propriedades.

## Seleção por caixa

Como nos CADs, arrastar uma caixa **para a direita** seleciona o que está inteiramente dentro dela; **para a
esquerda**, seleciona tudo que ela toca.

## Plano e axissimétrico

Na gaveta **Problema e bibliotecas** escolha o tipo de problema e a **unidade** de comprimento:

- **Plano**: x e y; informe a **profundidade** (comprimento na direção z), usada no fluxo concatenado, na
  energia e na força.
- **Axissimétrico**: r (horizontal) e z (vertical), com o eixo de simetria em r = 0. Só o semiplano r ≥ 0 vale;
  ele fica destacado e o MagFEM avisa quando algo é desenhado em r < 0.

## Importar geometria

**Importar** aceita DXF e SVG: as curvas entram no desenho e pontos coincidentes são unidos, para as regiões
fecharem. Veja também [Arquivos, importar e exportar](./files).
