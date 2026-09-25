#include "magfem.h"

#include <Eigen/SparseCholesky>
#include <Eigen/SparseCore>
#include <vector>

namespace magfem {

const char* version() { return "1.0.0"; }

double poisson1d_max(int n) {
  if (n < 2) return 0.0;
  const double h = 1.0 / n;
  const int m = n - 1;  // nós internos
  std::vector<Eigen::Triplet<double>> t;
  t.reserve(3 * m);
  for (int i = 0; i < m; ++i) {
    t.emplace_back(i, i, 2.0 / h);
    if (i > 0) t.emplace_back(i, i - 1, -1.0 / h);
    if (i < m - 1) t.emplace_back(i, i + 1, -1.0 / h);
  }
  Eigen::SparseMatrix<double> K(m, m);
  K.setFromTriplets(t.begin(), t.end());
  Eigen::VectorXd f = Eigen::VectorXd::Constant(m, h);
  Eigen::SimplicialLDLT<Eigen::SparseMatrix<double>> solver(K);
  if (solver.info() != Eigen::Success) return 0.0;
  Eigen::VectorXd u = solver.solve(f);
  return u.maxCoeff();
}

}  // namespace magfem
