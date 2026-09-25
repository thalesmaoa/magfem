// Validação do solver magnetostático contra soluções analíticas.
#include <cmath>
#include <cstdio>

#include "magstatic.h"
#include "mesh2d.h"

using namespace magfem;
static const double MU0 = 4e-7 * M_PI;

// Retângulo [x0,x1]×[y0,y1] com divisões uniformes na borda (n por lado) e uma região.
static MeshOutput rectMesh(double x0, double y0, double x1, double y1, int nx, int ny, double maxArea) {
  MeshInput in;
  auto add = [&](double x, double y) {
    in.xy.push_back(x);
    in.xy.push_back(y);
    return static_cast<int>(in.xy.size() / 2 - 1);
  };
  std::vector<int> ring;
  for (int i = 0; i < nx; ++i) ring.push_back(add(x0 + (x1 - x0) * i / nx, y0));
  for (int j = 0; j < ny; ++j) ring.push_back(add(x1, y0 + (y1 - y0) * j / ny));
  for (int i = nx; i > 0; --i) ring.push_back(add(x0 + (x1 - x0) * i / nx, y1));
  for (int j = ny; j > 0; --j) ring.push_back(add(x0, y0 + (y1 - y0) * j / ny));
  for (size_t k = 0; k < ring.size(); ++k) {
    in.segments.push_back(ring[k]);
    in.segments.push_back(ring[(k + 1) % ring.size()]);
    in.segMarkers.push_back(1);
  }
  in.regions = {(x0 + x1) / 2, (y0 + y1) / 2, 1, maxArea};
  in.minAngle = 30;
  return triangulate_pslg(in);
}

static int fails = 0;
static void check(bool ok, const char* what, double got, double want) {
  std::printf("%s %-58s obtido %.6g  esperado %.6g\n", ok ? "ok  " : "FALHA", what, got, want);
  if (!ok) ++fails;
}

