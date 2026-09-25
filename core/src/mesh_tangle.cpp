// Adaptador da Tangle (David Meeker, MIT; https://github.com/dcm3c/tangle), o gerador de malha do FEMM:
// o tangle.cpp é compilado aqui como biblioteca (sem main) e chamado com a malha em memória.
#define TANGLE_AS_LIBRARY
#include "tangle.cpp"

#include "mesh2d.h"

namespace magfem {

MeshOutput triangulate_pslg(const MeshInput& in) {
  MeshOutput out;
  const int np = static_cast<int>(in.xy.size() / 2);
  const int ns = static_cast<int>(in.segments.size() / 2);
  if (np < 3 || ns < 3) {
    out.error = "contorno insuficiente para malhar";
    return out;
  }
  Mesh mesh;
  Options opts;
  opts.pslg = true;
  opts.quality = in.minAngle > 0;
  opts.min_angle = std::min(34.0, in.minAngle);
  opts.regions = true;
  opts.area_limit = true;  // áreas por região; max_area global se dada
  opts.max_area = in.maxArea > 0 ? in.maxArea : -1.0;
  opts.zero_indexed = true;
  opts.first_index = 0;
  opts.quiet = true;
  for (int i = 0; i < np; ++i) {
    Point p{};
    p.x = in.xy[2 * i];
    p.y = in.xy[2 * i + 1];
    p.id = i;
    p.marker = 0;
    mesh.vertices.push_back(p);
  }
  for (int s = 0; s < ns; ++s) {
    Segment g{};
    g.v0 = in.segments[2 * s];
    g.v1 = in.segments[2 * s + 1];
    g.marker = s < static_cast<int>(in.segMarkers.size()) ? in.segMarkers[s] : 0;
    mesh.segments.push_back(g);
  }
  // Periódicos (forma com dois marcadores: o marcador é o lado).
  for (size_t k = 0; k + 2 < in.pbc.size(); k += 3) {
    const int ma = in.pbc[k], mb = in.pbc[k + 1], type = in.pbc[k + 2] ? 1 : 0;
    if (ma == mb) continue;
    for (Segment& g : mesh.segments) {
      if (g.marker == ma) g.pbc_type = type, g.pbc_side = 0;
      else if (g.marker == mb) g.pbc_type = type, g.pbc_side = 1;
    }
    mesh.pbc_defs.push_back({ma, mb, type});
  }
  for (size_t h = 0; h + 1 < in.holes.size(); h += 2) mesh.holes.push_back({in.holes[h], in.holes[h + 1]});
  for (size_t r = 0; r + 3 < in.regions.size(); r += 4) mesh.regions.push_back({in.regions[r], in.regions[r + 1], in.regions[r + 2], in.regions[r + 3]});
  int rc = TANGLE_ERR_MESH;
  try {
    rc = runMeshPipeline(mesh, opts);
  } catch (const std::exception& e) {
    out.error = std::string("Tangle: ") + e.what();
    return out;
  }
  if (rc != TANGLE_OK) {
    out.error = "Tangle falhou (código " + std::to_string(rc) + ")";
    return out;
  }
  const int nv = static_cast<int>(mesh.vertices.size());
  if (nv < np) {
    out.error = "Tangle alterou os nós de entrada";
    return out;
  }
  out.xy.resize(2 * static_cast<size_t>(nv));
  out.nodeMarkers.resize(nv);
  for (int i = 0; i < nv; ++i) {
    out.xy[2 * i] = mesh.vertices[i].x;
    out.xy[2 * i + 1] = mesh.vertices[i].y;
    out.nodeMarkers[i] = mesh.vertices[i].marker;
  }
  for (const Triangle& t : mesh.triangles) {
    int v0 = t.v[0], v1 = t.v[1], v2 = t.v[2];
    const double a2 = (out.xy[2 * v1] - out.xy[2 * v0]) * (out.xy[2 * v2 + 1] - out.xy[2 * v0 + 1]) - (out.xy[2 * v2] - out.xy[2 * v0]) * (out.xy[2 * v1 + 1] - out.xy[2 * v0 + 1]);
    if (a2 < 0) std::swap(v1, v2);
    out.triangles.push_back(v0);
    out.triangles.push_back(v1);
    out.triangles.push_back(v2);
    out.triRegion.push_back(static_cast<int>(std::lround(t.region_attrib)));
  }
  std::vector<int> segs;
  for (const Segment& g : mesh.segments) segs.push_back(g.v0), segs.push_back(g.v1);
  build_seg_chains(in, out.xy, segs, out);
  if (out.triangles.empty()) out.error = "nenhum triângulo dentro do domínio";
  return out;
}

}  // namespace magfem
