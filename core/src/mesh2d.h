#pragma once
// Geração de malha 2D com a Tangle (David Meeker, MIT; o gerador do FEMM): PSLG com regiões e furos →
// triângulos lineares de qualidade, com contornos periódicos casados nó a nó.
#include <string>
#include <vector>

namespace magfem {

struct MeshInput {
  std::vector<double> xy;        // nós do contorno (x0, y0, x1, y1, ...)
  std::vector<int> segments;     // pares de índices de nós
  std::vector<int> segMarkers;   // marcador por segmento (id da curva de origem, 0 = nenhum)
  std::vector<double> holes;     // pontos dentro de furos (x, y, ...)
  std::vector<double> regions;   // (x, y, atributo, área máxima; <= 0 = sem limite) por região
  double minAngle = 30.0;        // ângulo mínimo de qualidade (graus, <= 34)
  double maxArea = 0.0;          // área máxima global (<= 0 = sem limite)
  // Contornos periódicos: triplas (marcador A, marcador B, tipo 0 = periódico / 1 = antiperiódico);
  // as curvas A e B são divididas em sincronia (mesmo número de nós, casados pela posição).
  std::vector<int> pbc;
};

struct MeshOutput {
  std::vector<double> xy;        // nós (x, y, ...)
  std::vector<int> triangles;    // 3 índices por triângulo (anti-horário)
  std::vector<int> triRegion;    // atributo da região de cada triângulo
  std::vector<int> nodeMarkers;  // marcador do nó (curva da borda) ou 0
  // Nós de cada segmento de entrada depois das divisões, de a até b: segmento s ocupa
  // segChain[segChainStart[s] .. segChainStart[s+1]).
  std::vector<int> segChainStart;
  std::vector<int> segChain;
  std::string error;             // vazio se ok
};

MeshOutput triangulate_pslg(const MeshInput& in);
/** Preenche segChainStart/segChain a partir dos segmentos finais (pares de nós). */
void build_seg_chains(const MeshInput& in, const std::vector<double>& xy, const std::vector<int>& finalSegs, MeshOutput& out);

}  // namespace magfem
