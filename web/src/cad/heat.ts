// Acoplamento magnético → térmico: perdas médias por elemento (W/m³) a partir da solução magnética (AC ou CC) e
// da temperatura de cada região, e a montagem do problema térmico (condições de contorno e canais de ar).
import { proximityLossFoil, proximityLossRound, skinDepth, skinFactorFoil, skinFactorRound } from './acwire';
import { evaluate, evaluateVariables } from './expr';
import type { MeshResult } from './meshgen';
import { findRegion, type Arrangement } from './regions';
import { depthOf, laminationOf, type Solution } from './solve';
import type { ThermalEdgeBC, ThermalProblem, ThermalResult } from './thermal';
import type { Id, Material, Sketch, ThermalSettings } from './types';
import { turnArea } from './wire';

/** Condutividade térmica padrão por grupo (materiais sem k definido). */
const K_DEFAULT: Record<string, number> = { air: 0.026, conductor: 380, steel: 30, magnet: 8, custom: 1 };

export function thermalK(m: Material | undefined): number {
  if (!m) return 0;
  if (m.group === 'air') return 0; // ar fica fora do domínio: vira convecção nas superfícies
  const k = m.kth ?? K_DEFAULT[m.group ?? 'custom'] ?? 1;
  // Chapas empilhadas na profundidade: no plano do desenho, aço e isolante em paralelo.
  const f = laminationOf(m)?.fill ?? 1;
  return k * f;
}

/** Fator da resistividade com a temperatura: ρ(T)/ρ(20 °C) = 1 + α·(T − 20). */
export const rhoFactor = (m: Material | undefined, T: number | undefined) => (m?.alphaR && T !== undefined ? Math.max(0.1, 1 + m.alphaR * (T - 20)) : 1);

/**
 * Perdas médias por triângulo (W/m³). Bobinas: J²/(2σ) no AC (J de pico) ou J²/σ no CC, com o fio (seção real) e o
 * fator pelicular, mais a proximidade com o B̂ local; condutores maciços: ½σω²|Â|²; ferro: Steinmetz.
 * `regionT` corrige a resistividade dos condutores (bobinas) pela temperatura de cada região.
 */
