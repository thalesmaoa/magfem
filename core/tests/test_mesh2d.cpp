#include <cmath>
#include <cstdio>

#include "mesh2d.h"

// Quadrado 2x2 dividido em x=1 (duas regiões); furo 0.5x0.5 na metade esquerda.
int main() {
  magfem::MeshInput in;
  in.xy = {0, 0, 1, 0, 2, 0, 2, 2, 1, 2, 0, 2, 0.25, 0.75, 0.75, 0.75, 0.75, 1.25, 0.25, 1.25};
  in.segments = {0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 0, 6, 7, 7, 8, 8, 9, 9, 6, 1, 4};
  in.segMarkers = {1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 0};
  in.holes = {0.5, 1.0};
  in.regions = {0.1, 1.0, 1, 0.01, 1.7, 1.0, 2, 0.05};
  in.minAngle = 30;
  in.keepBoundary = false;  // contorno grosseiro: o Triangle pode dividir a borda
  magfem::MeshOutput out = magfem::triangulate_pslg(in);
  if (!out.error.empty()) {
    std::printf("erro: %s\n", out.error.c_str());
    return 1;
  }
  const int nt = static_cast<int>(out.triangles.size() / 3);
  double area[3] = {0, 0, 0};
  double minAng = 180;
  for (int t = 0; t < nt; ++t) {
    const int* v = &out.triangles[3 * t];
    double x[3], y[3];
    for (int k = 0; k < 3; ++k) x[k] = out.xy[2 * v[k]], y[k] = out.xy[2 * v[k] + 1];
    const double a = 0.5 * ((x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]));
    if (a <= 0) return std::printf("triângulo %d não anti-horário\n", t), 1;
    const int r = out.triRegion[t];
    if (r < 1 || r > 2) return std::printf("região inválida %d\n", r), 1;
    area[r] += a;
    for (int k = 0; k < 3; ++k) {
      const double ax = x[(k + 1) % 3] - x[k], ay = y[(k + 1) % 3] - y[k];
      const double bx = x[(k + 2) % 3] - x[k], by = y[(k + 2) % 3] - y[k];
      const double ang = std::acos((ax * bx + ay * by) / std::hypot(ax, ay) / std::hypot(bx, by)) * 180 / M_PI;
      if (ang < minAng) minAng = ang;
    }
  }
  std::printf("mesh2d: %d nós, %d triângulos, áreas %.6f / %.6f, ângulo mínimo %.2f°\n", static_cast<int>(out.xy.size() / 2), nt, area[1], area[2], minAng);
  const bool ok = std::fabs(area[1] - 1.75) < 1e-9 && std::fabs(area[2] - 2.0) < 1e-9 && minAng > 29.9 && nt > 100;
  return ok ? 0 : 1;
}
