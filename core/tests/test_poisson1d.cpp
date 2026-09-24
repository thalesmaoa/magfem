#include <cmath>
#include <cstdio>

#include "magfem.h"

int main() {
  // Elementos lineares em 1D são nodalmente exatos: com n par, max(u) = 1/8.
  const double u = magfem::poisson1d_max(100);
  const double err = std::fabs(u - 0.125);
  std::printf("poisson1d: max(u) = %.12f, erro = %.3e\n", u, err);
  return err < 1e-10 ? 0 : 1;
}