export function elementLosses(sk: Sketch, arr: Arrangement, sol: Solution, regionT?: Map<number, number>): Float64Array {
  const { xy, triangles, triRegion } = sol.mesh;
  const nt = triangles.length / 3;
  const q = new Float64Array(nt);
  const mats = new Map(sk.materials.map((m) => [m.id, m]));
  const hm = sol.harmonic;
  const w = hm ? 2 * Math.PI * hm.freq : 0;
  // Dados por região (bobinas): material, fio e densidade de corrente.
  type Coil = { m: Material; sigma: number; area: number; J: number; strands: number; round: boolean; rad: number; wr: number; hr: number; F: number; delta: number; fillAdj: number };
  const coil = new Map<number, Coil>();
  const regionArea = new Float64Array(arr.regions.length);
  for (let t = 0; t < nt; t++) {
    const r = triRegion[t];
    if (r < 0) continue;
    const a = triangles[3 * t], b = triangles[3 * t + 1], c = triangles[3 * t + 2];
    regionArea[r] += (Math.abs((xy[2 * b] - xy[2 * a]) * (xy[2 * c + 1] - xy[2 * a + 1]) - (xy[2 * c] - xy[2 * a]) * (xy[2 * b + 1] - xy[2 * a + 1])) / 2) * 1e-6;
  }
  for (const a of sk.regionAssigns) {
    if (!a.circuit && !a.current) continue;
    const reg = findRegion(arr, a);
    const m = a.material ? mats.get(a.material) : undefined;
    if (!reg || !m || !(m.sigma > 0)) continue;
    const sigma = (m.sigma * 1e6) / rhoFactor(m, regionT?.get(reg.index));
    const J = sol.J[reg.index] ?? 0;
    const area = regionArea[reg.index];
    let strands = 0, round = true, rad = 0, wr = 0, hr = 0, F = 1, fillAdj = 1;
    const delta = hm ? skinDepth(hm.freq, sigma) : Infinity;
    if (a.wire) {
      const aw = turnArea(a.wire);
      if (aw && area > 0) {
        const par = Math.max(1, Math.round(a.wire.parallel ?? 1));
        strands = Math.abs(a.turns ?? 1) * par;
        // Com o fio, a perda CC por volume é |N|·I²/(σ·A_espira·A_região): J²/σ × A_região/(|N|·A_espira).
        fillAdj = area / (Math.abs(a.turns ?? 1) * aw);
        round = a.wire.kind !== 'rect';
        rad = round ? Math.sqrt(aw / par / Math.PI) : 0;
        wr = (a.wire.w ?? 0) * 1e-3;
        hr = (a.wire.h ?? 0) * 1e-3;
        if (hm) F = round ? skinFactorRound(rad, delta) : skinFactorFoil(Math.min(wr, hr), delta);
      }
    }
    coil.set(reg.index, { m, sigma, area, J, strands, round, rad, wr, hr, F, delta, fillAdj });
  }
  for (let t = 0; t < nt; t++) {
    const r = triRegion[t];
    if (r < 0) continue;
    const nodes = [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
    const x = nodes.map((n) => xy[2 * n] * 1e-3), y = nodes.map((n) => xy[2 * n + 1] * 1e-3);
    const rc = (x[0] + x[1] + x[2]) / 3;
    const cl = coil.get(r);
    if (cl) {
      // Joule (CC ou AC de pico → média ½).
      q[t] += ((cl.J * cl.J) / cl.sigma) * (hm ? 0.5 : 1) * cl.fillAdj * cl.F;
      if (hm && cl.strands > 0) {
        const { bx2, by2 } = bPeak2(sol, nodes, x, y, rc);
        const pl = cl.round
          ? proximityLossRound(cl.rad, cl.delta, cl.sigma, Math.sqrt(bx2 + by2))
          : cl.wr * proximityLossFoil(cl.hr, cl.delta, cl.sigma, Math.sqrt(bx2)) + cl.hr * proximityLossFoil(cl.wr, cl.delta, cl.sigma, Math.sqrt(by2));
        q[t] += (cl.strands / cl.area) * pl;
      }
      continue;
    }
    if (!hm) continue;
    // Condutor maciço: correntes parasitas ½σω²|Â|² (ψ/r no axissimétrico).
    if (hm.sigma[r] > 0) {
      let re = (hm.Are[nodes[0]] + hm.Are[nodes[1]] + hm.Are[nodes[2]]) / 3, im = (hm.Aim[nodes[0]] + hm.Aim[nodes[1]] + hm.Aim[nodes[2]]) / 3;
      if (sol.axisymmetric) (re /= Math.max(rc, 1e-12)), (im /= Math.max(rc, 1e-12));
      q[t] += 0.5 * hm.sigma[r] * w * w * (re * re + im * im);
    }
    // Ferro (Steinmetz, coeficientes já com a laminação).
    const ic = hm.iron?.[r];
    if (ic) {
      const { bx2, by2 } = bPeak2(sol, nodes, x, y, rc);
      const bpk = Math.sqrt(bx2 + by2);
      q[t] += ic[0] * hm.freq * Math.pow(bpk, ic[1]) + ic[2] * hm.freq * hm.freq * bpk * bpk;
    }
  }
  return q;
}

/** |B̂x|² e |B̂y|² do fasor num triângulo. */
function bPeak2(sol: Solution, nodes: number[], x: number[], y: number[], rc: number) {
  const hm = sol.harmonic!;
  const a2 = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
  let gxr = 0, gyr = 0, gxi = 0, gyi = 0;
  for (let k = 0; k < 3; k++) {
    const j = (k + 1) % 3, l = (k + 2) % 3;
    gxr += ((y[j] - y[l]) * hm.Are[nodes[k]]) / a2;
    gyr += ((x[l] - x[j]) * hm.Are[nodes[k]]) / a2;
    gxi += ((y[j] - y[l]) * hm.Aim[nodes[k]]) / a2;
    gyi += ((x[l] - x[j]) * hm.Aim[nodes[k]]) / a2;
  }
  const s = sol.axisymmetric ? 1 / Math.max(rc, 1e-12) : 1;
  return { bx2: s * s * (gyr * gyr + gyi * gyi), by2: s * s * (gxr * gxr + gxi * gxi) };
}

/**
 * Problema térmico a partir da malha, dos materiais, das perdas e das condições da física térmica. Superfícies do
 * sólido expostas ao ar (ou à borda) recebem a convecção padrão; curvas com condição própria usam a delas.
 */
export function thermalProblem(sk: Sketch, arr: Arrangement, mesh: MeshResult, q: Float64Array, th: ThermalSettings): { pb: ThermalProblem; channelIds: Id[] } {
  const { values } = evaluateVariables(sk.variables, sk.settings.unit);
  const ev = (e: string | undefined, def: number) => {
    if (!e?.trim()) return def;
    try {
      return evaluate(e, { env: values, unit: sk.settings.unit }).v;
    } catch {
      return def;
    }
  };
  const mats = new Map(sk.materials.map((m) => [m.id, m]));
  const regionK = new Map<number, number>();
  for (const a of sk.regionAssigns) {
    const reg = findRegion(arr, a);
    if (reg && !a.noMesh) regionK.set(reg.index, thermalK(a.material ? mats.get(a.material) : undefined));
  }
  const nt = mesh.triangles.length / 3;
  const k = new Float64Array(nt);
  for (let t = 0; t < nt; t++) k[t] = regionK.get(mesh.triRegion[t]) ?? 0;
  // Arestas de borda do domínio térmico: pertencem a um só triângulo sólido.
  const count = new Map<string, [number, number, number]>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let t = 0; t < nt; t++) {
    if (!(k[t] > 0)) continue;
    for (let j = 0; j < 3; j++) {
      const a = mesh.triangles[3 * t + j], b = mesh.triangles[3 * t + ((j + 1) % 3)];
      const kk = key(a, b);
      const c = count.get(kk);
      if (c) c[2]++;
      else count.set(kk, [a, b, 1]);
    }
  }
  // Curva de cada aresta (pelos nós das curvas na malha).
  const edgeCurve = new Map<string, Id>();
  for (const [cid, list] of Object.entries(mesh.curveNodes ?? {})) {
    const set = new Set(list);
    for (const [kk, [a, b]] of count) if (set.has(a) && set.has(b) && !edgeCurve.has(kk)) edgeCurve.set(kk, cid);
  }
  const tAmb = ev(th.tAmb, 25), h = ev(th.h, 10);
  const channelIds = th.channels.map((c) => c.id);
  const bcOf = new Map<Id, (typeof th.bcs)[number]>();
  for (const bc of th.bcs) for (const c of bc.curves) bcOf.set(c, bc);
  const edges: ThermalEdgeBC[] = [];
  for (const [kk, [a, b, n]] of count) {
    const bc = edgeCurve.has(kk) ? bcOf.get(edgeCurve.get(kk)!) : undefined;
    if (bc?.type === 'temperature') edges.push({ a, b, kind: 'temperature', t: ev(bc.t, tAmb) });
    if (n !== 1) continue; // interface interna: só a temperatura fixa vale
    if (bc?.type === 'insulated') continue;
    if (bc?.type === 'convection') {
      const ch = bc.channel ? channelIds.indexOf(bc.channel) : -1;
      edges.push({ a, b, kind: 'convection', h: ev(bc.h, h), ...(ch >= 0 ? { channel: ch } : { tRef: ev(bc.t, tAmb) }) });
    } else if (!bc) edges.push({ a, b, kind: 'convection', h, tRef: tAmb });
  }
  const hFaces = ev(th.hFaces, 0);
  const pb: ThermalProblem = {
    xy: mesh.xy,
    triangles: mesh.triangles,
    k,
    q,
    axisymmetric: sk.settings.problem === 'axisymmetric',
    depth: depthOf(sk),
    faces: hFaces > 0 ? { h: hFaces, t: tAmb } : undefined,
    edges,
    // Vazão em m³/h → m³/s.
    channels: th.channels.map((c) => ({ flow: ev(c.flow, 0) / 3600, tIn: ev(c.tIn, tAmb) })),
  };
  return { pb, channelIds };
}

