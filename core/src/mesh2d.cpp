// Chamada ao Triangle (compilado como biblioteca, TRILIBRARY) e conversão dos arrays.
#include "mesh2d.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>

extern "C" {
#define REAL double
#define VOID void
#include "triangle.h"
#undef VOID
}

namespace magfem {

namespace {
void init(triangulateio& t) { std::memset(&t, 0, sizeof(t)); }
void release(triangulateio& t) {
  void* ptrs[] = {t.pointlist, t.pointattributelist, t.pointmarkerlist, t.trianglelist, t.triangleattributelist, t.trianglearealist,
                  t.neighborlist, t.segmentlist, t.segmentmarkerlist, t.edgelist, t.edgemarkerlist, t.normlist};
  for (void* p : ptrs) std::free(p);
}
}  // namespace

MeshOutput triangulate_pslg(const MeshInput& in) {
  MeshOutput out;
  const int np = static_cast<int>(in.xy.size() / 2);
  const int ns = static_cast<int>(in.segments.size() / 2);
  if (np < 3 || ns < 3) {
    out.error = "contorno insuficiente para malhar";
    return out;
  }
  triangulateio tin, tout;
  init(tin);
  init(tout);
  std::vector<double> xy(in.xy), holes(in.holes), regions(in.regions);
  std::vector<int> seg(in.segments), mark(in.segMarkers);
  if (static_cast<int>(mark.size()) != ns) mark.assign(ns, 0);
  tin.numberofpoints = np;
  tin.pointlist = xy.data();
  tin.numberofsegments = ns;
  tin.segmentlist = seg.data();
  tin.segmentmarkerlist = mark.data();
  tin.numberofholes = static_cast<int>(holes.size() / 2);
  tin.holelist = holes.empty() ? nullptr : holes.data();
  tin.numberofregions = static_cast<int>(regions.size() / 4);
  tin.regionlist = regions.empty() ? nullptr : regions.data();

  // p: PSLG, z: índices a partir de 0, A: atributos de região, a: área por região, q: qualidade,
  // Q: silencioso, Y: sem pontos novos na borda.
  double q = in.minAngle;
  if (q > 34) q = 34;
  char sw[128];
  int n = std::snprintf(sw, sizeof sw, "pzAQ");
  if (q > 0) n += std::snprintf(sw + n, sizeof sw - n, "q%.4g", q);
  if (in.maxArea > 0) n += std::snprintf(sw + n, sizeof sw - n, "a%.10g", in.maxArea);
  n += std::snprintf(sw + n, sizeof sw - n, "a");  // áreas por região (regionlist)
  if (in.keepBoundary) std::snprintf(sw + n, sizeof sw - n, "Y");

  triangulate(sw, &tin, &tout, nullptr);

  out.xy.assign(tout.pointlist, tout.pointlist + 2 * tout.numberofpoints);
  out.triangles.assign(tout.trianglelist, tout.trianglelist + 3 * tout.numberoftriangles);
  out.triRegion.resize(tout.numberoftriangles, 0);
  if (tout.numberoftriangleattributes > 0)
    for (int i = 0; i < tout.numberoftriangles; ++i)
      out.triRegion[i] = static_cast<int>(tout.triangleattributelist[i * tout.numberoftriangleattributes]);
  if (tout.pointmarkerlist) out.nodeMarkers.assign(tout.pointmarkerlist, tout.pointmarkerlist + tout.numberofpoints);
  else out.nodeMarkers.assign(tout.numberofpoints, 0);
  // Arrays de entrada pertencem aos vectors; só libera o que o Triangle alocou.
  tout.holelist = nullptr;
  tout.regionlist = nullptr;
  release(tout);
  return out;
}

}  // namespace magfem
