# Formulação

O núcleo numérico é C++17 com Eigen, compilado para WebAssembly (e nativo, para os testes). Elementos triangulares
lineares (P1) gerados pelo Tangle.

## Magnetostática

**Plano (x, y).** A incógnita é o potencial vetor $A_z$, com

$$
\mathbf{B} = \left(\frac{\partial A}{\partial y},\; -\frac{\partial A}{\partial x}\right),
\qquad
-\nabla\cdot\left(\nu\,\nabla A\right) = J + \nabla\times(\nu\,\mathbf{B}_r),
$$

onde $\nu = 1/\mu$ é a relutividade e $\mathbf{B}_r$ a remanência dos ímãs.

**Axissimétrico (r, z).** A incógnita é $\psi = r\,A_\varphi$, que se anula no eixo:

$$
B_r = -\frac{1}{r}\frac{\partial \psi}{\partial z},
\qquad
B_z = \frac{1}{r}\frac{\partial \psi}{\partial r},
$$

com peso $1/r$ avaliado no raio do centroide de cada elemento.

**Materiais.** Linear, $\nu = 1/(\mu_0\mu_r)$, ou não linear pela curva B-H: $H(B)$ por uma cúbica monótona e
Newton-Raphson com busca linear. Ímãs pela remanência, $\mathbf{H} = \nu(\mathbf{B} - \mathbf{B}_r)$, com a direção
definida na região.

**Fontes.** $J = N\,I/S$, com $N$ espiras, corrente $I$ (da região ou do circuito) e área $S$ da região.

## Condições de contorno

Como no FEMM:

- **A prescrito** (Dirichlet): $A = A_0 + A_1 x + A_2 y$.
- **Neumann** (natural): $\partial A/\partial n = 0$.
- **Misto** (Robin): $\nu\,\partial A/\partial n + c_0 A + c_1 = 0$. No axissimétrico, com $\psi = rA$, a
  contribuição de contorno é $\oint (c_0/r - \nu\, n_r/r^2)\,\psi\, N_i N_j + c_1 N_i$, integrada por Gauss de 2
  pontos. Borda aberta assintótica: $c_0 = 1/(\mu_0 R)$.
- **Periódico e antiperiódico**: eliminação dos nós casados (a Tangle divide as duas curvas em sincronia).

## Solução

- Estático: LDLᵀ esparsa (`SimplicialLDLT`).
- Circuito e AC: LU esparsa (`SparseLU`, complexa no AC).
- Não linear: Newton-Raphson com busca linear.

## Transitório

Euler implícito com correntes parasitas nas regiões condutoras sem fonte:

$$
\sigma\,\frac{\partial A}{\partial t} - \nabla\cdot(\nu\,\nabla A) = J(t).
$$

As fontes são funções de $t$ avaliadas a cada passo. O circuito externo entra no mesmo sistema (acoplamento forte,
monolítico), resolvido por Newton a cada passo.

## Harmônico (AC)

Com fasores,

$$
\left(K(\nu_{ef}) + j\omega\,\sigma M\right)\hat{A} = \hat{J}.
$$

Materiais com curva B-H usam a permeabilidade efetiva $\nu_{ef} = H(\hat{B})/\hat{B}$ com o pico de $|B|$ por
elemento, iterada com relaxação (como no FEMM). O campo é mostrado ao longo de um período,
$A(t) = \mathrm{Re}(\hat{A}\,e^{j\omega t})$.

- Perdas por correntes parasitas: $\tfrac{1}{2}\,\sigma\,\omega^2 |\hat{A}|^2$ ($\psi/r$ no axissimétrico).
- Perdas no ferro (Steinmetz): $p = k_h f \hat{B}^{\alpha} + k_e (f \hat{B})^2$.

## Pós-processamento

- Energia: $W = \tfrac{1}{2}\int \nu\,|\mathbf{B} - \mathbf{B}_r|^2\, dV$.
- Fluxo concatenado: $\lambda = \sum (N/S)\int A\, d\Omega \times$ profundidade (plano) ou
  $\sum (N/S)\int 2\pi\psi\, d\Omega$ (axissimétrico); $L = \lambda/I$; $R_{CC} = \sum N^2 \ell/(\sigma S)$.
- Fluxo por uma curva: $\Phi = -\Delta A \times$ profundidade (plano) ou $2\pi\,\Delta\psi$ (axissimétrico).
- Interpolação: gradiente recuperado nos nós (por região) e interpolante quadrático por triângulo.

### Força e torque

Pelo tensor de Maxwell, $T = (\mathbf{B}\mathbf{B}^\mathsf{T} - \tfrac{1}{2}|\mathbf{B}|^2 I)/\mu_0$:

- **Superfície** (ponderado, como o *block integral* do FEMM): $\mathbf{F} = -\int T\cdot\nabla g\, dV$, com
  $g = 1$ nos nós do corpo e $0$ fora; só os elementos de ar em volta contribuem.
- **Linha** (contorno fechado no ar): $\mathbf{F} = \oint T\cdot\mathbf{n}\, dl \times$ profundidade, com B
  suavizado nos nós.

O torque é em torno da origem.
