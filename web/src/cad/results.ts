// Variáveis de resultado (integrais e circuitos das tabelas) e fórmulas do usuário sobre elas.
import { T } from '../i18n';
import { evaluate, evaluateVariables, type Q } from './expr';
import { findRegion, type Arrangement } from './regions';
import { circuitResults, depthOf, lineIntegrals, MU0, surfaceIntegrals, type Solution } from './solve';
import type { Id, PostNode, Sketch } from './types';

const num = (v: number): Q => ({ v, L: 0, A: 0 });
/** Nome válido de variável a partir de um texto (espaços e acentos viram _). */
export const safeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1');

/** Prefixo padrão de um item: S1, S2… (superfície), L1… (linha), F1… (fórmula). */
export function defaultVarName(sk: Sketch, it: PostNode): string {
  const letter = it.item === 'surfint' ? 'S' : it.item === 'lineint' ? 'L' : it.item === 'formula' ? 'F' : 'C';
  const same = sk.nodes.filter((n) => n.kind === 'post' && n.item === it.item);
  return `${letter}${same.findIndex((n) => n.id === it.id) + 1}`;
}
export const varNameOf = (sk: Sketch, it: PostNode) => (it.varName?.trim() ? safeName(it.varName.trim()) : defaultVarName(sk, it));

/** Grandezas de cada tipo de integral: chave, rótulo e unidade (SI). */
export const SURF_Q = [
  { q: 'area', unit: 'm²' },
  { q: 'volume', unit: 'm³' },
  { q: 'intA', unit: 'Wb·m' },
  { q: 'current', unit: 'A' },
  { q: 'energy', unit: 'J' },
  { q: 'bavg', unit: 'T' },
  { q: 'b2', unit: 'T²·m³' },
  { q: 'loss', unit: 'W' },
  { q: 'ironLoss', unit: 'W' },
  { q: 'fx', unit: 'N' },
  { q: 'fy', unit: 'N' },
  { q: 'torque', unit: 'N·m' },
] as const;
export const LINE_Q = [
  { q: 'length', unit: 'm' },
  { q: 'flux', unit: 'Wb' },
  { q: 'mmf', unit: 'A' },
  { q: 'intB', unit: 'T·m' },
  { q: 'intBn', unit: 'T·m' },
  { q: 'bavg', unit: 'T' },
  { q: 'fx', unit: 'N' },
  { q: 'fy', unit: 'N' },
  { q: 'torque', unit: 'N·m' },
] as const;

/** Saídas escolhidas de um item (padrão: todas, com nome prefixo_grandeza). */
export function outputsOf(sk: Sketch, it: PostNode): { q: string; name: string }[] {
  if (it.outputs) return it.outputs;
  const p = varNameOf(sk, it);
  const list = it.item === 'surfint' ? SURF_Q : it.item === 'lineint' ? LINE_Q : [];
  return list.map((x) => ({ q: x.q, name: `${p}_${x.q}` }));
}

export interface ResultVars {
  /** Variáveis de resultado (SI, sem dimensão) + as do projeto. */
  env: Map<string, Q>;
  /** Só as de resultado, com descrição (para a lista na interface). */
  list: { name: string; value: number; unit: string }[];
  /** Valor de cada fórmula (id → valor ou erro). */
  formulas: Map<Id, { value?: number; error?: string }>;
}

/** Calcula todas as variáveis de resultado de uma física, na ordem da árvore (fórmulas veem as anteriores). */
export function resultVars(sk: Sketch, arr: Arrangement, sol: Solution, physics: Id): ResultVars {
  const { values } = evaluateVariables(sk.variables, sk.settings.unit);
  const env = new Map<string, Q>(values);
  const list: ResultVars['list'] = [];
  const add = (name: string, v: number, unit: string) => {
    env.set(name, num(v));
    list.push({ name, value: v, unit });
  };
  add('depth_m', depthOf(sk), 'm');
  env.set('mu0', num(MU0));
  for (const c of circuitResults(sk, arr, sol)) {
    const p = safeName(c.name);
    add(`${p}_I`, c.I, 'A');
    add(`${p}_lambda`, c.lambda, 'Wb');
    if (c.L !== null) add(`${p}_L`, c.L, 'H');
    if (c.R !== null) add(`${p}_R`, c.R, 'Ω');
  }
  const formulas = new Map<Id, { value?: number; error?: string }>();
  const tables = new Set(sk.nodes.filter((n) => n.kind === 'table' && n.physics === physics).map((n) => n.id));
  for (const it of sk.nodes) {
    if (it.kind !== 'post' || !it.item || !it.view || !tables.has(it.view)) continue;
    const p = varNameOf(sk, it);
    if (it.item === 'surfint' || it.item === 'lineint') {
      let vals: Record<string, number> | null = null;
      if (it.item === 'surfint') {
        const set = new Set<number>();
        for (const k of it.regions ?? []) {
          const r = findRegion(arr, k);
          if (r) set.add(r.index);
        }
        if (!set.size) continue;
        const si = surfaceIntegrals(sol, sk, set);
        vals = { area: si.area, volume: si.volume, intA: si.intA, current: si.current, energy: si.energy, bavg: si.bAvg, b2: si.b2, loss: si.loss, ironLoss: si.ironLoss, fx: si.fx, fy: si.fy, torque: si.torque };
      } else if (it.curve) {
        const li = lineIntegrals(sol, sk, it.curve);
        if (li) vals = { length: li.length * 1e-3, flux: li.flux, mmf: li.mmf, intB: li.intB, intBn: li.intBn, bavg: li.bAvg, fx: li.fx, fy: li.fy, torque: li.torque };
      }
      if (!vals) continue;
      const units = new Map<string, string>([...SURF_Q, ...LINE_Q].map((x) => [x.q, x.unit]));
      for (const o of outputsOf(sk, it)) if (vals[o.q] !== undefined && o.name) add(safeName(o.name), vals[o.q], units.get(o.q) ?? '');
    } else if (it.item === 'formula') {
      if (!it.expr?.trim()) {
        formulas.set(it.id, { error: T().table.noExpr });
        continue;
      }
      try {
        const q = evaluate(it.expr, { env, unit: sk.settings.unit });
        formulas.set(it.id, { value: q.v });
        add(p, q.v, it.unitLabel ?? '');
      } catch (e) {
        formulas.set(it.id, { error: (e as Error).message });
      }
    }
  }
  return { env, list, formulas };
}