/** Solução térmica no formato das soluções de campo (para mapas, isotermas, gráficos e tabelas). */
export function thermalSolution(mag: Solution, res: ThermalResult, q: Float64Array, sk: Sketch, arr: Arrangement): Solution {
  const { xy, triangles, triRegion } = mag.mesh;
  const nt = triangles.length / 3;
  const mats = new Map(sk.materials.map((m) => [m.id, m]));
  const regionK = new Map<number, number>();
  for (const a of sk.regionAssigns) {
    const reg = findRegion(arr, a);
    if (reg) regionK.set(reg.index, thermalK(a.material ? mats.get(a.material) : undefined));
  }
  const tri: number[] = [], reg: number[] = [], bx: number[] = [], by: number[] = [];
  const sum = new Map<number, [number, number]>();
  let tmax = -Infinity, tmin = Infinity;
  for (let t = 0; t < nt; t++) {
    const v = [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
    const T = v.map((i) => res.T[i]);
    if (!T.every(Number.isFinite)) continue;
    tri.push(...v);
    reg.push(triRegion[t]);
    const x = v.map((i) => xy[2 * i] * 1e-3), y = v.map((i) => xy[2 * i + 1] * 1e-3);
    const a2 = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
    let gx = 0, gy = 0;
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3, l = (k + 2) % 3;
      gx += ((y[j] - y[l]) * T[k]) / a2;
      gy += ((x[l] - x[j]) * T[k]) / a2;
    }
    const kk = regionK.get(triRegion[t]) ?? 0;
    bx.push(-kk * gx);
    by.push(-kk * gy);
    const Te = (T[0] + T[1] + T[2]) / 3;
    const s = sum.get(triRegion[t]) ?? [0, 0];
    sum.set(triRegion[t], [s[0] + Te * Math.abs(a2), s[1] + Math.abs(a2)]);
    for (const v2 of T) (tmax = Math.max(tmax, v2)), (tmin = Math.min(tmin, v2));
  }
  const bxa = Float64Array.from(bx), bya = Float64Array.from(by);
  const bmag = bxa.map((v, i) => Math.hypot(v, bya[i]));
  const nr = arr.regions.length;
  const th = sk.nodes.find((n) => n.kind === 'physics' && n.physics === 'thermal' && n.thermal) as { thermal?: ThermalSettings } | undefined;
  return {
    A: res.T,
    bx: bxa,
    by: bya,
    bmag,
    bmax: tmax,
    energy: 0,
    axisymmetric: mag.axisymmetric,
    mesh: { ...mag.mesh, triangles: Int32Array.from(tri), triRegion: Int32Array.from(reg) } as MeshResult,
    nu: new Array(nr).fill(0),
    brx: new Array(nr).fill(0),
    bry: new Array(nr).fill(0),
    J: new Array(nr).fill(0),
    meshSize: mag.meshSize,
    ms: 0,
    thermal: {
      tmax,
      tmin,
      pIn: res.pIn,
      pOut: res.pOut,
      q,
      regionT: [...sum].map(([r, [a, w]]) => [r, a / w]),
      channels: res.channels.map((c, k) => ({ id: th?.thermal?.channels[k]?.id ?? String(k), name: th?.thermal?.channels[k]?.name ?? `Canal ${k + 1}`, ...c })),
    },
  };
}
