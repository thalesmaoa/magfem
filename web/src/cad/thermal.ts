// Condução de calor em regime, 2D (plano por metro de profundidade, ou axissimétrico com peso 2πr), elementos P1:
//   −∇·(k∇T) = q,  convecção h·(T − T_ref) nas bordas, faces frente/trás no plano (2h/profundidade por volume),
//   temperatura fixa, e canais de ar (ventilador): T_ar médio = T_entrada + P/(2·ṁ·c_p), resolvido por iteração.
// Sistema simétrico positivo definido → gradiente conjugado com pré-condicionador de Jacobi.

export interface ThermalEdgeBC {
  /** Nós da aresta (índices da malha completa). */
  a: number;
  b: number;
  kind: 'convection' | 'temperature';
  h?: number;
  /** Referência da convecção: temperatura fixa (°C) ou o canal de ar. */
  tRef?: number;
  channel?: number;
  t?: number;
}

export interface ThermalProblem {
  /** Nós (mm) e triângulos da malha. */
  xy: ArrayLike<number>;
  triangles: ArrayLike<number>;
  /** Por triângulo: condutividade (W/m·K) ou 0 = fora do domínio térmico (ar), e fonte (W/m³). */
  k: ArrayLike<number>;
  q: ArrayLike<number>;
  axisymmetric: boolean;
  /** Plano: profundidade (m) e convecção nas faces da frente e de trás (h, T). */
  depth: number;
  faces?: { h: number; t: number };
  edges: ThermalEdgeBC[];
  /** Canais de ar: vazão (m³/s) e temperatura de entrada (°C). */
  channels: { flow: number; tIn: number }[];
}

export interface ThermalResult {
  /** Temperatura por nó (°C); NaN fora do domínio térmico. */
  T: Float64Array;
  /** Temperatura média do ar e calor levado por canal (W, total). */
  channels: { tAir: number; tOut: number; power: number }[];
  /** Balanço: perdas totais, calor pelas bordas e pelas faces (W, total). */
  pIn: number;
  pOut: number;
  iterations: number;
}

const RHO_AIR = 1.2, CP_AIR = 1005;

/** Resolve o problema térmico (com a iteração dos canais de ar). */
export function solveThermalProblem(pb: ThermalProblem): ThermalResult {
  const { xy, triangles } = pb;
  const nt = triangles.length / 3;
  const nnAll = xy.length / 2;
  // Nós do domínio térmico (triângulos com k > 0).
  const map = new Int32Array(nnAll).fill(-1);
  let n = 0;
  for (let t = 0; t < nt; t++) if (pb.k[t] > 0) for (let j = 0; j < 3; j++) if (map[triangles[3 * t + j]] < 0) map[triangles[3 * t + j]] = n++;
  const X = (i: number) => xy[2 * i] * 1e-3, Y = (i: number) => xy[2 * i + 1] * 1e-3;
  // Peso de integração: 1 por metro no plano; 2πr no axissimétrico.
  const wOf = (r: number) => (pb.axisymmetric ? 2 * Math.PI * r : 1);
  // Parte fixa da matriz (condução + faces) e da fonte.
  const rows: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  const add = (i: number, j: number, v: number) => rows[i].set(j, (rows[i].get(j) ?? 0) + v);
  const f0 = new Float64Array(n);
  let pIn = 0;
  const hf = !pb.axisymmetric && pb.faces && pb.faces.h > 0 ? (2 * pb.faces.h) / pb.depth : 0;
  for (let t = 0; t < nt; t++) {
    if (!(pb.k[t] > 0)) continue;
    const v = [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
    const x = v.map(X), y = v.map(Y);
    const a2 = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
    const A = Math.abs(a2) / 2;
    const w = wOf((x[0] + x[1] + x[2]) / 3);
    const bb = [y[1] - y[2], y[2] - y[0], y[0] - y[1]], cc = [x[2] - x[1], x[0] - x[2], x[1] - x[0]];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        let kij = (pb.k[t] * (bb[i] * bb[j] + cc[i] * cc[j])) / (4 * A);
        if (hf) kij += hf * (A / 12) * (i === j ? 2 : 1);
        add(map[v[i]], map[v[j]], kij * w);
      }
    for (let i = 0; i < 3; i++) f0[map[v[i]]] += ((pb.q[t] * A) / 3 + (hf ? (hf * pb.faces!.t * A) / 3 : 0)) * w;
    pIn += pb.q[t] * A * w;
  }
  const scale = pb.axisymmetric ? 1 : pb.depth;
  // Arestas de borda: comprimento e peso (raio no ponto médio).
  const edges = pb.edges.filter((e) => map[e.a] >= 0 && map[e.b] >= 0);
  const fixed = new Map<number, number>();
  for (const e of edges) if (e.kind === 'temperature' && e.t !== undefined) (fixed.set(map[e.a], e.t), fixed.set(map[e.b], e.t));
  const tAir = pb.channels.map((c) => c.tIn);
  let T: Float64Array = new Float64Array(n).fill(pb.channels[0]?.tIn ?? 25);
  let iterations = 0;
  let res: { tAir: number; tOut: number; power: number }[] = [];
  let pOut = 0;
  for (let it = 0; it < 60; it++) {
    iterations = it + 1;
    const K = rows.map((r) => new Map(r));
    const f = Float64Array.from(f0);
    for (const e of edges) {
      if (e.kind !== 'convection' || !(e.h! > 0)) continue;
      const i = map[e.a], j = map[e.b];
      const L = Math.hypot(X(e.a) - X(e.b), Y(e.a) - Y(e.b));
      const w = wOf((X(e.a) + X(e.b)) / 2);
      const ref = e.channel !== undefined ? tAir[e.channel] : e.tRef ?? 25;
      const hm = (e.h! * L * w) / 6;
      K[i].set(i, (K[i].get(i) ?? 0) + 2 * hm);
      K[j].set(j, (K[j].get(j) ?? 0) + 2 * hm);
      K[i].set(j, (K[i].get(j) ?? 0) + hm);
      K[j].set(i, (K[j].get(i) ?? 0) + hm);
      f[i] += (e.h! * ref * L * w) / 2;
      f[j] += (e.h! * ref * L * w) / 2;
    }
    T = solveSPD(K, f, fixed, T);
    // Calor por canal (e total pelas bordas e faces) com o T calculado.
    const pCh = pb.channels.map(() => 0);
    pOut = 0;
    for (const e of edges) {
      if (e.kind !== 'convection' || !(e.h! > 0)) continue;
      const L = Math.hypot(X(e.a) - X(e.b), Y(e.a) - Y(e.b));
      const w = wOf((X(e.a) + X(e.b)) / 2);
      const ref = e.channel !== undefined ? tAir[e.channel] : e.tRef ?? 25;
      const p = e.h! * L * w * ((T[map[e.a]] + T[map[e.b]]) / 2 - ref);
      pOut += p;
      if (e.channel !== undefined) pCh[e.channel] += p;
    }
    if (hf)
      for (let t = 0; t < nt; t++) {
        if (!(pb.k[t] > 0)) continue;
        const v = [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
        const x = v.map(X), y = v.map(Y);
        const A = Math.abs((x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0])) / 2;
        pOut += hf * A * ((T[map[v[0]]] + T[map[v[1]]] + T[map[v[2]]]) / 3 - pb.faces!.t);
      }
    // Ar dos canais: T_ar = T_entrada + P/(2·ṁ·c_p) (média entre entrada e saída).
    let change = 0;
    res = pb.channels.map((c, k) => {
      const P = pCh[k] * scale;
      const mcp = RHO_AIR * c.flow * CP_AIR;
      const tNew = mcp > 0 ? c.tIn + P / (2 * mcp) : c.tIn;
      change = Math.max(change, Math.abs(tNew - tAir[k]));
      // Relaxação leve: o calor que sai depende de T_ar (convergência monótona).
      tAir[k] = 0.5 * tAir[k] + 0.5 * tNew;
      return { tAir: tNew, tOut: mcp > 0 ? c.tIn + P / mcp : c.tIn, power: P };
    });
    if (!pb.channels.length || change < 1e-4) break;
  }
  const out = new Float64Array(nnAll).fill(NaN);
  for (let i = 0; i < nnAll; i++) if (map[i] >= 0) out[i] = T[map[i]];
  return { T: out, channels: res, pIn: pIn * scale, pOut: pOut * scale, iterations };
}