int main() {
  // 1) Faixa 0 ≤ x ≤ L com J uniforme, A = 0 em x = 0 e x = L: A(x) = μ0 J x (L − x) / 2, B_y = −μ0 J (L/2 − x).
  {
    const double L = 0.1, H = 0.05, J = 1e6;
    MeshOutput m = rectMesh(0, 0, L, H, 20, 10, 2e-6);
    MagInput in;
    in.xy = m.xy;
    in.triangles = m.triangles;
    in.triRegion.assign(m.triangles.size() / 3, 0);
    in.nu = {1 / MU0};
    in.J = {J};
    for (size_t i = 0; i < m.xy.size() / 2; ++i)
      if (m.xy[2 * i] < 1e-12 || m.xy[2 * i] > L - 1e-12) in.dirichletNodes.push_back(static_cast<int>(i)), in.dirichletValues.push_back(0);
    MagOutput o = solve_magnetostatic(in);
    double errA = 0, amax = MU0 * J * L * L / 8;
    for (size_t i = 0; i < m.xy.size() / 2; ++i) {
      const double x = m.xy[2 * i];
      errA = std::max(errA, std::fabs(o.A[i] - MU0 * J * x * (L - x) / 2));
    }
    check(o.error.empty() && errA / amax < 0.01, "faixa com corrente: erro relativo máx. de A", errA / amax, 0);
    // Energia: ∫ ½ ν B² = ½ μ0 J² ∫ (L/2 − x)² dx · H = μ0 J² H L³ / 24
    const double W = MU0 * J * J * H * L * L * L / 24;
    check(std::fabs(o.energy - W) / W < 0.01, "faixa com corrente: energia por metro (J/m)", o.energy, W);
  }
  // 2) Ímã preenchendo o domínio, Neumann em tudo e um nó fixo: B = Br exatamente.
  {
    MeshOutput m = rectMesh(0, 0, 0.02, 0.01, 8, 4, 2e-6);
    MagInput in;
    in.xy = m.xy;
    in.triangles = m.triangles;
    in.triRegion.assign(m.triangles.size() / 3, 0);
    in.nu = {1 / (MU0 * 1.05)};
    in.J = {0};
    in.brx = {0.3};
    in.bry = {1.2};
    in.dirichletNodes = {0};
    in.dirichletValues = {0};
    MagOutput o = solve_magnetostatic(in);
    double err = 0;
    for (size_t t = 0; t < o.bx.size(); ++t) err = std::max(err, std::hypot(o.bx[t] - 0.3, o.by[t] - 1.2));
    check(o.error.empty() && err < 1e-9, "ímã uniforme: |B − Br| máx. (T)", err, 0);
  }
  // 3) Solenoide infinito (axissimétrico): camada R1 ≤ r ≤ R2 com J; B_z interno = μ0 J (R2 − R1).
  {
    const double R1 = 0.02, R2 = 0.03, R3 = 0.05, h = 0.01, J = 2e6;
    MeshInput mi;
    auto add = [&](double x, double y) {
      mi.xy.push_back(x);
      mi.xy.push_back(y);
      return static_cast<int>(mi.xy.size() / 2 - 1);
    };
    // Três faixas radiais (ar interno, bobina, ar externo) de altura h.
    const double rs[4] = {0, R1, R2, R3};
    int bot[4], top[4];
    for (int k = 0; k < 4; ++k) bot[k] = add(rs[k], 0), top[k] = add(rs[k], h);
    auto seg = [&](int a, int b) { mi.segments.push_back(a), mi.segments.push_back(b), mi.segMarkers.push_back(1); };
    for (int k = 0; k < 3; ++k) seg(bot[k], bot[k + 1]), seg(top[k], top[k + 1]);
    for (int k = 0; k < 4; ++k) seg(bot[k], top[k]);
    mi.regions = {R1 / 2, h / 2, 1, 1e-6, (R1 + R2) / 2, h / 2, 2, 1e-6, (R2 + R3) / 2, h / 2, 3, 1e-6};
    mi.minAngle = 30;
    mi.keepBoundary = false;
    MeshOutput m = triangulate_pslg(mi);
    MagInput in;
    in.axisymmetric = true;
    in.xy = m.xy;
    in.triangles = m.triangles;
    for (int r : m.triRegion) in.triRegion.push_back(r - 1);
    in.nu = {1 / MU0, 1 / MU0, 1 / MU0};
    in.J = {0, J, 0};
    for (size_t i = 0; i < m.xy.size() / 2; ++i)
      if (m.xy[2 * i] < 1e-12) in.dirichletNodes.push_back(static_cast<int>(i)), in.dirichletValues.push_back(0);
    MagOutput o = solve_magnetostatic(in);
    double bz = 0, bzOut = 0;
    int n = 0, nOut = 0;
    for (size_t t = 0; t < o.bx.size(); ++t) {
      if (in.triRegion[t] == 0) bz += o.by[t], ++n;
      if (in.triRegion[t] == 2) bzOut += std::fabs(o.by[t]), ++nOut;
    }
    bz /= n;
    const double want = MU0 * J * (R2 - R1);
    check(o.error.empty() && std::fabs(bz - want) / want < 0.01, "solenoide infinito: B_z médio interno (T)", bz, want);
    check(bzOut / nOut < 0.01 * want, "solenoide infinito: |B_z| médio externo (T)", bzOut / nOut, 0);
  }
  // 4) Periódico: faixa com corrente em x, A(0) = A(L) por periodicidade e A = 0 em y = 0.
  //    Solução 1D em y: A(y) = μ0 J y (2H − y)/2 com Neumann em y = H.
  {
    const double L = 0.04, H = 0.02, J = 1e6;
    MeshOutput m = rectMesh(0, 0, L, H, 10, 8, 2e-6);
    MagInput in;
    in.xy = m.xy;
    in.triangles = m.triangles;
    in.triRegion.assign(m.triangles.size() / 3, 0);
    in.nu = {1 / MU0};
    in.J = {J};
    const int nn = static_cast<int>(m.xy.size() / 2);
    for (int i = 0; i < nn; ++i)
      if (m.xy[2 * i + 1] < 1e-12) in.dirichletNodes.push_back(i), in.dirichletValues.push_back(0);
    // Casa x = L com x = 0 pelo y.
    for (int i = 0; i < nn; ++i) {
      if (m.xy[2 * i] < L - 1e-12) continue;
      for (int k = 0; k < nn; ++k)
        if (m.xy[2 * k] < 1e-12 && std::fabs(m.xy[2 * k + 1] - m.xy[2 * i + 1]) < 1e-12) {
          in.periodicSlave.push_back(i);
          in.periodicMaster.push_back(k);
          in.periodicSign.push_back(1);
        }
    }
    MagOutput o = solve_magnetostatic(in);
    double err = 0, amax = MU0 * J * H * H / 2;
    for (int i = 0; i < nn; ++i) {
      const double y = m.xy[2 * i + 1];
      err = std::max(err, std::fabs(o.A[i] - MU0 * J * y * (2 * H - y) / 2));
    }
    check(o.error.empty() && err / amax < 0.01, "periódico: erro relativo máx. de A", err / amax, 0);
  }
  return fails ? 1 : 0;
}
