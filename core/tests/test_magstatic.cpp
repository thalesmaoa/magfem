// Validação do solver magnetostático contra soluções analíticas.
#include <algorithm>
#include <complex>
#include <cmath>
#include <cstdio>

#include "magstatic.h"
#include "mesh2d.h"

using namespace magfem;
static const double MU0 = 4e-7 * M_PI;
static const double TWO_PI_T = 2 * M_PI;

// Retângulo [x0,x1]×[y0,y1] com divisões uniformes na borda (n por lado) e uma região.
// Marcadores por lado: 1 baixo, 2 direita, 3 cima, 4 esquerda; periodicX casa direita com esquerda.
static MeshOutput rectMesh(double x0, double y0, double x1, double y1, int nx, int ny, double maxArea, bool periodicX = false) {
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
    const int side = static_cast<int>(k) < nx ? 1 : static_cast<int>(k) < nx + ny ? 2 : static_cast<int>(k) < 2 * nx + ny ? 3 : 4;
    in.segMarkers.push_back(side);
  }
  if (periodicX) in.pbc = {2, 4, 0};
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
  // 1b) Contorno misto (FEMM "Mixed"): A = 1 em x = 0, ν ∂A/∂n + c0 A = 0 em x = L, sem corrente.
  //     A(x) = 1 + s x, s = −c0/(ν + c0 L); com c0 = ν/L, A(L) = 1/2.
  {
    const double L = 0.1, H = 0.05, nu = 1 / MU0, c0 = nu / L;
    MeshOutput m = rectMesh(0, 0, L, H, 20, 10, 2e-6);
    MagInput in;
    in.xy = m.xy;
    in.triangles = m.triangles;
    in.triRegion.assign(m.triangles.size() / 3, 0);
    in.nu = {nu};
    in.J = {0};
    std::vector<int> right;
    for (size_t i = 0; i < m.xy.size() / 2; ++i) {
      if (m.xy[2 * i] < 1e-12) in.dirichletNodes.push_back(static_cast<int>(i)), in.dirichletValues.push_back(1);
      if (m.xy[2 * i] > L - 1e-12) right.push_back(static_cast<int>(i));
    }
    std::sort(right.begin(), right.end(), [&](int a, int b) { return m.xy[2 * a + 1] < m.xy[2 * b + 1]; });
    for (size_t k = 0; k + 1 < right.size(); ++k) {
      in.robinA.push_back(right[k]);
      in.robinB.push_back(right[k + 1]);
      in.robinC0.push_back(c0);
      in.robinC1.push_back(0);
    }
    MagOutput o = solve_magnetostatic(in);
    double err = 0;
    for (size_t i = 0; i < m.xy.size() / 2; ++i) err = std::max(err, std::fabs(o.A[i] - (1 - m.xy[2 * i] / (2 * L))));
    check(o.error.empty() && err < 1e-6, "contorno misto: erro máx. de A (A(L) = 1/2)", err, 0);
  }
  // 1c) Harmônico: efeito pelicular numa placa de cobre (50 Hz, δ ≈ 9,3 mm). A = A0 em x = 0, Neumann em x = L:
  //     A(x) = A0 cosh(k(L − x))/cosh(kL), k = (1 + j)/δ.
  {
    const double L = 0.03, H = 0.004, sigma = 5.8e7, f = 50, A0 = 1e-3;
    const double delta = std::sqrt(2 / (TWO_PI_T * f * MU0 * sigma));
    MeshOutput m = rectMesh(0, 0, L, H, 60, 4, 4e-8);
    MagInput in;
    in.xy = m.xy;
    in.triangles = m.triangles;
    in.triRegion.assign(m.triangles.size() / 3, 0);
    in.nu = {1 / MU0};
    in.J = {0};
    in.sigma = {sigma};
    in.freq = f;
    in.harmonic = true;
    for (size_t i = 0; i < m.xy.size() / 2; ++i)
      if (m.xy[2 * i] < 1e-12) in.dirichletNodes.push_back(static_cast<int>(i)), in.dirichletValues.push_back(A0);
    MagOutput o = solve_magnetostatic(in);
    const std::complex<double> k(1 / delta, 1 / delta);
    double err = 0;
    for (size_t i = 0; i < m.xy.size() / 2; ++i) {
      const std::complex<double> want = A0 * std::cosh(k * (L - m.xy[2 * i])) / std::cosh(k * L);
      err = std::max(err, std::abs(std::complex<double>(o.A[i], o.Aim[i]) - want) / A0);
    }
    check(o.error.empty() && err < 0.01 && o.times.size() == 24, "harmônico: efeito pelicular, erro máx. |Â − exato|/A0", err, 0);
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
    MeshOutput m = rectMesh(0, 0, L, H, 10, 8, 2e-6, true);
    MagInput in;
    in.xy = m.xy;
    in.triangles = m.triangles;
    in.triRegion.assign(m.triangles.size() / 3, 0);
    in.nu = {1 / MU0};
    in.J = {J};
    const int nn = static_cast<int>(m.xy.size() / 2);
    // A Tangle divide os dois lados em sincronia: todo nó em x = L tem par exato em x = 0.
    int right = 0, left = 0;
    for (int i = 0; i < nn; ++i) right += m.xy[2 * i] > L - 1e-12, left += m.xy[2 * i] < 1e-12;
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
    check(right == left && static_cast<int>(in.periodicSlave.size()) == right && right > 9, "periódico: nós casados nos dois lados (Tangle)", in.periodicSlave.size(), right);
  }
  // 5) Não linear: faixa com J entre A = 0 em x = 0 e x = L. H(x) = J (L/2 − x) vale para qualquer
  //    material; H(B do elemento) deve convergir para J (L/2 − x) com o refino (aço M400-50A).
  {
    const double L = 0.1, H0 = 0.05, J = 2e5;
    const std::vector<double> bB = {0.5, 1.0, 1.3, 1.5, 1.6, 1.7, 1.8, 2.0};
    const std::vector<double> bH = {60, 120, 220, 480, 900, 2000, 5000, 20000};
    auto run = [&](int nx, double area, double& bmax, int& its) {
      MeshOutput m = rectMesh(0, 0, L, H0, nx, 8, area);
      MagInput in;
      in.xy = m.xy;
      in.triangles = m.triangles;
      in.triRegion.assign(m.triangles.size() / 3, 0);
      in.nu = {1 / (MU0 * 4000)};
      in.J = {J};
      in.bhStart = {0, static_cast<int>(bB.size())};
      in.bhB = bB;
      in.bhH = bH;
      for (size_t i = 0; i < m.xy.size() / 2; ++i)
        if (m.xy[2 * i] < 1e-12 || m.xy[2 * i] > L - 1e-12) in.dirichletNodes.push_back(static_cast<int>(i)), in.dirichletValues.push_back(0);
      MagOutput o = solve_magnetostatic(in);
      double errH = 0;
      bmax = 0;
      its = o.iterations;
      for (size_t t = 0; t < o.bx.size(); ++t) {
        const int* v = &m.triangles[3 * t];
        const double xc = (m.xy[2 * v[0]] + m.xy[2 * v[1]] + m.xy[2 * v[2]]) / 3;
        const double b = std::hypot(o.bx[t], o.by[t]);
        bmax = std::max(bmax, b);
        errH = std::max(errH, std::fabs(bh_curve_h(bB, bH, b) - std::fabs(J * (L / 2 - xc))) / (J * L / 2));
      }
      return errH;
    };
    double bmax1, bmax2;
    int it1, it2;
    const double e1 = run(20, 2e-5, bmax1, it1), e2 = run(80, 1.2e-6, bmax2, it2);
    check(e2 < 0.02 && e2 < e1, "não linear: erro de H cai com o refino (grossa → fina)", e2, e1);
    check(bmax2 < 2.2 && bmax2 > 1.5, "não linear: satura (|B| máx. entre 1,5 e 2,2 T)", bmax2, 1.9);
    std::printf("      (Newton: %d e %d iterações)\n", it1, it2);
  }
  // 6) Transitório sem condutividade: A(t) = A_estático · sen(ωt).
  {
    const double L = 0.1, H0 = 0.05, J = 1e6, f = 50;
    MeshOutput m = rectMesh(0, 0, L, H0, 10, 5, 4e-5);
    MagInput in;
    in.xy = m.xy;
    in.triangles = m.triangles;
    in.triRegion.assign(m.triangles.size() / 3, 0);
    in.nu = {1 / MU0};
    in.J = {J};
    for (size_t i = 0; i < m.xy.size() / 2; ++i)
      if (m.xy[2 * i] < 1e-12 || m.xy[2 * i] > L - 1e-12) in.dirichletNodes.push_back(static_cast<int>(i)), in.dirichletValues.push_back(0);
    MagInput st = in;
    MagOutput s0 = solve_magnetostatic(st);
    in.freq = f;
    in.dt = 1.0 / f / 40;
    in.steps = 40;
    MagOutput o = solve_magnetostatic(in);
    const int nn = static_cast<int>(m.xy.size() / 2);
    double err = 0, amax = 0;
    for (int k = 0; k < in.steps; ++k)
      for (int i = 0; i < nn; ++i) {
        const double want = s0.A[i] * std::sin(2 * M_PI * f * o.times[k]);
        err = std::max(err, std::fabs(o.At[static_cast<size_t>(k) * nn + i] - want));
        amax = std::max(amax, std::fabs(s0.A[i]));
      }
    check(o.error.empty() && err / amax < 1e-9, "transitório σ = 0: A(t) = A_est · sen(ωt)", err / amax, 0);
  }
  // 7) Difusão numa placa condutora: A = A0 nas faces x = 0 e x = L a partir de t = 0.
  //    A/A0 = 1 − (4/π) Σ_{n ímpar} sen(nπx/L)/n · exp(−n²π² t / (μσL²)).
  {
    const double L = 0.01, H0 = 0.004, sigma = 5.8e7, A0 = 1e-3;
    const double tau = MU0 * sigma * L * L / (M_PI * M_PI);
    MeshOutput m = rectMesh(0, 0, L, H0, 40, 8, 2e-8);
    MagInput in;
    in.xy = m.xy;
    in.triangles = m.triangles;
    in.triRegion.assign(m.triangles.size() / 3, 0);
    in.nu = {1 / MU0};
    in.J = {0};
    in.sigma = {sigma};
    for (size_t i = 0; i < m.xy.size() / 2; ++i)
      if (m.xy[2 * i] < 1e-12 || m.xy[2 * i] > L - 1e-12) in.dirichletNodes.push_back(static_cast<int>(i)), in.dirichletValues.push_back(A0);
    in.steps = 400;
    in.dt = 0.5 * tau / in.steps;  // até t = τ/2
    MagOutput o = solve_magnetostatic(in);
    const int nn = static_cast<int>(m.xy.size() / 2);
    const double t = in.steps * in.dt;
    double err = 0;
    for (int i = 0; i < nn; ++i) {
      const double x = m.xy[2 * i];
      double s = 0;
      for (int k = 1; k < 200; k += 2) s += std::sin(k * M_PI * x / L) / k * std::exp(-k * k * t / tau);
      const double want = A0 * (1 - 4 / M_PI * s);
      err = std::max(err, std::fabs(o.At[static_cast<size_t>(in.steps - 1) * nn + i] - want) / A0);
    }
    check(o.error.empty() && err < 0.02, "difusão (correntes parasitas) vs série analítica em t = τ/2", err, 0);
  }
  // 8) Circuito acoplado: bobina do FEM (ida e volta no ar) em série com R e fonte senoidal.
  //    i(t) deve ser igual ao do RL discreto (Euler implícito) com L = λ/I do estático.
  {
    MeshInput mi;
    auto add = [&](double x, double y) {
      mi.xy.push_back(x);
      mi.xy.push_back(y);
      return static_cast<int>(mi.xy.size() / 2 - 1);
    };
    auto rect = [&](double x0, double y0, double x1, double y1, int mark) {
      const int a = add(x0, y0), b = add(x1, y0), c = add(x1, y1), d = add(x0, y1);
      const int q[4][2] = {{a, b}, {b, c}, {c, d}, {d, a}};
      for (auto& e : q) mi.segments.push_back(e[0]), mi.segments.push_back(e[1]), mi.segMarkers.push_back(mark);
    };
    rect(0, 0, 0.2, 0.1, 1);
    rect(0.05, 0.04, 0.07, 0.06, 2);
    rect(0.13, 0.04, 0.15, 0.06, 3);
    mi.regions = {0.01, 0.01, 1, 2e-5, 0.06, 0.05, 2, 5e-6, 0.14, 0.05, 3, 5e-6};
    mi.minAngle = 30;
    MeshOutput m = triangulate_pslg(mi);
    MagInput base;
    base.xy = m.xy;
    base.triangles = m.triangles;
    for (int r : m.triRegion) base.triRegion.push_back(r - 1);
    base.nu = {1 / MU0, 1 / MU0, 1 / MU0};
    base.J = {0, 0, 0};
    for (size_t i = 0; i < m.xy.size() / 2; ++i) {
      const double x = m.xy[2 * i], y = m.xy[2 * i + 1];
      if (x < 1e-12 || x > 0.2 - 1e-12 || y < 1e-12 || y > 0.1 - 1e-12) base.dirichletNodes.push_back(static_cast<int>(i)), base.dirichletValues.push_back(0);
    }
    const double Nt = 100, Acoil = 0.02 * 0.02, depth = 0.5, I0 = 1;
    // Estático: L = λ/I.
    MagInput st = base;
    st.J = {0, Nt * I0 / Acoil, -Nt * I0 / Acoil};
    MagOutput so = solve_magnetostatic(st);
    double intGo = 0, intRet = 0;
    for (size_t t = 0; t < m.triangles.size() / 3; ++t) {
      const int* v = &m.triangles[3 * t];
      double x[3], y[3];
      for (int k = 0; k < 3; ++k) x[k] = m.xy[2 * v[k]], y[k] = m.xy[2 * v[k] + 1];
      const double ar = 0.5 * std::fabs((x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]));
      const double Am = (so.A[v[0]] + so.A[v[1]] + so.A[v[2]]) / 3;
      if (base.triRegion[t] == 1) intGo += Am * ar;
      if (base.triRegion[t] == 2) intRet += Am * ar;
    }
    const double L = depth * (Nt / Acoil * intGo - Nt / Acoil * intRet) / I0;
    // Transitório acoplado: V sen(ωt) → R → bobina → terra.
    const double Vm = 10, f = 50, R = 0.5, dt = 1e-4;
    const int steps = 300;
    MagInput in = base;
    in.dt = dt;
    in.steps = steps;
    in.depth = depth;
    in.netNodes = 2;
    in.elType = {3, 0, 5};
    in.elA = {1, 1, 2};
    in.elB = {0, 2, 0};
    in.elValue = {Vm, R, 0};
    in.elFreq = {f, 0, 0};
    in.elPhase = {0, 0, 0};
    in.elDC = {0, 0, 0};
    in.elCoil = {-1, -1, 0};
    in.coilStart = {0, 2};
    in.coilRegion = {1, 2};
    in.coilTurns = {Nt, -Nt};
    in.coilR = {0};
    MagOutput o = solve_magnetostatic(in);
    // RL discreto com a mesma L e o mesmo passo.
    double ip = 0, err = 0, imax = 0;
    for (int k = 1; k <= steps; ++k) {
      const double V = Vm * std::sin(2 * M_PI * f * k * dt);
      const double i = (V + L / dt * ip) / (R + L / dt);
      const double ifem = o.elI.size() ? o.elI[static_cast<size_t>(k - 1) * 3 + 2] : 1e9;
      err = std::max(err, std::fabs(ifem - i));
      imax = std::max(imax, std::fabs(i));
      ip = i;
    }
    std::printf("      (L = %.4g mH, i máx. = %.4g A)\n", L * 1e3, imax);
    check(o.error.empty() && err / imax < 1e-6, "circuito acoplado: i(t) da bobina FEM = RL discreto com L = λ/I", err / imax, 0);

    // Transformador (acoplamento perfeito: as duas bobinas nas mesmas ranhuras), secundário com carga alta:
    // V2 = (N2/N1) V1.
    MagInput tr = base;
    tr.dt = dt;
    tr.steps = 100;
    tr.depth = depth;
    tr.netNodes = 3;  // 1: fonte, 2: primário (após R), 3: secundário
    tr.elType = {3, 0, 5, 5, 0};
    tr.elA = {1, 1, 2, 3, 3};
    tr.elB = {0, 2, 0, 0, 0};
    tr.elValue = {Vm, R, 0, 0, 1e7};
    tr.elFreq = {f, 0, 0, 0, 0};
    tr.elPhase = {0, 0, 0, 0, 0};
    tr.elDC = {0, 0, 0, 0, 0};
    tr.elCoil = {-1, -1, 0, 1, -1};
    const double N2 = 250;
    tr.coilStart = {0, 2, 4};
    tr.coilRegion = {1, 2, 1, 2};
    tr.coilTurns = {Nt, -Nt, N2, -N2};
    tr.coilR = {0, 0};
    MagOutput to = solve_magnetostatic(tr);
    double errV = 0, vmax = 0;
    for (int k = 0; k < tr.steps; ++k) {
      const double v1 = to.nodeV[static_cast<size_t>(k) * 3 + 1], v2 = to.nodeV[static_cast<size_t>(k) * 3 + 2];
      errV = std::max(errV, std::fabs(v2 - N2 / Nt * v1));
      vmax = std::max(vmax, std::fabs(v2));
    }
    check(to.error.empty() && errV / vmax < 1e-4, "transformador: V2 = (N2/N1)·V1 com acoplamento perfeito", errV / vmax, 0);
  }
  return fails ? 1 : 0;
}
