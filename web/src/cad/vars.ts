// Operações sobre a tabela de variáveis do projeto.
import { T } from '../i18n';
import { identifiers, isValidName, normalizeNumber, parseExpr } from './expr';
import type { Sketch } from './types';

const uses = (expr: string | undefined, name: string) => {
  if (!expr) return false;
  try {
    return identifiers(parseExpr(normalizeNumber(expr))).has(name);
  } catch {
    return new RegExp(`\\b${name}\\b`).test(expr);
  }
};

/** Onde a variável é usada (outras variáveis, cotas, configurações). */
export function usagesOf(sk: Sketch, name: string): string[] {
  const out: string[] = [];
  for (const v of sk.variables) if (v.name !== name && uses(v.expr, name)) out.push(v.name);
  for (const c of sk.constraints) if (uses(c.expr, name)) out.push(c.id);
  if (uses(sk.settings.depth, name)) out.push('depth');
  for (const n of sk.nodes)
    if (n.kind === 'physics') for (const k of ['frequency', 'dt', 'tEnd'] as const) if (uses(n[k], name)) out.push(`${n.name}.${k}`);
  return out;
}

export function nextVarName(sk: Sketch) {
  for (let i = 1; ; i++) {
    const n = `v${i}`;
    if (!sk.variables.some((v) => v.name === n)) return n;
  }
}

export function setVariable(sk: Sketch, name: string, expr: string): Sketch {
  if (!isValidName(name)) throw new Error(T().expr.badName);
  const exists = sk.variables.some((v) => v.name === name);
  const variables = exists ? sk.variables.map((v) => (v.name === name ? { name, expr } : v)) : [...sk.variables, { name, expr }];
  return { ...sk, variables };
}

export function deleteVariable(sk: Sketch, name: string): Sketch {
  const used = usagesOf(sk, name);
  if (used.length) throw new Error(T().expr.inUse(name, used.join(', ')));
  return { ...sk, variables: sk.variables.filter((v) => v.name !== name) };
}

/** Renomeia e atualiza todas as expressões que usam a variável. */
export function renameVariable(sk: Sketch, from: string, to: string): Sketch {
  if (from === to) return sk;
  if (!isValidName(to)) throw new Error(T().expr.badName);
  if (sk.variables.some((v) => v.name === to)) throw new Error(T().expr.exists(to));
  const re = new RegExp(`\\b${from}\\b`, 'g');
  const sub = (e: string) => (uses(e, from) ? e.replace(re, to) : e);
  const st = sk.settings;
  return {
    ...sk,
    variables: sk.variables.map((v) => ({ name: v.name === from ? to : v.name, expr: sub(v.expr) })),
    constraints: sk.constraints.map((c) => (c.expr ? { ...c, expr: sub(c.expr) } : c)),
    settings: { ...st, depth: sub(st.depth) },
    nodes: sk.nodes.map((n) => (n.kind === 'physics' ? { ...n, frequency: sub(n.frequency), dt: sub(n.dt), tEnd: sub(n.tEnd) } : n)),
  };
}
