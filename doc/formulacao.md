# Formulação e validação

## Magnetostática 2D (núcleo C++ / Eigen)

- **Plano XY:** incógnita A_z; B = (∂A/∂y, −∂A/∂x); −∇·(ν ∇A) = J + termo do ímã.
- **Axissimétrico (r, z):** incógnita ψ = r·A_φ; B_r = −(1/r) ∂ψ/∂z, B_z = (1/r) ∂ψ/∂r; peso 1/r
  no raio do centroide; ψ = 0 no eixo.
- **Materiais:** ν = 1/(μ0 μr) (linear) ou curva B-H (H(B) cúbica monótona; Newton-Raphson com busca linear).
  Ímãs pela remanência: H = ν (B − Br), com direção por região.
- **Fontes:** J = I·N / área da região (I da região ou do circuito).
- **Contornos (como no FEMM):** A prescrito A = A0 + A1·x + A2·y (Dirichlet), Neumann natural, misto
  ν ∂A/∂n + c0 A + c1 = 0 (Robin; no axissimétrico, com ψ = rA: ∮ (c0/r − ν n_r/r²) ψ N_i N_j + c1 N_i, Gauss de
  2 pontos), periódico/antiperiódico por eliminação de nós casados (a Tangle divide as duas curvas em sincronia).
- **Elementos:** triângulos lineares (P1) gerados pela Tangle; LDLᵀ esparsa (estático) ou SparseLU (circuito, AC).

## Transitório

Euler implícito com correntes parasitas σ ∂A/∂t nas regiões condutoras sem fonte; fontes definidas por funções de t
avaliadas a cada passo; acoplamento forte com o circuito externo (sistema monolítico, Newton). Ver também
PLAN.md (rodada 17).

## Harmônico (AC)

(K(ν_ef) + jωσM) Â = Ĵ com fasores complexos (SparseLU complexa). Materiais com curva B-H usam a permeabilidade
efetiva ν_ef = H(B̂)/B̂ com o pico de |B| por elemento, iterada com relaxação (como no FEMM). O fasor é mostrado em um
período: A(t) = Re(Â e^{jωt}). Perdas por correntes parasitas: ½ σ ω² |Â|² (ψ/r no axissimétrico); perdas no ferro
(Steinmetz): k_h f B̂^α + k_e (f B̂)².

## Pós-processamento

- Energia ½∫ν|B − Br|² dV; λ = Σ (N/A) ∫A dΩ × profundidade (plano) ou Σ (N/A) ∫2πψ dΩ (axi);
  L = λ/I; R CC = Σ N² ℓ/(σA).
- Fluxo por uma curva: Φ = −ΔA × profundidade (plano) ou 2πΔψ (axi).
- Interpolação: gradiente recuperado nos nós (por região) + interpolante quadrático por triângulo.
- **Força e torque:** tensor de Maxwell T = (B Bᵀ − ½|B|² I)/μ0. Superfície (ponderado, como o bloco do FEMM):
  F = −∫ T·∇g dV com g = 1 nos nós do corpo e 0 fora (só os elementos de ar em volta contribuem). Linha (contorno
  fechado no ar): F = ∮ T·n dl × profundidade, com B suavizado nos nós. Torque em torno da origem.

## Casos de validação (testes automáticos)

| Caso | Referência | Erro |
|---|---|---|
| Faixa com corrente uniforme (A e energia) | A = μ0 J x(L−x)/2 | < 0,2 % |
| Ímã preenchendo o domínio | B = Br | ~1e-14 |
| Solenoide infinito axissimétrico | B_z = μ0 J (R2 − R1) | < 0,01 % |
| Faixa periódica | A = μ0 J y(2H−y)/2 | < 0,2 % |
| Circuito na faixa | ½ L I² = energia; λ analítico | < 1 % |
| Interpolação quadrática | função quadrática exata | ≪ linear |
| Contorno misto (plano) | A(x) linear | ~1e-14 |
| Contorno misto (axissimétrico) | A = C1 r/2 + C2/r | 3e-6 |
| Ímã axial uniforme (axissimétrico) | B = Br (r > R/4) | 1,8 % (converge com o refino) |
| Não linear | H(B) exato na faixa saturada | cai com o refino |
| Transitório, difusão | série analítica | 6e-4 |
| Circuito acoplado (RL) e transformador | RL discreto; V2 = (N2/N1) V1 | ~1e-15 |
| AC: efeito pelicular numa placa | A = A0 cosh(k(L−x))/cosh(kL) | 1,3e-4 |
| AC: J negativo | Â(−J) = −Â(J) | exato |
| Força num condutor em campo uniforme (E2E) | F = I×B | 0,3 % (sup.) / 1,4 % (linha) |
| Perdas no ferro em campo uniforme (E2E) | k_h f B² V | exato |
| Perdas por correntes parasitas (E2E) | ∝ f² em baixa frequência | razão 3,97 (≈ 4) |
