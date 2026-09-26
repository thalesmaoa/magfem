// Magnetostática/transitório 2D: montagem P1, Newton-Raphson para materiais não lineares (curva B-H),
// Euler implícito com correntes parasitas, eliminação de Dirichlet e de nós periódicos (Eigen).
#include "magstatic.h"

#include <Eigen/Sparse>
#include <Eigen/SparseCholesky>
#include <Eigen/SparseLU>
#include <algorithm>
#include <cmath>
#include <complex>
#include <unordered_map>

namespace magfem {

namespace {
constexpr double TWO_PI = 6.283185307179586;
constexpr double MU0 = 4e-7 * M_PI;

struct Dof {
  int free = -1;  // índice reduzido; -1 se fixo
  double sign = 1;
  double value = 0;  // se fixo
};

/** Curva B-H de uma região: H(B) cúbica monótona (Fritsch–Carlson) por (0,0) e os pontos dados. */
struct BH {
  std::vector<double> B, H, m;  // m = dH/dB nos pontos
  bool ok = false;
  void build(const double* b, const double* h, int n) {
    B = {0};
    H = {0};
    for (int i = 0; i < n; ++i)
      if (b[i] > B.back() + 1e-12 && h[i] > H.back()) B.push_back(b[i]), H.push_back(h[i]);
    ok = B.size() >= 2;
    if (!ok) return;
    const size_t k = B.size();
    std::vector<double> d(k - 1);
    for (size_t i = 0; i + 1 < k; ++i) d[i] = (H[i + 1] - H[i]) / (B[i + 1] - B[i]);
    m.assign(k, 0);
    m[0] = d[0];
    m[k - 1] = d[k - 2];
    for (size_t i = 1; i + 1 < k; ++i) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i]);  // média harmônica
    for (size_t i = 0; i + 1 < k; ++i) {  // limita para manter monotonia
      if (d[i] == 0) continue;
      const double a = m[i] / d[i], c = m[i + 1] / d[i];
      const double r = a * a + c * c;
      if (r > 9) {
        const double t = 3 / std::sqrt(r);
        m[i] = t * a * d[i];
        m[i + 1] = t * c * d[i];
      }
    }
  }
  /** H e dH/dB em B (acima do último ponto: reta com inclinação 1/μ0). */
  void eval(double b, double& h, double& dh) const {
    const size_t k = B.size();
    if (b >= B[k - 1]) {
      dh = 1 / MU0;
      h = H[k - 1] + (b - B[k - 1]) * dh;
      return;
    }
    size_t i = std::upper_bound(B.begin(), B.end(), b) - B.begin() - 1;
    const double hh = B[i + 1] - B[i], t = (b - B[i]) / hh;
    const double h00 = 2 * t * t * t - 3 * t * t + 1, h10 = t * t * t - 2 * t * t + t, h01 = -2 * t * t * t + 3 * t * t, h11 = t * t * t - t * t;
    h = h00 * H[i] + h10 * hh * m[i] + h01 * H[i + 1] + h11 * hh * m[i + 1];
    const double d00 = 6 * t * t - 6 * t, d10 = 3 * t * t - 4 * t + 1, d01 = -6 * t * t + 6 * t, d11 = 3 * t * t - 2 * t;
    dh = (d00 * H[i] + d01 * H[i + 1]) / hh + d10 * m[i] + d11 * m[i + 1];
  }
  /** ν = H/B e dν/d(B²). */
  void nu(double b2, double& nuv, double& dnu) const {
    const double b = std::sqrt(std::max(b2, 0.0));
    if (b < 1e-9) {
      nuv = m[0];
      dnu = 0;
      return;
    }
    double h, dh;
    eval(b, h, dh);
    nuv = h / b;
    dnu = (dh * b - h) / (b * b) / (2 * b);
  }
  /** Densidade de energia ∫₀^B H dB (Simpson). */
  double energy(double b) const {
    const int n = 16;
    double s = 0;
    for (int i = 0; i <= n; ++i) {
      double h, dh;
      eval(b * i / n, h, dh);
      s += h * (i == 0 || i == n ? 1 : i % 2 ? 4 : 2);
    }
    return s * b / (3 * n);
  }
};
}  // namespace

double bh_curve_h(const std::vector<double>& B, const std::vector<double>& H, double b) {
  BH c;
  c.build(B.data(), H.data(), static_cast<int>(B.size()));
  double h, dh;
  c.eval(b, h, dh);
  return h;
}

