// Gerador de malha (Tangle): qualidade, áreas por região, sequências de nós e periódicos casados.
#include <chrono>
#include <cmath>
#include <cstdio>
#include <map>
#include <set>
#include <utility>

#include "mesh2d.h"

// Ângulo mínimo, áreas por região (índice = atributo) e verificação de orientação.
static bool stats(const magfem::MeshOutput& out, double& minAng, std::map<int, double>& area) {
  minAng = 180;
  const int nt = static_cast<int>(out.triangles.size() / 3);
  for (int t = 0; t < nt; ++t) {
    const int* v = &out.triangles[3 * t];
    double x[3], y[3];
    for (int k = 0; k < 3; ++k) x[k] = out.xy[2 * v[k]], y[k] = out.xy[2 * v[k] + 1];
    const double a = 0.5 * ((x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]));
    if (a <= 0) return std::printf("triângulo %d não anti-horário\n", t), false;
    area[out.triRegion[t]] += a;
    for (int k = 0; k < 3; ++k) {
      const double ax = x[(k + 1) % 3] - x[k], ay = y[(k + 1) % 3] - y[k];
      const double bx = x[(k + 2) % 3] - x[k], by = y[(k + 2) % 3] - y[k];
      minAng = std::min(minAng, std::acos((ax * bx + ay * by) / std::hypot(ax, ay) / std::hypot(bx, by)) * 180 / M_PI);
    }
  }
  return true;
}

// Cada sequência vai de a até b do segmento de entrada, andando só por arestas da malha.
static bool chainsOk(const magfem::MeshInput& in, const magfem::MeshOutput& out) {
  std::set<std::pair<int, int>> edges;
  for (size_t t = 0; t < out.triangles.size(); t += 3)
    for (int k = 0; k < 3; ++k) {
      const int a = out.triangles[t + k], b = out.triangles[t + (k + 1) % 3];
      edges.insert({std::min(a, b), std::max(a, b)});
    }
  const int ns = static_cast<int>(in.segments.size() / 2);
  if (static_cast<int>(out.segChainStart.size()) != ns + 1) return false;
  for (int s = 0; s < ns; ++s) {
    const int i0 = out.segChainStart[s], i1 = out.segChainStart[s + 1];
    if (i1 - i0 < 2 || out.segChain[i0] != in.segments[2 * s] || out.segChain[i1 - 1] != in.segments[2 * s + 1]) return false;
    for (int i = i0; i + 1 < i1; ++i) {
      const int a = out.segChain[i], b = out.segChain[i + 1];
      if (!edges.count({std::min(a, b), std::max(a, b)})) return false;
    }
  }
  return true;
}

int main() {
  int fails = 0;
  // 1) Quadrado 2x2 dividido em x=1 (duas regiões); furo 0.5x0.5 na metade esquerda.
  {
    magfem::MeshInput in;
    in.xy = {0, 0, 1, 0, 2, 0, 2, 2, 1, 2, 0, 2, 0.25, 0.75, 0.75, 0.75, 0.75, 1.25, 0.25, 1.25};
    in.segments = {0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 0, 6, 7, 7, 8, 8, 9, 9, 6, 1, 4};
    in.segMarkers = {1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 0};
    in.holes = {0.5, 1.0};
    in.regions = {0.1, 1.0, 1, 0.01, 1.7, 1.0, 2, 0.05};
    in.minAngle = 30;
    magfem::MeshOutput out = magfem::triangulate_pslg(in);
    double minAng = 0;
    std::map<int, double> area;
    const bool ok = out.error.empty() && stats(out, minAng, area) && std::fabs(area[1] - 1.75) < 1e-9 && std::fabs(area[2] - 2.0) < 1e-9 &&
                    minAng > 29.9 && out.triangles.size() / 3 > 100 && chainsOk(in, out);
    std::printf("%s regiões e furo: %zu triângulos, áreas %.6f / %.6f, ângulo mínimo %.2f° %s\n", ok ? "ok  " : "FALHA", out.triangles.size() / 3, area[1], area[2], minAng,
                out.error.c_str());
    fails += !ok;
  }
  // 2) Quadrado com um disco dentro, malha fina; lados esquerdo e direito periódicos (divididos em
  //    sincronia: mesmos y dos dois lados).
  {
    magfem::MeshInput m;
    const int nb = 40, nc = 64;
    for (int i = 0; i < nb; ++i) m.xy.push_back(-1 + 2.0 * i / nb), m.xy.push_back(-1);
    for (int i = 0; i < nb; ++i) m.xy.push_back(1), m.xy.push_back(-1 + 2.0 * i / nb);
    for (int i = 0; i < nb; ++i) m.xy.push_back(1 - 2.0 * i / nb), m.xy.push_back(1);
    for (int i = 0; i < nb; ++i) m.xy.push_back(-1), m.xy.push_back(1 - 2.0 * i / nb);
    const int nsq = 4 * nb;
    for (int i = 0; i < nsq; ++i) m.segments.push_back(i), m.segments.push_back((i + 1) % nsq), m.segMarkers.push_back(1 + i / nb);
    for (int i = 0; i < nc; ++i) m.xy.push_back(0.5 * std::cos(2 * M_PI * i / nc)), m.xy.push_back(0.5 * std::sin(2 * M_PI * i / nc));
    for (int i = 0; i < nc; ++i) m.segments.push_back(nsq + i), m.segments.push_back(nsq + (i + 1) % nc), m.segMarkers.push_back(5);
    m.regions = {0.9, 0.9, 1, 2e-4, 0, 0, 2, 5e-5};
    m.minAngle = 30;
    m.pbc = {2, 4, 0};
    const auto t0 = std::chrono::steady_clock::now();
    magfem::MeshOutput o = magfem::triangulate_pslg(m);
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    std::multiset<double> yl, yr;
    for (size_t i = 0; i < o.xy.size() / 2; ++i) {
      if (std::fabs(o.xy[2 * i] - 1) < 1e-12) yr.insert(std::round(o.xy[2 * i + 1] * 1e9));
      if (std::fabs(o.xy[2 * i] + 1) < 1e-12) yl.insert(std::round(o.xy[2 * i + 1] * 1e9));
    }
    double minAng = 0;
    std::map<int, double> area;
    const bool ok = o.error.empty() && stats(o, minAng, area) && minAng > 29 && yl == yr && o.triangles.size() / 3 > 20000 && chainsOk(m, o);
    std::printf("%s periódico: %zu triângulos em %.0f ms, nós nos lados %zu / %zu (mesmos y: %s), ângulo mínimo %.2f° %s\n", ok ? "ok  " : "FALHA", o.triangles.size() / 3, ms,
                yl.size(), yr.size(), yl == yr ? "sim" : "não", minAng, o.error.c_str());
    fails += !ok;
  }
  return fails ? 1 : 0;
}
