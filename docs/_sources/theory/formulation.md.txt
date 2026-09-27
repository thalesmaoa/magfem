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

**Chapas laminadas.** Com fator de empilhamento $f$, chapa e isolante ficam em paralelo na profundidade:
$B(H) = f\,B_{aço}(H) + (1-f)\,\mu_0 H$ (linear: $\mu_{ef} = f\mu_r + 1 - f$), sem condutividade de bloco. As perdas
no ferro usam o volume de aço e $B_{aço} = B/f$, ou seja, coeficientes $k_h f^{1-\alpha}$ e $k_e/f$ sobre o volume da
região; a parcela clássica das parasitas na chapa de espessura $d$ é $k_e = \pi^2\sigma d^2/6$.

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

### Perdas CA nos fios

Com $\delta = \sqrt{2/(\omega\mu_0\sigma)}$ e $k = (1-j)/\delta$, para um fio redondo de raio $a$:

- **Pelicular:** $R_{ca}/R_{cc} = \mathrm{Re}\left[\tfrac{ka}{2}\,J_0(ka)/J_1(ka)\right]$ (baixa frequência
  $1 + (a/\delta)^4/48$; alta, $a/(2\delta) + 1/4 + 3\delta/(32a)$). $P_{pel} = F\,R_{cc}\,\hat I^2/2$.
- **Proximidade** (campo transversal de pico $\hat B$), por metro de fio:
  $P' = \tfrac{\pi\omega^2\sigma}{2}|D|^2\int_0^a |J_1(kr)|^2 r\,dr$, $D = 2\hat B/(k J_0(ka))$; baixa frequência
  $\pi\sigma\omega^2\hat B^2 a^4/8$. Somada nos elementos da bobina com $|N|\cdot n_{par}/A$ fios por área.
- **Retangular** ($w \times h$): Dowell em cada direção, $P' = w\,P'_{lâm}(h, \hat B_x) + h\,P'_{lâm}(w, \hat B_y)$, com
  $P'_{lâm} = \tfrac{H_0^2}{\sigma\delta}\,\tfrac{\sinh\xi - \sin\xi}{\cosh\xi + \cos\xi}$, $\xi = t/\delta$; pelicular
  pela lâmina de espessura $\min(w, h)$ (aproximação).

## Térmica em regime

$-\nabla\cdot(k\nabla T) = q$ no sólido (P1; peso $2\pi r$ no axissimétrico), com convecção
$-k\,\partial T/\partial n = h\,(T - T_{ref})$ nas bordas expostas, faces da profundidade no plano como sumidouro
$2h/d\,(T - T_{amb})$, e temperatura fixa. $q$ vem da física magnética: $J^2/(2\sigma)$ nas bobinas (AC; com o fio,
$\times A_{região}/(|N| A_{espira})$ e o fator pelicular), proximidade, $\tfrac12\sigma\omega^2|\hat A|^2$ nos maciços e
Steinmetz no ferro. Canais de ar: $T_{ar} = T_{entrada} + P/(2\rho c_p Q)$. Resistividade:
$\rho(T) = \rho_{20}[1 + \alpha(T - 20)]$, iterando com o AC. Gradiente conjugado com Jacobi.

## Pós-processamento

- Energia: $W = \tfrac{1}{2}\int \nu\,|\mathbf{B} - \mathbf{B}_r|^2\, dV$.
- Fluxo concatenado: $\lambda = \sum (N/S)\int A\, d\Omega \times$ profundidade (plano) ou
  $\sum (N/S)\int 2\pi\psi\, d\Omega$ (axissimétrico); $L = \lambda/I$; $R_{CC} = \sum N^2 \ell/(\sigma S)$, ou $\sum |N|\,\ell/(\sigma A_{espira})$ com o fio definido.
- Fluxo por uma curva: $\Phi = -\Delta A \times$ profundidade (plano) ou $2\pi\,\Delta\psi$ (axissimétrico).
- Interpolação: gradiente recuperado nos nós (por região) e interpolante quadrático por triângulo.

### Força e torque

Pelo tensor de Maxwell, $T = (\mathbf{B}\mathbf{B}^\mathsf{T} - \tfrac{1}{2}|\mathbf{B}|^2 I)/\mu_0$:

- **Superfície** (ponderado, como o *block integral* do FEMM): $\mathbf{F} = -\int T\cdot\nabla g\, dV$, com
  $g = 1$ nos nós do corpo e $0$ fora; só os elementos de ar em volta contribuem.
- **Linha** (contorno fechado no ar): $\mathbf{F} = \oint T\cdot\mathbf{n}\, dl \times$ profundidade, com B
  suavizado nos nós.

O torque é em torno da origem.
