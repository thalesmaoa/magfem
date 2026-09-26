# Circuito externo

Bobinas de verdade são alimentadas por circuitos: uma fonte de tensão com resistência em série, um transformador
com carga, um capacitor descarregando numa bobina. O MagFEM resolve o **campo e o circuito juntos**, num único
sistema de equações (acoplamento forte), na análise transitória.

## Criar o circuito

1. O `+` ao lado de **Modelo** cria um **Circuito**, que abre numa aba com o esquemático.
2. O esquemático já traz um bloco **Bobina (FEM)** para cada circuito da Malha: é a bobina do modelo de campo, com
   a indutância e o acoplamento calculados pelo FEM.
3. Na barra superior do esquemático, adicione **fontes de tensão ou de corrente**, **resistores**, **indutores**,
   **capacitores** e o **Terra** (obrigatório).
4. Clique num terminal e depois em outro para ligar um **fio**. Arraste os blocos para organizar e os trechos do
   fio para mudar o caminho.

| Tecla | Ação |
|---|---|
| `W` | modo fio |
| `R` | girar o componente |
| `M` | espelhar |
| `Del` | apagar |
| roda do mouse | zoom |

## Fontes

Uma fonte tem amplitude, frequência, fase e nível CC, ou uma **expressão em t** (em segundos) que usa as
variáveis do projeto: `V0*sin(2*pi*60*t)`, `24` para CC, `24*min(1, t/0.001)` para uma rampa rápida (1 ms). As expressões usam `+ - * / ^`, `pi` e funções como `sin`, `cos`, `exp`, `sqrt`, `abs`, `min` e `max`.

## Resolver e ver os sinais

Resolva a física de campo na análise **transitória**: as bobinas do esquemático recebem a corrente do circuito a
cada passo. Depois de resolver, clique num componente para ver **i(t)** e **v(t)**; os sinais marcados aparecem
embaixo do esquemático.

Exemplos típicos:

- **Circuito RL**: fonte de tensão, resistor e a bobina. A corrente sobe com a constante de tempo L/R, com L vinda
  do FEM (e variando se o aço saturar).
- **Transformador**: fonte de tensão no primário e carga resistiva no secundário. Com acoplamento perfeito,
  V2 = (N2/N1)·V1.

::: tip Circuito por código
Para acoplar também o **movimento** (um êmbolo que se desloca com a força magnética), use a
[ponte local](../scripting/bridge): o exemplo do [contator](../scripting/examples#contator) integra circuito,
campo e mecânica num laço em Python.
:::
