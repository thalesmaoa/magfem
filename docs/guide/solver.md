# Resolução

Em **Método de resolução** fica a física do problema. O nó **Campo magnético** é criado junto com o projeto;
o `+` ao lado de **Modelo** cria outras físicas, como um **circuito externo**. O ▶ resolve (gerando a malha
antes, se precisar), e mensagens explicam o que falta: região sem material, falta de um contorno com A
prescrito, curva B-H inválida…

## Tipos de análise

Nas propriedades da física, escolha a **análise**:

| Análise | O que resolve | Parâmetros |
|---|---|---|
| Magnetostática | campo de correntes contínuas e ímãs | — |
| Harmônica (AC) | regime senoidal permanente, com fasores | frequência (Hz) |
| Transitória | evolução no tempo, com correntes parasitas | passo Δt e tempo final |

### Magnetostática

Resolve −∇·(ν∇A) = J (mais o termo dos ímãs) com A_z no plano ou ψ = r·A_φ no axissimétrico. Se algum
material tem curva B-H, o problema é **não linear** e resolvido por **Newton-Raphson** com busca linear; o
número de iterações aparece nos resultados.

### Harmônica (AC)

As correntes são **amplitudes de pico** na frequência dada. Condutores com σ > 0 e sem fonte têm **correntes
parasitas**. Materiais com curva B-H usam a permeabilidade efetiva (como no FEMM), iterada até convergir. Os
resultados podem ser vistos ao longo de um período, A(t) = Re(Â e^{jωt}), e as integrais de superfície dão as
**perdas por correntes parasitas** e as **perdas no ferro** (Steinmetz, com os coeficientes do material).

### Transitória

Euler implícito com passo Δt até o tempo final. As correntes podem ser **funções de t**, por exemplo
`10*sin(2*pi*60*t)` ou `5*min(1, t/0.002)` (rampa de 2 ms até 5 A); condutores sem fonte têm correntes parasitas; o aço é não linear a cada
passo. Nos resultados, a vista ganha uma **barra de tempo** e os itens das tabelas viram **curvas no tempo**.

## Circuito externo

Com a física **Circuito**, bobinas do modelo entram num esquemático com fontes, resistores, indutores e
capacitores, resolvidos **junto com o campo** (acoplamento forte). Veja [Circuito externo](./circuit).

## Desempenho

O solver roda num Web Worker, em WebAssembly, sem travar a interface. Problemas com dezenas de milhares de
elementos resolvem em segundos na magnetostática linear. A matriz é esparsa, resolvida por LDLᵀ (estático) ou LU
(AC e circuito). Veja a [formulação](../theory/formulation) para os detalhes.
