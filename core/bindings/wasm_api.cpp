#include <emscripten/bind.h>
#include <string>

#include "magfem.h"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(magfem) {
  function("version", optional_override([]() { return std::string(magfem::version()); }));
  function("poisson1dMax", &magfem::poisson1d_max);
}
