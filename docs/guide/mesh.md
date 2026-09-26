# Malha e materiais

A etapa **Malha** transforma o desenho num problema físico: o MagFEM detecta as **regiões** fechadas, você diz
de que material cada uma é, onde há corrente e quais são as condições de contorno, e então gera a malha de
triângulos.

## Regiões

Toda área fechada pelas curvas vira uma região, detectada automaticamente e numerada ("Região 1", "Região 2"…).
Linhas de construção não formam regiões. A região mantém o que foi atribuído a ela mesmo quando o desenho muda:
ela é identificada por um ponto interno, como os *block labels* do FEMM.

- Clique numa região no desenho para selecioná-la; duplo clique no nome (na árvore) renomeia.
- O rótulo da região pode ser arrastado no desenho.
- Uma região sem material não entra na malha (como no FEMM).

::: warning Curvas sobrepostas
Duas linhas uma sobre a outra no mesmo trecho não fecham regiões direito. Divida as linhas nos pontos de
contato (a [tesoura](./geometry#editar) ajuda) em vez de sobrepor.
:::

## Materiais

Em **Malha › Materiais**, cada região tem uma lista de materiais com busca. A biblioteca fica na gaveta da
direita (**Problema e bibliotecas › Materiais**):

- **Grupos**: ar, condutores, aços (com curva B-H), ímãs e os seus.
- **Propriedades**: permeabilidade relativa μr, condutividade σ (MS/m), remanência Br (T) para ímãs, cor, e os
  coeficientes de Steinmetz para perdas no ferro (k_h, α, k_e; usados na análise AC).
- **Curva B-H**: materiais com curva são não lineares. A curva aparece numa aba própria, com escala linear ou log.
- **Biblioteca do FEMM 4.2**: 245 materiais prontos na busca. **Importar do FEMM…** também lê o `matlib.dat` da
  sua instalação.
- Para ímãs, a **direção de magnetização** (ângulo) é definida na região.

## Circuitos e correntes

Em **Malha › Circuitos**, `+` cria um circuito com uma **corrente** (em A; aceita variáveis e, no transitório,
funções de `t`, como `2*sin(2*pi*60*t)`). Nas propriedades da região, ligue-a a um circuito com um número de
**espiras**; espiras negativas invertem o sentido (ida e volta de uma bobina).

- Todas as regiões de um circuito levam a mesma corrente (circuito **série**). O tipo "paralelo" dos arquivos do
  FEMM é guardado, mas a divisão da corrente entre regiões em paralelo ainda não foi implementada.
- Uma região também pode ter corrente própria, sem circuito.

A densidade de corrente é J = N·I / área da região.

## Contornos

A borda externa do domínio entra automaticamente em **Dirichlet (A = 0)**: o fluxo não atravessa essa borda. Para
outros contornos, clique nas bordas no desenho (Shift para várias) e escolha o contorno; os tipos ficam na gaveta
da direita, com os mesmos nomes do FEMM:

| Tipo | Condição | Uso |
|---|---|---|
| A prescrito (Dirichlet) | A = A0 + A1·x + A2·y (x, y em m) | A = 0 na borda; campo uniforme imposto com A1/A2 |
| Neumann | ∂A/∂n = 0 | simetria magnética: o fluxo cruza a curva perpendicularmente |
| Misto (Robin) | ν ∂A/∂n + c0·A + c1 = 0 | borda aberta assintótica: c0 = 1/(μ0·R), c1 = 0, com R o raio do domínio em m |
| Periódico | A igual no par de curvas | repete o domínio (um polo de uma máquina) |
| Antiperiódico | A com sinal trocado no par | meio período |

Periódico e antiperiódico ligam **pares** de curvas: selecione as duas. A malha é gerada casando os nós das duas
curvas. Os tipos "pequena profundidade de penetração", "imagem dual" e "entreferro periódico" existem para ler
arquivos do FEMM, mas ainda não são resolvidos.

No axissimétrico, o eixo r = 0 tem sempre A = 0 (ψ = r·A se anula no eixo).

## Gerar a malha

A malha usa o **Tangle**, o gerador do FEMM (de David Meeker, licença MIT), compilado para WebAssembly.

- **Elementos**: tamanho padrão do elemento (vazio = automático) e **ângulo mínimo** (qualidade: nenhum
  triângulo terá ângulo interno menor; 30° é um bom padrão, 34° é o máximo aceito). ▶ gera a malha.
- **Regiões**: tamanho do elemento por região, para refinar onde o campo varia mais (entreferro, cantos, núcleo).
- **Por curva**: tamanho ao longo de curvas escolhidas (`m.curve_size` no console).
- As propriedades de **Elementos** mostram nós, triângulos, o menor ângulo e o tempo, com um mapa de qualidade.

Resolver sem malha gera a malha antes, automaticamente.
