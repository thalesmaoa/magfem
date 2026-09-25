#pragma once
// Geração de malha 2D (Triangle, J. R. Shewchuk): PSLG com regiões e furos → triângulos lineares.
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
  bool keepBoundary = true;      // não divide segmentos da borda (casamento de contornos periódicos)
};

struct MeshOutput {
  std::vector<double> xy;        // nós (x, y, ...)
  std::vector<int> triangles;    // 3 índices por triângulo (anti-horário)
  std::vector<int> triRegion;    // atributo da região de cada triângulo
  std::vector<int> nodeMarkers;  // marcador do nó (curva da borda) ou 0
  std::string error;             // vazio se ok
};

MeshOutput triangulate_pslg(const MeshInput& in);

}  // namespace magfem
