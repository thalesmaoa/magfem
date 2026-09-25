# Formulação e validação

## Magnetostática 2D (núcleo C++ / Eigen)

- **Plano XY:** incógnita A_z; B = (∂A/∂y, −∂A/∂x); −∇·(ν ∇A) = J + termo do ímã.
- **Axissimétrico (r, z):** incógnita ψ = r·A_φ; B_r = −(1/r) ∂ψ/∂z, B_z = (1/r) ∂ψ/∂r; peso 1/r
  no raio do centroide; ψ = 0 no eixo.
- **Materiais:** ν = 1/(μ0 μr) (linear). Ímãs pela remanência: H = ν (B − Br), com direção por região.
  *Curvas B-H: por enquanto usa-se o μr linear (o solver não linear está no roteiro).*
- **Fontes:** J = I·N / área da região (I da região ou do circuito).
- **Contornos:** A prescrito (Dirichlet), Neumann natural, periódico/antiperiódico por eliminação de
  nós casados (a malha força o mesmo número de divisões nas duas curvas).
- **Elementos:** triângulos lineares (P1); sistema simétrico resolvido por Cholesky esparsa.

## Pós-processamento

- Energia ½∫ν|B − Br|² dV; λ = Σ (N/A) ∫A dΩ × profundidade (plano) ou Σ (N/A) ∫2πψ dΩ (axi);
  L = λ/I; R CC = Σ N² ℓ/(σA).
- Fluxo por uma curva: Φ = −ΔA × profundidade (plano) ou 2πΔψ (axi).
- Interpolação: gradiente recuperado nos nós (por região) + interpolante quadrático por triângulo.

## Casos de validação (testes automáticos)

| Caso | Referência | Erro |
|---|---|---|
| Faixa com corrente uniforme (A e energia) | A = μ0 J x(L−x)/2 | < 0,2 % |
| Ímã preenchendo o domínio | B = Br | ~1e-14 |
| Solenoide infinito axissimétrico | B_z = μ0 J (R2 − R1) | < 0,01 % |
| Faixa periódica | A = μ0 J y(2H−y)/2 | < 0,2 % |
| Circuito na faixa | ½ L I² = energia; λ analítico | < 1 % |
| Interpolação quadrática | função quadrática exata | ≪ linear |
