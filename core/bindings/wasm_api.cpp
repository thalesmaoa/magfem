#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <string>

#include "magfem.h"
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
}  // namespace

EMSCRIPTEN_BINDINGS(magfem) {
  function("version", optional_override([]() { return std::string(magfem::version()); }));
  function("poisson1dMax", &magfem::poisson1d_max);
  function("triangulate", &triangulate);
}
