#pragma once
// Magnetostática 2D linear com elementos triangulares de 1ª ordem.
//   Plano XY:        incógnita A_z;   B = (∂A/∂y, −∂A/∂x)
//   Axissimétrico:   incógnita ψ = r·A_φ (x = r, y = z);  B_r = −(1/r) ∂ψ/∂z,  B_z = (1/r) ∂ψ/∂r
// Unidades SI (coordenadas em metros). Ímãs pela remanência Br (vetor, T) com H = ν (B − Br).
#include <functional>
#include <string>
#include <vector>

namespace magfem {

struct MagInput {
  std::vector<double> xy;       // nós (x, y) em metros
  std::vector<int> triangles;   // 3 nós por triângulo (anti-horário)
  std::vector<int> triRegion;   // índice da região (nos vetores abaixo) de cada triângulo; < 0 = ar
  std::vector<double> nu;       // relutividade por região (1/(μ0 μr)), m/H
  std::vector<double> J;        // densidade de corrente por região (A/m²), fora do plano
  std::vector<double> brx;      // remanência por região, componente x (ou r), T
  std::vector<double> bry;      // componente y (ou z), T
  bool axisymmetric = false;
  std::vector<int> dirichletNodes;
  std::vector<double> dirichletValues;  // A (Wb/m) no plano; ψ (Wb/rad) no axissimétrico
  std::vector<int> periodicSlave;       // nó escravo = sinal × nó mestre
  std::vector<int> periodicMaster;
  std::vector<int> periodicSign;        // +1 periódico, −1 antiperiódico
  // Contorno misto (FEMM "Mixed"): ν ∂A/∂n + c0 A + c1 = 0 em cada aresta (robinA, robinB) do contorno (plano).
  std::vector<int> robinA;
  std::vector<int> robinB;
  std::vector<double> robinC0;  // H/m² … (1/(μ0 R) para borda aberta assintótica)
  std::vector<double> robinC1;

  // Não linear: curva B-H por região (pontos (B, H) crescentes, sem o (0, 0)); bhStart tem nr+1 índices
  // em bhB/bhH (região r usa [bhStart[r], bhStart[r+1])). Região sem pontos = linear (nu).
  std::vector<int> bhStart;
  std::vector<double> bhB;
  std::vector<double> bhH;
  int maxIter = 60;
  double tol = 1e-8;

  // Transitório (steps > 0): Euler implícito, A(0) = 0. Fonte J_r(t) = J[r]·sen(2π f t + jPhase[r]) (f = 0: constante).
  // Correntes parasitas σ ∂A/∂t nas regiões com sigma > 0 (S/m) — bobinas (fonte imposta) devem vir com sigma 0.
  std::vector<double> sigma;
  std::vector<double> jPhase;
  double freq = 0;
  double dt = 0;
  int steps = 0;

  // Circuito externo acoplado (só no transitório). Nós 1..netNodes (0 = terra). Elementos:
  //   tipo 0 R (valor Ω), 1 L (H), 2 C (F), 3 fonte de tensão, 4 fonte de corrente, 5 bobina do FEM (coilIndex).
  //   Fontes: amplitude·sen(2π freq t + fase) + dc. Corrente do elemento: de a para b por dentro dele.
  // Bobina k: regiões coilRegion[coilStart[k]..coilStart[k+1]) com espiras coilTurns (com sinal), resistência coilR[k];
  //   as regiões das bobinas devem vir com J = 0 (a corrente vem do circuito). depth: profundidade (m) no plano.
  int netNodes = 0;
  std::vector<int> elType, elA, elB, elCoil;
  std::vector<double> elValue, elFreq, elPhase, elDC;
  std::vector<int> coilStart, coilRegion;
  std::vector<double> coilTurns, coilR;
  double depth = 1;

  // Fontes por passo (definidas por funções do tempo, avaliadas fora do núcleo):
  //   jSteps: J de cada região em cada passo (steps × regiões; substitui J·sen(ωt));
  //   elSteps: valor de cada elemento-fonte do circuito em cada passo (steps × elementos).
  std::vector<double> jSteps;
  std::vector<double> elSteps;
  // Progresso (passo feito, total) — chamado a cada passo do transitório e a cada iteração de Newton no estático.
  std::function<void(int, int)> progress;
};

struct MagOutput {
  std::vector<double> A;   // potencial por nó (A_z ou ψ)
  std::vector<double> bx;  // B por triângulo (x ou r), T
  std::vector<double> by;  // B por triângulo (y ou z), T
  double energy = 0;       // ∫ w(B) dΩ, w = ∫₀^B H dB (por metro no plano; volume total no axissimétrico), J
  int iterations = 0;      // Newton (último passo)
  // Transitório: A de cada passo (steps × nós) e os tempos.
  std::vector<double> At;
  std::vector<double> times;
  // Circuito: tensões de nó (steps × netNodes) e correntes de elemento (steps × elementos); λ das bobinas (steps × bobinas).
  std::vector<double> nodeV, elI, coilLambda;
  std::string error;
};

MagOutput solve_magnetostatic(const MagInput& in);

/** H(B) pela mesma curva cúbica monótona usada no solver (pontos (B, H) sem o (0, 0)). */
double bh_curve_h(const std::vector<double>& B, const std::vector<double>& H, double b);

}  // namespace magfem
