#pragma once
// API pública do núcleo magfem.

namespace magfem {

const char* version();

// Resolve -u'' = 1 em (0,1), u(0)=u(1)=0, com n elementos lineares (Eigen SimplicialLDLT).
// Retorna max(u); a solução exata é 1/8. Serve para validar a cadeia C++/Eigen/WASM.
double poisson1d_max(int n);

}  // namespace magfem