MagOutput solve_magnetostatic(const MagInput& in) {
  MagOutput out;
  const int nn = static_cast<int>(in.xy.size() / 2);
  const int nt = static_cast<int>(in.triangles.size() / 3);
  if (nn < 3 || nt < 1) {
    out.error = "malha vazia";
    return out;
  }
  const int nr = static_cast<int>(in.nu.size());
  auto regv = [&](int r, const std::vector<double>& v, double def) { return r >= 0 && r < static_cast<int>(v.size()) ? v[r] : def; };
  const double nu0 = 1.0 / MU0;

  std::vector<BH> curves(std::max(nr, 0));
  bool nonlinear = false;
  if (static_cast<int>(in.bhStart.size()) == nr + 1)
    for (int r = 0; r < nr; ++r) {
      const int a = in.bhStart[r], b = in.bhStart[r + 1];
      if (b - a >= 1) {
        curves[r].build(&in.bhB[a], &in.bhH[a], b - a);
        nonlinear = nonlinear || curves[r].ok;
      }
    }

  // Nós → graus de liberdade (Dirichlet vence; periódicos seguem a cadeia até o mestre).
  std::vector<int> master(nn), fixedIdx(nn, -1);
  std::vector<double> sign(nn, 1.0);
  for (int i = 0; i < nn; ++i) master[i] = i;
  for (size_t k = 0; k < in.periodicSlave.size(); ++k) {
    const int s = in.periodicSlave[k], m = in.periodicMaster[k];
    if (s < 0 || s >= nn || m < 0 || m >= nn || s == m) continue;
    master[s] = m;
    sign[s] = in.periodicSign[k] < 0 ? -1.0 : 1.0;
  }
  for (size_t k = 0; k < in.dirichletNodes.size(); ++k) {
    const int n = in.dirichletNodes[k];
    if (n >= 0 && n < nn) fixedIdx[n] = static_cast<int>(k);
  }
  std::vector<Dof> dof(nn);
  std::vector<int> reducedOf(nn, -1);
  int nfree = 0;
  for (int i = 0; i < nn; ++i) {
    int m = i;
    double sg = 1;
    for (int guard = 0; guard < 64 && master[m] != m && fixedIdx[m] < 0; ++guard) {
      sg *= sign[m];
      m = master[m];
    }
    if (fixedIdx[m] >= 0) {
      dof[i].free = -1;
      dof[i].value = sg * in.dirichletValues[fixedIdx[m]];
    } else {
      if (reducedOf[m] < 0) reducedOf[m] = nfree++;
      dof[i].free = reducedOf[m];
      dof[i].sign = sg;
    }
  }
  if (nfree == 0) {
    out.error = "todos os nós estão fixos";
    return out;
  }

  // Geometria dos elementos (fixa).
  struct Elem {
    int v[3];
    double b[3], c[3], area, w, rc;
    int r;
  };
  std::vector<Elem> el(nt);
  for (int t = 0; t < nt; ++t) {
    Elem& e = el[t];
    double x[3], y[3];
    for (int k = 0; k < 3; ++k) e.v[k] = in.triangles[3 * t + k], x[k] = in.xy[2 * e.v[k]], y[k] = in.xy[2 * e.v[k] + 1];
    for (int k = 0; k < 3; ++k) {
      const int j = (k + 1) % 3, l = (k + 2) % 3;
      e.b[k] = y[j] - y[l];
      e.c[k] = x[l] - x[j];
    }
    e.area = 0.5 * std::fabs((x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]));
    e.rc = (x[0] + x[1] + x[2]) / 3;
    e.w = in.axisymmetric ? 1.0 / std::max(e.rc, 1e-12) : 1.0;
    e.r = t < static_cast<int>(in.triRegion.size()) ? in.triRegion[t] : -1;
  }
  // Contorno misto (ν ∂A/∂n + c0 A + c1 = 0) pré-integrado por aresta: matriz 2×2 e vetor (Gauss de 2 pontos).
  //   Plano: ∮ c0 A N_i N_j + c1 N_i.  Axissimétrico (ψ = rA): ∮ (c0/r − ν n_r/r²) ψ N_i N_j + c1 N_i, com n_r
  //   a componente radial da normal para fora do domínio (tirada do triângulo vizinho).
  struct RobinEdge {
    int v[2];
    double k[2][2];
    double f[2];
  };
  std::vector<RobinEdge> robin;
  if (!in.robinA.empty()) {
    std::unordered_map<long long, int> triOf;  // aresta → um triângulo que a contém
    auto key = [](int a, int b) { return a < b ? (static_cast<long long>(a) << 32) | b : (static_cast<long long>(b) << 32) | a; };
    for (size_t k = 0; k < in.robinA.size() && k < in.robinB.size(); ++k) triOf[key(in.robinA[k], in.robinB[k])] = -1;
    for (int t = 0; t < nt; ++t)
      for (int q = 0; q < 3; ++q) {
        auto it = triOf.find(key(el[t].v[q], el[t].v[(q + 1) % 3]));
        if (it != triOf.end()) it->second = t;
      }
    for (size_t k = 0; k < in.robinA.size() && k < in.robinB.size(); ++k) {
      RobinEdge re{{in.robinA[k], in.robinB[k]}, {{0, 0}, {0, 0}}, {0, 0}};
      if (re.v[0] < 0 || re.v[0] >= nn || re.v[1] < 0 || re.v[1] >= nn || re.v[0] == re.v[1]) continue;
      const double c0 = k < in.robinC0.size() ? in.robinC0[k] : 0, c1 = k < in.robinC1.size() ? in.robinC1[k] : 0;
      const double x0 = in.xy[2 * re.v[0]], y0 = in.xy[2 * re.v[0] + 1], x1 = in.xy[2 * re.v[1]], y1 = in.xy[2 * re.v[1] + 1];
      const double L = std::hypot(x1 - x0, y1 - y0);
      if (!(L > 0)) continue;
      re.f[0] = re.f[1] = c1 * L / 2;
      if (!in.axisymmetric) {
        for (int i = 0; i < 2; ++i)
          for (int j = 0; j < 2; ++j) re.k[i][j] = c0 * L * (i == j ? 2 : 1) / 6;
      } else {
        // Normal para fora: oposta ao terceiro vértice do triângulo vizinho.
        double nr = 0, nuv = nu0;
        const int t = triOf[key(re.v[0], re.v[1])];
        if (t >= 0) {
          int w = el[t].v[0];
          for (int q = 0; q < 3; ++q)
            if (el[t].v[q] != re.v[0] && el[t].v[q] != re.v[1]) w = el[t].v[q];
          double nx = (y1 - y0) / L, ny = -(x1 - x0) / L;
          if ((in.xy[2 * w] - x0) * nx + (in.xy[2 * w + 1] - y0) * ny > 0) nx = -nx, ny = -ny;
          nr = nx;
          nuv = regv(el[t].r, in.nu, nu0);
        }
        const double g[2] = {0.5 - 0.5 / std::sqrt(3.0), 0.5 + 0.5 / std::sqrt(3.0)};
        for (double xi : g) {
          const double N[2] = {1 - xi, xi};
          const double r = std::max(N[0] * x0 + N[1] * x1, 1e-12);
          const double wgt = (c0 / r - nuv * nr / (r * r)) * L / 2;
          for (int i = 0; i < 2; ++i)
            for (int j = 0; j < 2; ++j) re.k[i][j] += wgt * N[i] * N[j];
        }
      }
      robin.push_back(re);
    }
  }
  const bool transient = in.steps > 0 && in.dt > 0;
  const double invDt = transient ? 1.0 / in.dt : 0.0;

  // Gradiente de A no elemento (∂A/∂x, ∂A/∂y) e B² correspondente.
  auto grad = [&](const Elem& e, const std::vector<double>& A, double& gx, double& gy) {
    gx = gy = 0;
    const double a2 = 2 * e.area;
    for (int k = 0; k < 3; ++k) gx += e.b[k] * A[e.v[k]] / a2, gy += e.c[k] * A[e.v[k]] / a2;
  };
  auto elemNu = [&](const Elem& e, double b2, double& nuv, double& dnu) {
    if (e.r >= 0 && e.r < nr && curves[e.r].ok) curves[e.r].nu(b2, nuv, dnu);
    else nuv = regv(e.r, in.nu, nu0), dnu = 0;
  };

  std::vector<double> A(nn, 0.0), Aprev(nn, 0.0);
  auto expand = [&](const Eigen::VectorXd& a) {
    for (int i = 0; i < nn; ++i) A[i] = dof[i].free < 0 ? dof[i].value : dof[i].sign * a[dof[i].free];
  };
  auto reduce = [&]() {
    Eigen::VectorXd a = Eigen::VectorXd::Zero(nfree);
    for (int i = 0; i < nn; ++i)
      if (dof[i].free >= 0) a[dof[i].free] = dof[i].sign * A[i];
    return a;
  };

  int curStep = 0;  // passo atual do transitório (1..steps; 0 no estático)
  // Resíduo R(A) (graus livres) e, se pedido, o Jacobiano (tangente de Newton).
  Eigen::SimplicialLDLT<Eigen::SparseMatrix<double>> ldlt;
  bool analyzed = false;
  auto assemble = [&](double time, bool withJac, Eigen::VectorXd& R, Eigen::SparseMatrix<double>* Kt) {
    R = Eigen::VectorXd::Zero(nfree);
    std::vector<Eigen::Triplet<double>> trip;
    if (withJac) trip.reserve(static_cast<size_t>(nt) * 9);
    for (const Elem& e : el) {
      if (e.area <= 0) continue;
      double gx, gy;
      grad(e, A, gx, gy);
      const double b2 = e.w * e.w * (gx * gx + gy * gy);
      double nuv, dnu;
      elemNu(e, b2, nuv, dnu);
      double J = regv(e.r, in.J, 0);
      if (!in.jSteps.empty() && curStep > 0 && e.r >= 0 && e.r < nr) J = in.jSteps[static_cast<size_t>(curStep - 1) * nr + e.r];
      else if (transient && in.freq > 0) J *= std::sin(TWO_PI * in.freq * time + regv(e.r, in.jPhase, 0));
      const double brx = regv(e.r, in.brx, 0), bry = regv(e.r, in.bry, 0);
      const double sg = transient ? regv(e.r, in.sigma, 0) : 0;
      double re[3], ke[3][3];
      for (int i = 0; i < 3; ++i) {
        const double gNi_x = e.b[i] / (2 * e.area), gNi_y = e.c[i] / (2 * e.area);
        // ∫ ν w ∇A·∇N_i − J N_i − (ímã) + σ w/dt (A − A_prev) N_i
        re[i] = nuv * e.w * (gx * gNi_x + gy * gNi_y) * e.area - J * e.area / 3;
        // Axissimétrico: ∂B/∂ψ_i traz w = 1/r, que cancela com o r da medida (sem fator w aqui).
        if (in.axisymmetric) re[i] -= nuv * (-brx * e.c[i] + bry * e.b[i]) / 2;
        else re[i] -= nuv * (brx * e.c[i] - bry * e.b[i]) / 2;
        if (sg > 0)
          for (int j = 0; j < 3; ++j) re[i] += sg * e.w * invDt * (A[e.v[j]] - Aprev[e.v[j]]) * e.area * (i == j ? 2 : 1) / 12;
        if (!withJac) continue;
        const double gAi = gx * gNi_x + gy * gNi_y;
        for (int j = 0; j < 3; ++j) {
          const double gNj_x = e.b[j] / (2 * e.area), gNj_y = e.c[j] / (2 * e.area);
          const double gAj = gx * gNj_x + gy * gNj_y;
          ke[i][j] = nuv * e.w * (gNi_x * gNj_x + gNi_y * gNj_y) * e.area + 2 * dnu * e.w * e.w * e.w * gAi * gAj * e.area;
          if (sg > 0) ke[i][j] += sg * e.w * invDt * e.area * (i == j ? 2 : 1) / 12;
        }
      }
      for (int i = 0; i < 3; ++i) {
        const Dof& di = dof[e.v[i]];
        if (di.free < 0) continue;
        R[di.free] += di.sign * re[i];
        if (!withJac) continue;
        for (int j = 0; j < 3; ++j) {
          const Dof& dj = dof[e.v[j]];
          if (dj.free >= 0) trip.emplace_back(di.free, dj.free, di.sign * ke[i][j] * dj.sign);
        }
      }
    }
    // Contorno misto (pré-integrado): R += K ψ + f; tangente += K.
    for (const RobinEdge& re : robin)
      for (int i = 0; i < 2; ++i) {
        const Dof& di = dof[re.v[i]];
        if (di.free < 0) continue;
        R[di.free] += di.sign * (re.k[i][0] * A[re.v[0]] + re.k[i][1] * A[re.v[1]] + re.f[i]);
        if (!withJac) continue;
        for (int j = 0; j < 2; ++j) {
          const Dof& dj = dof[re.v[j]];
          if (dj.free >= 0) trip.emplace_back(di.free, dj.free, di.sign * re.k[i][j] * dj.sign);
        }
      }
    if (withJac) {
      Kt->resize(nfree, nfree);
      Kt->setFromTriplets(trip.begin(), trip.end());
    }
  };

  // Um passo (estático ou de tempo): Newton com busca linear.
  auto solveStep = [&](double time) -> bool {
    Eigen::VectorXd a = reduce(), R, R2;
    Eigen::SparseMatrix<double> K;
    const int maxIt = nonlinear ? std::max(1, in.maxIter) : 1;
    double r0 = -1;
    for (int it = 0; it < maxIt; ++it) {
      if (in.progress && !transient) in.progress(it, maxIt);
      expand(a);
      assemble(time, true, R, &K);
      const double rn = R.norm();
      if (r0 < 0) r0 = std::max(rn, 1e-30);
      if (it > 0 && rn <= in.tol * r0) {
        out.iterations = it;
        return true;
      }
      if (!analyzed) {
        ldlt.analyzePattern(K);
        analyzed = true;
      }
      ldlt.factorize(K);
      if (ldlt.info() != Eigen::Success) {
        out.error = "sistema singular: falta contorno (A prescrito) ou região isolada";
        return false;
      }
      Eigen::VectorXd d = ldlt.solve(-R);
      if (!d.allFinite()) {
        out.error = "falha ao resolver o sistema linear";
        return false;
      }
      if (!nonlinear) {
        a += d;
        expand(a);
        out.iterations = 1;
        return true;
      }
      // Busca linear: reduz o passo até o resíduo cair.
      double lam = 1;
      for (int ls = 0; ls < 12; ++ls) {
        expand(a + lam * d);
        assemble(time, false, R2, nullptr);
        if (R2.norm() < rn || lam < 1e-3) break;
        lam *= 0.5;
      }
      a += lam * d;
      if (lam * d.norm() <= 1e-12 * std::max(a.norm(), 1e-30)) {
        expand(a);
        out.iterations = it + 1;
        return true;
      }
    }
    expand(a);
    out.iterations = maxIt;
    return true;  // devolve a melhor estimativa (a interface avisa pelo número de iterações)
  };

  // ---------- Harmônico (AC): (K(ν_ef) + jωσM) Â = Ĵ, fasores complexos (SparseLU) ----------
  const bool harmonic = in.harmonic && in.freq > 0;
  if (harmonic) {
    using C = std::complex<double>;
    const double w = TWO_PI * in.freq;
    // ν efetiva por elemento (como no FEMM): começa na inicial (B pequeno) e segue ν = H(B_pico)/B_pico.
    std::vector<double> nuE(nt);
    for (int t = 0; t < nt; ++t) {
      double nuv, dnu;
      if (el[t].r >= 0 && el[t].r < nr && curves[el[t].r].ok) curves[el[t].r].nu(1e-6, nuv, dnu);
      else nuv = regv(el[t].r, in.nu, nu0);
      nuE[t] = nuv;
    }
    std::vector<C> Ac(nn, C(0, 0));
    Eigen::SparseLU<Eigen::SparseMatrix<C>> lu;
    const int maxIt = nonlinear ? std::max(1, in.maxIter) : 1;
    for (int it = 0; it < maxIt; ++it) {
      std::vector<Eigen::Triplet<C>> trip;
      trip.reserve(static_cast<size_t>(nt) * 9);
      Eigen::Matrix<C, Eigen::Dynamic, 1> F = Eigen::Matrix<C, Eigen::Dynamic, 1>::Zero(nfree);
      auto addK = [&](int vi, int vj, C k) {
        const Dof& di = dof[vi];
        if (di.free < 0) return;
        const Dof& dj = dof[vj];
        if (dj.free >= 0) trip.emplace_back(di.free, dj.free, di.sign * k * dj.sign);
        else F[di.free] -= di.sign * k * dj.value;  // Dirichlet (real) vai para o lado direito
      };
      auto addF = [&](int vi, C f) {
        const Dof& di = dof[vi];
        if (di.free >= 0) F[di.free] += di.sign * f;
      };
      for (int t = 0; t < nt; ++t) {
        const Elem& e = el[t];
        if (e.area <= 0) continue;
        const double sg = regv(e.r, in.sigma, 0);
        // J·e^{jφ} montado à mão: std::polar exige módulo ≥ 0 (a libc++ do WASM dá NaN com J < 0).
        const double Jr = regv(e.r, in.J, 0), ph = regv(e.r, in.jPhase, 0);
        const C J(Jr * std::cos(ph), Jr * std::sin(ph));
        const double brx = regv(e.r, in.brx, 0), bry = regv(e.r, in.bry, 0);
        for (int i = 0; i < 3; ++i) {
          const double gix = e.b[i] / (2 * e.area), giy = e.c[i] / (2 * e.area);
          C f = J * (e.area / 3);
          if (in.axisymmetric) f += nuE[t] * (-brx * e.c[i] + bry * e.b[i]) / 2;
          else f += nuE[t] * (brx * e.c[i] - bry * e.b[i]) / 2;
          addF(e.v[i], f);
          for (int j = 0; j < 3; ++j) {
            const double gjx = e.b[j] / (2 * e.area), gjy = e.c[j] / (2 * e.area);
            C k = nuE[t] * e.w * (gix * gjx + giy * gjy) * e.area;
            if (sg > 0) k += C(0, w * sg * e.w * e.area * (i == j ? 2 : 1) / 12);
            addK(e.v[i], e.v[j], k);
          }
        }
      }
      // Contorno misto (pré-integrado): matriz e lado direito.
      for (const RobinEdge& re : robin)
        for (int i = 0; i < 2; ++i) {
          addF(re.v[i], -re.f[i]);
          for (int j = 0; j < 2; ++j) addK(re.v[i], re.v[j], re.k[i][j]);
        }
      Eigen::SparseMatrix<C> K(nfree, nfree);
      K.setFromTriplets(trip.begin(), trip.end());
      lu.compute(K);
      if (lu.info() != Eigen::Success) {
        out.error = "sistema harmônico singular (falta contorno com A prescrito?)";
        return out;
      }
      Eigen::Matrix<C, Eigen::Dynamic, 1> a = lu.solve(F);
      for (int i = 0; i < nn; ++i) Ac[i] = dof[i].free < 0 ? C(dof[i].value, 0) : dof[i].sign * a[dof[i].free];
      out.iterations = it + 1;
      if (in.progress) in.progress(it + 1, maxIt);
      if (!nonlinear) break;
      // Atualiza ν_ef com |B| de pico (média com a anterior para estabilizar).
      double change = 0;
      for (int t = 0; t < nt; ++t) {
        const Elem& e = el[t];
        if (!(e.r >= 0 && e.r < nr && curves[e.r].ok)) continue;
        C gx = 0, gy = 0;
        for (int k = 0; k < 3; ++k) gx += e.b[k] * Ac[e.v[k]] / (2 * e.area), gy += e.c[k] * Ac[e.v[k]] / (2 * e.area);
        const double bpk = e.w * std::sqrt(std::norm(gx) + std::norm(gy));
        double nuv, dnu;
        curves[e.r].nu(std::max(bpk * bpk, 1e-12), nuv, dnu);
        const double next = 0.5 * nuE[t] + 0.5 * nuv;
        change = std::max(change, std::fabs(next - nuE[t]) / nuE[t]);
        nuE[t] = next;
      }
      if (change < 1e-4) break;
    }
    // Instantes de um período: A(t) = Re(Â e^{jωt}).
    const int nf = std::max(8, in.harmonicFrames);
    out.At.reserve(static_cast<size_t>(nf) * nn);
    for (int k = 0; k < nf; ++k) {
      const double time = k / (nf * in.freq);
      const C rot = std::polar(1.0, w * time);
      for (int i = 0; i < nn; ++i) out.At.push_back((Ac[i] * rot).real());
      out.times.push_back(time);
    }
    out.Aim.resize(nn);
    for (int i = 0; i < nn; ++i) A[i] = Ac[i].real(), out.Aim[i] = Ac[i].imag();
  }

  // ---------- Circuito externo acoplado (Newton sobre o sistema monolítico, SparseLU) ----------
  const int ne = static_cast<int>(in.elType.size());
  const int nk = in.coilStart.empty() ? 0 : static_cast<int>(in.coilStart.size()) - 1;
  if (transient && ne > 0) {
    const int nv = in.netNodes;
    // Correntes de ramo como incógnitas: L, fonte de tensão, bobina.
    std::vector<int> br(ne, -1);
    int nb = 0;
    for (int e = 0; e < ne; ++e)
      if (in.elType[e] == 1 || in.elType[e] == 3 || in.elType[e] == 5) br[e] = nb++;
    const int N = nfree + nv + nb;
    // Área de cada região (m²) e vetores de acoplamento por bobina: s (fonte no campo, por nó) e c (λ = c·A).
    std::vector<double> regArea(std::max(nr, 1), 0.0);
    for (const Elem& e : el)
      if (e.r >= 0 && e.r < nr) regArea[e.r] += e.area;
    std::vector<std::vector<double>> sK(nk, std::vector<double>(nn, 0.0));
    for (int k = 0; k < nk; ++k)
      for (int q = in.coilStart[k]; q < in.coilStart[k + 1]; ++q) {
        const int r = in.coilRegion[q];
        if (r < 0 || r >= nr || regArea[r] <= 0) continue;
        const double f = in.coilTurns[q] / regArea[r];
        for (const Elem& e : el)
          if (e.r == r)
            for (int i = 0; i < 3; ++i) sK[k][e.v[i]] += f * e.area / 3;
      }
    const double cScale = in.axisymmetric ? TWO_PI : in.depth;
    auto lambdaOf = [&](int k, const std::vector<double>& Av) {
      double l = 0;
      for (int i = 0; i < nn; ++i) l += sK[k][i] * Av[i];
      return cScale * l;
    };
    auto src = [&](int e, double time) {
      if (!in.elSteps.empty()) return in.elSteps[static_cast<size_t>(curStep - 1) * ne + e];
      return in.elValue[e] * std::sin(TWO_PI * in.elFreq[e] * time + in.elPhase[e]) + in.elDC[e];
    };
    std::vector<double> V(nv + 1, 0.0), Vprev(nv + 1, 0.0), Ib(nb, 0.0), Ibprev(nb, 0.0), lamPrev(nk, 0.0);
    Eigen::SparseLU<Eigen::SparseMatrix<double>> lu;
    bool luAnalyzed = false;
    out.At.reserve(static_cast<size_t>(in.steps) * nn);
    for (int step = 1; step <= in.steps; ++step) {
      const double time = step * in.dt;
      curStep = step;
      Eigen::VectorXd a = reduce();
      const int maxIt = nonlinear ? std::max(1, in.maxIter) : 2;
      double r0 = -1;
      for (int it = 0; it < maxIt; ++it) {
        expand(a);
        Eigen::VectorXd Rf;
        Eigen::SparseMatrix<double> Kf;
        assemble(time, true, Rf, &Kf);
        // Resíduo completo e Jacobiano.
        Eigen::VectorXd F = Eigen::VectorXd::Zero(N);
        std::vector<Eigen::Triplet<double>> T;
        T.reserve(Kf.nonZeros() + 64);
        for (int c = 0; c < Kf.outerSize(); ++c)
          for (Eigen::SparseMatrix<double>::InnerIterator itk(Kf, c); itk; ++itk) T.emplace_back(itk.row(), itk.col(), itk.value());
        F.head(nfree) = Rf;
        auto vrow = [&](int node) { return nfree + node - 1; };  // linha/coluna da tensão do nó (1..nv)
        auto brcol = [&](int e) { return nfree + nv + br[e]; };
        // Correntes dos elementos (valor atual) e contribuição à KCL.
        auto Vn = [&](int n) { return n > 0 ? V[n] : 0.0; };
        for (int e = 0; e < ne; ++e) {
          const int A_ = in.elA[e], B_ = in.elB[e], ty = in.elType[e];
          double ie = 0;  // corrente de a para b
          // derivadas de ie em relação a V_a, V_b (para R, C) ou à corrente de ramo
          if (ty == 0) {
            const double g = 1 / in.elValue[e];
            ie = g * (Vn(A_) - Vn(B_));
            if (A_ > 0) T.emplace_back(vrow(A_), vrow(A_), g);
            if (B_ > 0) T.emplace_back(vrow(B_), vrow(B_), g);
            if (A_ > 0 && B_ > 0) T.emplace_back(vrow(A_), vrow(B_), -g), T.emplace_back(vrow(B_), vrow(A_), -g);
          } else if (ty == 2) {
            const double g = in.elValue[e] / in.dt;
            ie = g * ((Vn(A_) - Vn(B_)) - (Vprev[std::max(A_, 0)] * (A_ > 0) - Vprev[std::max(B_, 0)] * (B_ > 0)));
            if (A_ > 0) T.emplace_back(vrow(A_), vrow(A_), g);
            if (B_ > 0) T.emplace_back(vrow(B_), vrow(B_), g);
            if (A_ > 0 && B_ > 0) T.emplace_back(vrow(A_), vrow(B_), -g), T.emplace_back(vrow(B_), vrow(A_), -g);
          } else if (ty == 4) {
            ie = src(e, time);
          } else {
            ie = Ib[br[e]];
            if (A_ > 0) T.emplace_back(vrow(A_), brcol(e), 1);
            if (B_ > 0) T.emplace_back(vrow(B_), brcol(e), -1);
          }
          if (A_ > 0) F[vrow(A_)] += ie;
          if (B_ > 0) F[vrow(B_)] -= ie;
          // Equações de ramo.
          if (ty == 1) {  // L: V_a − V_b − L (i − i_prev)/dt = 0
            const int row = brcol(e);
            const double Ldt = in.elValue[e] / in.dt;
            F[row] = Vn(A_) - Vn(B_) - Ldt * (Ib[br[e]] - Ibprev[br[e]]);
            if (A_ > 0) T.emplace_back(row, vrow(A_), 1);
            if (B_ > 0) T.emplace_back(row, vrow(B_), -1);
            T.emplace_back(row, row, -Ldt);
          } else if (ty == 3) {  // V: V_a − V_b − V(t) = 0
            const int row = brcol(e);
            F[row] = Vn(A_) - Vn(B_) - src(e, time);
            if (A_ > 0) T.emplace_back(row, vrow(A_), 1);
            if (B_ > 0) T.emplace_back(row, vrow(B_), -1);
          } else if (ty == 5) {  // bobina: V_a − V_b − R i − (λ − λ_prev)/dt = 0; campo recebe −s·i
            const int k = in.elCoil[e], row = brcol(e);
            const double ik = Ib[br[e]];
            F[row] = Vn(A_) - Vn(B_) - in.coilR[k] * ik - (lambdaOf(k, A) - lamPrev[k]) / in.dt;
            if (A_ > 0) T.emplace_back(row, vrow(A_), 1);
            if (B_ > 0) T.emplace_back(row, vrow(B_), -1);
            T.emplace_back(row, row, -in.coilR[k]);
            for (int i = 0; i < nn; ++i) {
              if (sK[k][i] == 0 || dof[i].free < 0) continue;
              const int fi = dof[i].free;
              const double sgn = dof[i].sign;
              F[fi] -= sgn * sK[k][i] * ik;  // fonte J = N i / A no campo
              T.emplace_back(fi, row, -sgn * sK[k][i]);
              T.emplace_back(row, fi, -cScale * sK[k][i] * sgn / in.dt);
            }
          }
        }
        const double rn = F.norm();
        if (r0 < 0) r0 = std::max(rn, 1e-30);
        if (it > 0 && rn <= in.tol * r0) break;
        Eigen::SparseMatrix<double> Jm(N, N);
        Jm.setFromTriplets(T.begin(), T.end());
        if (!luAnalyzed) {
          lu.analyzePattern(Jm);
          luAnalyzed = true;
        }
        lu.factorize(Jm);
        if (lu.info() != Eigen::Success) {
          out.error = "circuito ou campo singular (falta terra, nó solto ou contorno A prescrito)";
          return out;
        }
        Eigen::VectorXd d = lu.solve(-F);
        if (!d.allFinite()) {
          out.error = "falha ao resolver o sistema acoplado";
          return out;
        }
        a += d.head(nfree);
        for (int n = 1; n <= nv; ++n) V[n] += d[nfree + n - 1];
        for (int b = 0; b < nb; ++b) Ib[b] += d[nfree + nv + b];
        out.iterations = it + 1;
        if (d.norm() <= 1e-12 * std::max(1.0, a.norm())) {
          expand(a);
          break;
        }
      }
      expand(a);
      // Guarda o passo.
      out.At.insert(out.At.end(), A.begin(), A.end());
      out.times.push_back(time);
      for (int n = 1; n <= nv; ++n) out.nodeV.push_back(V[n]);
      for (int e = 0; e < ne; ++e) {
        const int A_ = in.elA[e], B_ = in.elB[e], ty = in.elType[e];
        const double va = A_ > 0 ? V[A_] : 0, vb = B_ > 0 ? V[B_] : 0;
        double ie;
        if (ty == 0) ie = (va - vb) / in.elValue[e];
        else if (ty == 2) ie = in.elValue[e] / in.dt * ((va - vb) - ((A_ > 0 ? Vprev[A_] : 0) - (B_ > 0 ? Vprev[B_] : 0)));
        else if (ty == 4) ie = src(e, time);
        else ie = Ib[br[e]];
        out.elI.push_back(ie);
      }
      for (int k = 0; k < nk; ++k) {
        lamPrev[k] = lambdaOf(k, A);
        out.coilLambda.push_back(lamPrev[k]);
      }
      Aprev = A;
      Vprev = V;
      Ibprev = Ib;
      if (in.progress) in.progress(step, in.steps);
    }
    out.A = A;
  } else if (transient) {
    out.At.reserve(static_cast<size_t>(in.steps) * nn);
    for (int k = 1; k <= in.steps; ++k) {
      const double time = k * in.dt;
      curStep = k;
      if (!solveStep(time)) return out;
      out.At.insert(out.At.end(), A.begin(), A.end());
      out.times.push_back(time);
      Aprev = A;
      if (in.progress) in.progress(k, in.steps);
    }
  } else if (!harmonic && !solveStep(0)) {
    return out;
  }
  out.A = A;

  out.bx.resize(nt);
  out.by.resize(nt);
  double W = 0;
  for (int t = 0; t < nt; ++t) {
    const Elem& e = el[t];
    double gx, gy;
    grad(e, A, gx, gy);
    double Bx, By, dV;
    if (in.axisymmetric) {
      const double rc = std::max(e.rc, 1e-12);
      Bx = -gy / rc;
      By = gx / rc;
      dV = TWO_PI * rc * e.area;
    } else {
      Bx = gy;
      By = -gx;
      dV = e.area;
    }
    out.bx[t] = Bx;
    out.by[t] = By;
    if (e.r >= 0 && e.r < nr && curves[e.r].ok) W += curves[e.r].energy(std::hypot(Bx, By)) * dV;
    else {
      const double hx = Bx - regv(e.r, in.brx, 0), hy = By - regv(e.r, in.bry, 0);
      W += 0.5 * regv(e.r, in.nu, nu0) * (hx * hx + hy * hy) * dV;
    }
  }
  out.energy = W;
  return out;
}

}  // namespace magfem
