# Validation

Each case below is an **automated test** (native C++, unit or end-to-end) that compares MagFEM with an analytical
solution. They run on every code change.

| Case | Reference | Error |
|---|---|---|
| Strip with uniform current (A and energy) | $A = \mu_0 J x(L-x)/2$ | < 0.2 % |
| Magnet filling the domain | $B = B_r$ | ~1e-14 |
| Infinite axisymmetric solenoid | $B_z = \mu_0 J (R_2 - R_1)$ | < 0.01 % |
| Periodic strip | $A = \mu_0 J y(2H-y)/2$ | < 0.2 % |
| Circuit in the strip | $\tfrac{1}{2} L I^2 =$ energy; analytical λ | < 1 % |
| Quadratic interpolation | exact quadratic function | ≪ linear |
| Mixed boundary (planar) | linear $A(x)$ | ~1e-14 |
| Mixed boundary (axisymmetric) | $A = C_1 r/2 + C_2/r$ | 3e-6 |
| Uniform axial magnet (axisymmetric) | $B = B_r$ ($r > R/4$) | 1.8 % (drops with refinement) |
| Nonlinear | exact $H(B)$ in the saturated range | drops with refinement |
| Transient diffusion | analytical series | 6e-4 |
| Coupled circuit (RL) and transformer | discrete RL; $V_2 = (N_2/N_1) V_1$ | ~1e-15 |
| AC: skin effect in a plate | $A = A_0 \cosh(k(L-x))/\cosh(kL)$ | 1.3e-4 |
| AC: negative J | $\hat{A}(-J) = -\hat{A}(J)$ | exact |
| Force on a conductor in a uniform field | $F = I \times B$ | 0.3 % (surface) / 1.4 % (line) |
| Iron losses in a uniform field | $k_h f B^2 V$ | exact |
| Laminated sheets: losses with factor $f$ and $k_e = \pi^2\sigma d^2/6$ | steel volume $f V$ with $B/f$ | exact |
| Laminated sheets: equivalent material | $\nu = 1/(\mu_0(f\mu_r + 1 - f))$; $B = fB_{steel} + (1-f)\mu_0H$ | exact |
| DC R with AWG wire (axisymmetric) | $N\,2\pi r/(\sigma A_{wire})$ | < 0.2 % |
| Skin, round wire | $1 + (a/\delta)^4/48$ and $a/(2\delta) + 1/4$ | < 1e-5 |
| Proximity, round wire in a uniform field | $N\,\ell\,\pi\sigma\omega^2\hat B^2 a^4/8$ (low frequency) | < 0.1 % |
| Thermal: slab with generation and convection | $T = T_{amb} + qL/2h + q x(L-x)/2k$ | < 0.1 K |
| Thermal: axisymmetric cylinder | $T = T_{amb} + qR/2h + q(R^2-r^2)/4k$ | < 0.1 K |
| Thermal: fan (air balance) | $T_{out} = T_{in} + P/(\rho c_p Q)$ | < 1e-3 |
| Thermal with σ(T) (DC block) | $T = T_{amb} + P_{20}(1+\alpha(T-20))/(hS)$ | < 0.05 K |
| Proximity, rectangular wire (Dowell) | $\sigma\omega^2\hat B^2 t^3/24$ per width | < 0.1 % |
| Eddy-current losses | $\propto f^2$ at low frequency | ratio 3.97 (≈ 4) |

The tests live in `core/tests` (native core), `web/src/**/*.test.ts` (unit) and `web/e2e` (end-to-end). To run them
all: `./scripts/check`.

## Comparison with FEMM

MagFEM uses the same mesh generator (Tangle) and the same boundary and material conventions as FEMM, and imports
`.fem` files: it is easy to solve the same model in both and compare energy, flux linkage and force.