/** Gradiente conjugado com Jacobi; nós com temperatura fixa são eliminados. */
function solveSPD(K: Map<number, number>[], f: Float64Array, fixed: Map<number, number>, x0: Float64Array): Float64Array {
  const n = f.length;
  // CSR com os nós fixos eliminados (linhas e colunas).
  const rowPtr = new Int32Array(n + 1);
  const cols: number[] = [], vals: number[] = [];
  const b = Float64Array.from(f);
  for (let i = 0; i < n; i++) {
    if (fixed.has(i)) {
      cols.push(i);
      vals.push(1);
      b[i] = fixed.get(i)!;
    } else
      for (const [j, v] of K[i]) {
        if (fixed.has(j)) b[i] -= v * fixed.get(j)!;
        else (cols.push(j), vals.push(v));
      }
    rowPtr[i + 1] = cols.length;
  }
  const colA = Int32Array.from(cols), valA = Float64Array.from(vals);
  const diag = new Float64Array(n);
  for (let i = 0; i < n; i++) for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) if (colA[p] === i) diag[i] = valA[p];
  const mul = (v: Float64Array, out: Float64Array) => {
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) s += valA[p] * v[colA[p]];
      out[i] = s;
    }
  };
  const x = Float64Array.from(x0);
  for (const [i, v] of fixed) x[i] = v;
  const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
  mul(x, Ap);
  for (let i = 0; i < n; i++) r[i] = b[i] - Ap[i];
  let bn = 0;
  for (let i = 0; i < n; i++) bn += b[i] * b[i];
  bn = Math.sqrt(bn) || 1;
  for (let i = 0; i < n; i++) (z[i] = r[i] / (diag[i] || 1)), (p[i] = z[i]);
  let rz = 0;
  for (let i = 0; i < n; i++) rz += r[i] * z[i];
  for (let it = 0; it < 20 * n + 100; it++) {
    mul(p, Ap);
    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
    if (!(pAp > 0)) break;
    const alpha = rz / pAp;
    let rn = 0;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
      rn += r[i] * r[i];
    }
    if (Math.sqrt(rn) < 1e-12 * bn) break;
    for (let i = 0; i < n; i++) z[i] = r[i] / (diag[i] || 1);
    let rz2 = 0;
    for (let i = 0; i < n; i++) rz2 += r[i] * z[i];
    const beta = rz2 / rz;
    rz = rz2;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  return x;
}
