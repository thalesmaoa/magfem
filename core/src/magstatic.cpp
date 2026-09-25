// Montagem P1, eliminação de Dirichlet e de nós periódicos, solução por Cholesky esparsa (Eigen).
#include "magstatic.h"

#include <Eigen/Sparse>
#include <Eigen/SparseCholesky>
#include <cmath>

namespace magfem {

namespace {
constexpr double TWO_PI = 6.283185307179586;

// Grau de liberdade de um nó: fixo (valor) ou livre (índice reduzido) com sinal.
struct Dof {
  int free = -1;  // índice reduzido; -1 se fixo
  double sign = 1;
  double value = 0;  // se fixo
};
}  // namespace

MagOutput solve_magnetostatic(const MagInput& in) {
  MagOutput out;
  const int nn = static_cast<int>(in.xy.size() / 2);
  const int nt = static_cast<int>(in.triangles.size() / 3);
  if (nn < 3 || nt < 1) {
    out.error = "malha vazia";
    return out;
  }
  const int nr = static_cast<int>(in.nu.size());
  auto reg = [&](int t, const std::vector<double>& v, double def) {
    const int r = in.triRegion[t];
    return r >= 0 && r < nr && r < static_cast<int>(v.size()) ? v[r] : def;
  };
  const double nu0 = 1.0 / (4e-7 * M_PI);

  // Resolve cada nó para (mestre final, sinal) seguindo a cadeia de periódicos; Dirichlet vence.
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

  std::vector<Eigen::Triplet<double>> trip;
  trip.reserve(static_cast<size_t>(nt) * 9);
  Eigen::VectorXd rhs = Eigen::VectorXd::Zero(nfree);
  for (int t = 0; t < nt; ++t) {
    const int* v = &in.triangles[3 * t];
    double x[3], y[3];
    for (int k = 0; k < 3; ++k) x[k] = in.xy[2 * v[k]], y[k] = in.xy[2 * v[k] + 1];
    // b_i = y_j − y_k, c_i = x_k − x_j (gradientes das funções de forma × 2Δ)
    double b[3], c[3];
    for (int k = 0; k < 3; ++k) {
      const int j = (k + 1) % 3, l = (k + 2) % 3;
      b[k] = y[j] - y[l];
      c[k] = x[l] - x[j];
    }
    const double area2 = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
    const double area = 0.5 * std::fabs(area2);
    if (area <= 0) continue;
    const double nu = reg(t, in.nu, nu0);
    const double J = reg(t, in.J, 0);
    const double brx = reg(t, in.brx, 0), bry = reg(t, in.bry, 0);
    double w = 1;  // peso 1/r no axissimétrico (raio do centroide)
    if (in.axisymmetric) {
      const double rc = (x[0] + x[1] + x[2]) / 3;
      w = 1.0 / std::max(rc, 1e-12);
    }
    double ke[3][3], fe[3];
    for (int i = 0; i < 3; ++i) {
      for (int j = 0; j < 3; ++j) ke[i][j] = nu * w * (b[i] * b[j] + c[i] * c[j]) / (4 * area);
      fe[i] = J * area / 3;
      // Ímã: ∫ ν Br·δB. Plano: δB = (∂N/∂y, −∂N/∂x); axissimétrico: δB = (−∂N/∂z, ∂N/∂r)/r.
      if (in.axisymmetric) fe[i] += nu * w * (-brx * c[i] + bry * b[i]) / 2;
      else fe[i] += nu * (brx * c[i] - bry * b[i]) / 2;
    }
    for (int i = 0; i < 3; ++i) {
      const Dof& di = dof[v[i]];
      if (di.free < 0) continue;
      rhs[di.free] += di.sign * fe[i];
      for (int j = 0; j < 3; ++j) {
        const Dof& dj = dof[v[j]];
        const double kij = di.sign * ke[i][j];
        if (dj.free < 0) rhs[di.free] -= kij * dj.value;
        else trip.emplace_back(di.free, dj.free, kij * dj.sign);
      }
    }
  }
  Eigen::SparseMatrix<double> K(nfree, nfree);
  K.setFromTriplets(trip.begin(), trip.end());
  Eigen::SimplicialLDLT<Eigen::SparseMatrix<double>> ldlt(K);
  if (ldlt.info() != Eigen::Success) {
    out.error = "sistema singular: falta contorno (A prescrito) ou região isolada";
    return out;
  }
  Eigen::VectorXd a = ldlt.solve(rhs);
  if (ldlt.info() != Eigen::Success || !a.allFinite()) {
    out.error = "falha ao resolver o sistema linear";
    return out;
  }
  out.A.resize(nn);
  for (int i = 0; i < nn; ++i) out.A[i] = dof[i].free < 0 ? dof[i].value : dof[i].sign * a[dof[i].free];

  out.bx.resize(nt);
  out.by.resize(nt);
  double W = 0;
  for (int t = 0; t < nt; ++t) {
    const int* v = &in.triangles[3 * t];
    double x[3], y[3];
    for (int k = 0; k < 3; ++k) x[k] = in.xy[2 * v[k]], y[k] = in.xy[2 * v[k] + 1];
    const double area2 = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
    double dAdx = 0, dAdy = 0;
    for (int k = 0; k < 3; ++k) {
      const int j = (k + 1) % 3, l = (k + 2) % 3;
      dAdx += (y[j] - y[l]) * out.A[v[k]] / area2;
      dAdy += (x[l] - x[j]) * out.A[v[k]] / area2;
    }
    double Bx, By, dV;
    const double area = 0.5 * std::fabs(area2);
    if (in.axisymmetric) {
      const double rc = std::max((x[0] + x[1] + x[2]) / 3, 1e-12);
      Bx = -dAdy / rc;
      By = dAdx / rc;
      dV = TWO_PI * rc * area;
    } else {
      Bx = dAdy;
      By = -dAdx;
      dV = area;
    }
    out.bx[t] = Bx;
    out.by[t] = By;
    const double nu = reg(t, in.nu, nu0);
    const double hx = Bx - reg(t, in.brx, 0), hy = By - reg(t, in.bry, 0);
    W += 0.5 * nu * (hx * hx + hy * hy) * dV;
  }
  out.energy = W;
  return out;
}

}  // namespace magfem
