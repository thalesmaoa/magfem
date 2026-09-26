# Introdução

O **MagFEM** resolve problemas de campo magnético em duas dimensões pelo método dos elementos finitos,
direto no navegador. Serve para indutores, transformadores, atuadores, contatores e, mais adiante,
máquinas girantes. Os problemas podem ser **planos** (seção transversal com profundidade) ou
**axissimétricos** (sólidos de revolução em torno do eixo z).

- **Sem instalação e sem servidor.** O núcleo numérico (C++ e Eigen) é compilado para WebAssembly e roda
  num Web Worker. O projeto fica na sua máquina, como no draw.io.
- **Português e inglês**, tema claro e escuro, e o botão **Citar** no topo.
- **Código aberto** (MIT) no [GitHub](https://github.com/thalesmaoa/magfem). Erros e sugestões:
  [issues](https://github.com/thalesmaoa/magfem/issues).

Abra em <https://thalesmaia.com/tools/magfem-web/>. Funciona melhor no Chrome ou no Edge, que permitem
salvar direto no mesmo arquivo; no Firefox e no Safari, salvar vira download.

## O fluxo de trabalho

A árvore à esquerda segue a ordem do trabalho, como no COMSOL:

1. **Geometria** — o desenho paramétrico (entidades, restrições, cotas e variáveis).
2. **Malha** — materiais das regiões, circuitos, contornos, tamanho dos elementos e a malha.
3. **Método de resolução** — a física (campo magnético ou circuito) e o tipo de análise.
4. **Resultados** — vistas de campo, gráficos e tabelas, cada uma numa aba do canvas.

![Interface do MagFEM com um campo resolvido](/img/field-pt.png){.shot}

## A interface

| Área | O que tem |
|---|---|
| Barra superior | Novo, Abrir, Salvar, Salvar como, Importar, Exportar, Citar, idioma (PT/EN) e tema |
| Barra de ferramentas | desenho, restrições, cota e edição (tesoura, offset, espelho, padrões), mover e agrupar |
| Árvore do modelo | as quatro etapas; o `+` de cada nó cria itens; duplo clique renomeia |
| Propriedades | abaixo da árvore: as propriedades do que está selecionado |
| Canvas | o desenho e as abas de resultados (vistas, gráficos, tabelas, esquemático) |
| Gaveta da direita | **Problema e bibliotecas**: unidade, plano/axissimétrico, profundidade, materiais e contornos |
| Console | cada ação aparece como comando da API; também aceita comandos digitados |
| Barra de status | coordenadas, graus de liberdade, dicas, **Script local**, Bug reports e a versão |

## Próximos passos

- Faça o [primeiro modelo](./first-model): uma bobina axissimétrica com núcleo de aço, do desenho à indutância.
- Veja como desenhar e restringir a [geometria](./geometry).
- Automatize com o [console](../scripting/console) e a [ponte local](../scripting/bridge).
