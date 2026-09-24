// Documento do sketch: estado atual resolvido, histórico (desfazer/refazer, com código equivalente) e assinantes.
import { T } from '../i18n';
import { constraintCode } from './code';
import { resolveExpressions } from './ops';
import { definedEntities, solve, type DragTarget, type SolveResult } from './solver';
import { emptySketch, type Constraint, type Id, type Sketch } from './types';

const HISTORY_LIMIT = 300;

const acceptable = (r: SolveResult) => r.ok && !r.conflicting.length && !r.redundant.length && !r.degenerate.length;

export interface CommitResult {
  ok: boolean;
  message?: string;
}

/** Um passo do histórico: o estado anterior, o seguinte e o código que leva de um ao outro. */
interface Step {
  before: Sketch;
  after: Sketch;
  code: string[];
}

export class SketchDoc {
  sketch: Sketch = emptySketch();
  dof = 0;
  /** Entidades totalmente definidas (pretas); recalculado a cada mudança, fora do arraste. */
  defined: Set<Id> = new Set();
  private past: Step[] = [];
  private future: Step[] = [];
  private liveBase: Sketch | null = null;
  private listeners = new Set<() => void>();
  /** Incrementa a cada mudança (para o React e para o salvamento automático). */
  version = 0;

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    if (!this.liveBase) {
      try {
        this.defined = definedEntities(this.sketch, this.dof);
      } catch {
        this.defined = new Set();
      }
    }
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  /** Histórico para o painel: passos feitos (ativos) e desfeitos (podem ser refeitos). */
  get history(): { code: string[]; undone: boolean }[] {
    return [
      ...this.past.map((s) => ({ code: s.code, undone: false })),
      ...[...this.future].reverse().map((s) => ({ code: s.code, undone: true })),
    ];
  }

  /** Avalia expressões e resolve; devolve mensagem de erro ou o resultado. */
  private evaluate(next: Sketch): SolveResult | string {
    let withValues: Sketch;
    try {
      withValues = resolveExpressions(next);
    } catch (e) {
      return (e as Error).message;
    }
    const r = solve(withValues);
    if (!r.ok) return T().msg.notConverged;
    if (r.conflicting.length) return T().msg.conflicting;
    if (r.redundant.length) return T().msg.redundant;
    if (r.degenerate.length) return T().msg.degenerate;
    return r;
  }

  /** Resolve `next` e, se consistente, torna-o o estado atual (entra no histórico com `code`). */
  commit(next: Sketch, code: string[]): CommitResult {
    const r = this.evaluate(next);
    if (typeof r === 'string') return { ok: false, message: r };
    this.push(r.sketch, r.dof, code);
    return { ok: true };
  }

  /**
   * Aplica `base` e depois tenta acrescentar cada restrição de `extra` (inferências automáticas),
   * mantendo só as que não geram conflito nem redundância. O código das aceitas vai junto.
   */
  commitWithOptional(base: Sketch, extra: { type: Constraint['type']; refs: Id[]; quiet?: boolean }[], code: string[]): CommitResult {
    let res = this.evaluate(base);
    if (typeof res === 'string') return { ok: false, message: res };
    const lines = [...code];
    for (const c of extra) {
      const cur: Sketch = res.sketch;
      const k: Constraint = { id: `k${cur.nextId}`, type: c.type, refs: c.refs };
      const r = solve({ ...cur, constraints: [...cur.constraints, k], nextId: cur.nextId + 1 });
      if (acceptable(r)) {
        res = r;
        // As silenciosas estão implícitas no comando (ex.: H/V de g.rectangle).
        if (!c.quiet) lines.push(constraintCode(k));
      }
    }
    this.push(res.sketch, res.dof, lines);
    return { ok: true };
  }

  private push(sk: Sketch, dof: number, code: string[]) {
    const before = this.liveBase ?? this.sketch;
    this.past.push({ before, after: sk, code });
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.liveBase = null;
    this.sketch = sk;
    this.dof = dof;
    this.emit();
  }

  /** Estado de antes do arraste em andamento (ou o atual, fora de arraste). */
  get base(): Sketch {
    return this.liveBase ?? this.sketch;
  }

  /** Início de um arraste: as mudanças seguintes não entram no histórico até `endLive`. */
  beginLive() {
    this.liveBase = this.sketch;
  }

  /** Arraste: resolve com restrições temporárias puxando os pontos para o cursor. */
  live(drag: DragTarget[], next: Sketch = this.liveBase ?? this.sketch, free: Set<string> = new Set()) {
    const r = solve(next, drag, free);
    if (!r.ok) return;
    this.sketch = r.sketch;
    this.emit();
  }

  /** Troca o estado sem resolver nem registrar histórico (ex.: mover o texto de uma cota). */
  patch(sk: Sketch) {
    this.sketch = sk;
    this.emit();
  }

  /** Fim do arraste; `code` descreve o movimento. */
  endLive(code: string[]) {
    const base = this.liveBase;
    this.liveBase = null;
    if (!base || base === this.sketch) return;
    // Resolve de novo sem as restrições temporárias para obter um estado consistente e o DOF.
    const r = solve(this.sketch);
    const after = r.ok ? r.sketch : this.sketch;
    this.past.push({ before: base, after, code });
    this.future = [];
    this.sketch = after;
    if (r.ok) this.dof = r.dof;
    this.emit();
  }

  undo() {
    const step = this.past.pop();
    if (!step) return;
    this.future.push({ ...step, after: this.sketch });
    this.setResolved(step.before);
  }

  redo() {
    const step = this.future.pop();
    if (!step) return;
    this.past.push({ ...step, before: this.sketch });
    this.setResolved(step.after);
  }

  /** Substitui o documento (abrir arquivo / novo). Entra no histórico para poder desfazer. */
  load(sk: Sketch, code: string[]) {
    let s = sk;
    try {
      s = resolveExpressions(sk);
    } catch {
      // Abre mesmo com expressão inválida; o painel de variáveis mostra o erro.
    }
    const r = solve(s);
    this.push(r.ok ? r.sketch : s, r.dof, code);
  }

  /** Carrega sem histórico (inicialização a partir do rascunho). */
  reset(sk: Sketch) {
    this.past = [];
    this.future = [];
    this.setResolved(sk);
  }

  private setResolved(sk: Sketch) {
    const r = solve(sk);
    this.sketch = r.ok ? r.sketch : sk;
    this.dof = r.dof;
    this.emit();
  }
}
