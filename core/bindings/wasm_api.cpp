#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <string>

#include "magfem.h"
#include "magstatic.h"
#include "mesh2d.h"

using namespace emscripten;

namespace {
template <typename T>
val toTyped(const std::vector<T>& v, const char* ctor) {
  val arr = val::global(ctor).new_(v.size());
  arr.call<void>("set", val(typed_memory_view(v.size(), v.data())));
  return arr;
}

// Entrada: { xy: number[], segments: number[], segMarkers: number[], holes: number[], regions: number[],
//            minAngle: number, maxArea: number, keepBoundary: boolean } (arrays JS ou typed arrays).
val triangulate(val in) {
  magfem::MeshInput m;
  m.xy = convertJSArrayToNumberVector<double>(in["xy"]);
  m.segments = convertJSArrayToNumberVector<int>(in["segments"]);
  m.segMarkers = convertJSArrayToNumberVector<int>(in["segMarkers"]);
  m.holes = convertJSArrayToNumberVector<double>(in["holes"]);
  m.regions = convertJSArrayToNumberVector<double>(in["regions"]);
  m.minAngle = in["minAngle"].as<double>();
  m.maxArea = in["maxArea"].as<double>();
  m.keepBoundary = in["keepBoundary"].as<bool>();
  magfem::MeshOutput o = magfem::triangulate_pslg(m);
  val r = val::object();
  r.set("error", o.error);
  r.set("xy", toTyped(o.xy, "Float64Array"));
  r.set("triangles", toTyped(o.triangles, "Int32Array"));
  r.set("triRegion", toTyped(o.triRegion, "Int32Array"));
  r.set("nodeMarkers", toTyped(o.nodeMarkers, "Int32Array"));
  return r;
}
// Entrada: ver MagInput (magstatic.h), com os mesmos nomes em camelCase.
val solveMagnetostatic(val in) {
  magfem::MagInput m;
  m.xy = convertJSArrayToNumberVector<double>(in["xy"]);
  m.triangles = convertJSArrayToNumberVector<int>(in["triangles"]);
  m.triRegion = convertJSArrayToNumberVector<int>(in["triRegion"]);
  m.nu = convertJSArrayToNumberVector<double>(in["nu"]);
  m.J = convertJSArrayToNumberVector<double>(in["J"]);
  m.brx = convertJSArrayToNumberVector<double>(in["brx"]);
  m.bry = convertJSArrayToNumberVector<double>(in["bry"]);
  m.axisymmetric = in["axisymmetric"].as<bool>();
  m.dirichletNodes = convertJSArrayToNumberVector<int>(in["dirichletNodes"]);
  m.dirichletValues = convertJSArrayToNumberVector<double>(in["dirichletValues"]);
  m.periodicSlave = convertJSArrayToNumberVector<int>(in["periodicSlave"]);
  m.periodicMaster = convertJSArrayToNumberVector<int>(in["periodicMaster"]);
  m.periodicSign = convertJSArrayToNumberVector<int>(in["periodicSign"]);
  auto has = [&](const char* k) { return !in[k].isUndefined() && !in[k].isNull(); };
  if (has("bhStart")) {
    m.bhStart = convertJSArrayToNumberVector<int>(in["bhStart"]);
    m.bhB = convertJSArrayToNumberVector<double>(in["bhB"]);
    m.bhH = convertJSArrayToNumberVector<double>(in["bhH"]);
  }
  if (has("sigma")) m.sigma = convertJSArrayToNumberVector<double>(in["sigma"]);
  if (has("jPhase")) m.jPhase = convertJSArrayToNumberVector<double>(in["jPhase"]);
  if (has("freq")) m.freq = in["freq"].as<double>();
  if (has("dt")) m.dt = in["dt"].as<double>();
  if (has("steps")) m.steps = in["steps"].as<int>();
  if (has("maxIter")) m.maxIter = in["maxIter"].as<int>();
  magfem::MagOutput o = magfem::solve_magnetostatic(m);
  val r = val::object();
  r.set("error", o.error);
  r.set("A", toTyped(o.A, "Float64Array"));
  r.set("bx", toTyped(o.bx, "Float64Array"));
  r.set("by", toTyped(o.by, "Float64Array"));
  r.set("energy", o.energy);
  r.set("iterations", o.iterations);
  r.set("At", toTyped(o.At, "Float64Array"));
  r.set("times", toTyped(o.times, "Float64Array"));
  return r;
}
}  // namespace

EMSCRIPTEN_BINDINGS(magfem) {
  function("version", optional_override([]() { return std::string(magfem::version()); }));
  function("poisson1dMax", &magfem::poisson1d_max);
  function("triangulate", &triangulate);
  function("solveMagnetostatic", &solveMagnetostatic);
}
