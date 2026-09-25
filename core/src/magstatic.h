#pragma once
// Magnetostática 2D linear com elementos triangulares de 1ª ordem.
//   Plano XY:        incógnita A_z;   B = (∂A/∂y, −∂A/∂x)
//   Axissimétrico:   incógnita ψ = r·A_φ (x = r, y = z);  B_r = −(1/r) ∂ψ/∂z,  B_z = (1/r) ∂ψ/∂r
// Unidades SI (coordenadas em metros). Ímãs pela remanência Br (vetor, T) com H = ν (B − Br).
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
};

struct MagOutput {
  std::vector<double> A;   // potencial por nó (A_z ou ψ)
  std::vector<double> bx;  // B por triângulo (x ou r), T
  std::vector<double> by;  // B por triângulo (y ou z), T
  double energy = 0;       // ∫ ½ ν |B − Br|² dΩ (por metro de profundidade no plano; volume total no axissimétrico), J
  std::string error;
};

MagOutput solve_magnetostatic(const MagInput& in);

}  // namespace magfem
