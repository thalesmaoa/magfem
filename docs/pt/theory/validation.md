# Validação

Cada caso abaixo é um **teste automático** (nativo em C++, unitário ou E2E) que compara o MagFEM com uma solução
analítica. Eles rodam a cada mudança no código.

| Caso | Referência | Erro |
|---|---|---|
| Faixa com corrente uniforme (A e energia) | $A = \mu_0 J x(L-x)/2$ | < 0,2 % |
| Ímã preenchendo o domínio | $B = B_r$ | ~1e-14 |
| Solenoide infinito axissimétrico | $B_z = \mu_0 J (R_2 - R_1)$ | < 0,01 % |
| Faixa periódica | $A = \mu_0 J y(2H-y)/2$ | < 0,2 % |
| Circuito na faixa | $\tfrac{1}{2} L I^2 =$ energia; λ analítico | < 1 % |
| Interpolação quadrática | função quadrática exata | ≪ linear |
| Contorno misto (plano) | $A(x)$ linear | ~1e-14 |
| Contorno misto (axissimétrico) | $A = C_1 r/2 + C_2/r$ | 3e-6 |
| Ímã axial uniforme (axissimétrico) | $B = B_r$ ($r > R/4$) | 1,8 % (cai com o refino) |
| Não linear | $H(B)$ exato na faixa saturada | cai com o refino |
| Transitório, difusão | série analítica | 6e-4 |
| Circuito acoplado (RL) e transformador | RL discreto; $V_2 = (N_2/N_1) V_1$ | ~1e-15 |
| AC: efeito pelicular numa placa | $A = A_0 \cosh(k(L-x))/\cosh(kL)$ | 1,3e-4 |
| AC: J negativo | $\hat{A}(-J) = -\hat{A}(J)$ | exato |
| Força num condutor em campo uniforme | $F = I \times B$ | 0,3 % (superfície) / 1,4 % (linha) |
| Perdas no ferro em campo uniforme | $k_h f B^2 V$ | exato |
| Perdas por correntes parasitas | $\propto f^2$ em baixa frequência | razão 3,97 (≈ 4) |

Os testes ficam em `core/tests` (núcleo nativo), `web/src/**/*.test.ts` (unitários) e `web/e2e` (ponta a ponta).
Para rodar tudo: `./scripts/check`.

## Comparação com o FEMM

O MagFEM usa o mesmo gerador de malha (Tangle) e as mesmas convenções de contorno e de materiais do FEMM, e importa
arquivos `.fem`: é fácil resolver o mesmo modelo nos dois e comparar energia, fluxo concatenado e força.
