// Utilitários comuns da malha: sequência de nós de cada segmento de entrada depois das divisões.
#include "mesh2d.h"

#include <cmath>

namespace magfem {

void build_seg_chains(const MeshInput& in, const std::vector<double>& xy, const std::vector<int>& finalSegs, MeshOutput& out) {
  // Vizinhos de cada nó pelos segmentos finais; cada segmento de entrada é percorrido de a até b
  // pelos nós que ficam sobre ele (os pontos de divisão estão sobre a reta do segmento).
  const int nv = static_cast<int>(xy.size() / 2);
  std::vector<std::vector<int>> nb(nv);
  for (size_t k = 0; k + 1 < finalSegs.size(); k += 2) {
    const int a = finalSegs[k], b = finalSegs[k + 1];
    if (a < 0 || b < 0 || a >= nv || b >= nv) continue;
    nb[a].push_back(b);
    nb[b].push_back(a);
  }
  const int ns = static_cast<int>(in.segments.size() / 2);
  out.segChainStart.assign(1, 0);
  out.segChain.clear();
  for (int s = 0; s < ns; ++s) {
    const int a = in.segments[2 * s], b = in.segments[2 * s + 1];
    const double ax = xy[2 * a], ay = xy[2 * a + 1], ex = xy[2 * b] - ax, ey = xy[2 * b + 1] - ay;
    const double L2 = ex * ex + ey * ey;
    auto param = [&](int n) { return ((xy[2 * n] - ax) * ex + (xy[2 * n + 1] - ay) * ey) / L2; };
    auto onLine = [&](int n) { return std::fabs((xy[2 * n] - ax) * ey - (xy[2 * n + 1] - ay) * ex) <= 1e-9 * L2 + 1e-300; };
    std::vector<int> chain{a};
    int cur = a;
    for (int guard = 0; cur != b && guard < nv; ++guard) {
      int best = -1;
      double tb = 2, tc = param(cur);
      for (int n : nb[cur]) {
        const double tn = param(n);
        if (tn > tc + 1e-12 && tn < tb && tn <= 1 + 1e-9 && onLine(n)) tb = tn, best = n;
      }
      if (best < 0) break;
      chain.push_back(best);
      cur = best;
    }
    if (cur != b) chain = {a, b};  // não achou o caminho: fica o segmento original
    out.segChain.insert(out.segChain.end(), chain.begin(), chain.end());
    out.segChainStart.push_back(static_cast<int>(out.segChain.size()));
  }
}

}  // namespace magfem
