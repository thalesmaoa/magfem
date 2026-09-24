import { beforeAll, describe, expect, test } from 'vitest';
import { setLang } from '../i18n';
import { constraintCode, creationCode } from './code';
import { SketchDoc } from './doc';
import { evaluate, evaluateVariables, formatQ, isConstant } from './expr';
import { pt } from './geometry';
import { angleSectorAt, measure } from './measure';
import { constraintsFor, createGroup, deleteItems, Draft, expandSelection, mergePoints, parseDimensionInput, resolveExpressions, selectionPoints, transformPoints } from './ops';
import { initSolver, solve } from './solver';
import { emptySketch, ORIGIN_ID, type PointEnt, type Sketch } from './types';
import { deleteVariable, renameVariable, setVariable, usagesOf } from './vars';

beforeAll(async () => {
  setLang('pt');
  await initSolver();
});

const ctx = (unit: 'mm' | 'cm' = 'mm') => ({ env: new Map(), unit });

describe('expressões', () => {
  test('unidades de comprimento e ângulo', () => {
    expect(evaluate('2 cm', ctx()).v).toBe(20);
    expect(evaluate('2cm + 5 mm', ctx()).v).toBe(25);
    expect(evaluate('1 in', ctx()).v).toBeCloseTo(25.4);
    expect(evaluate('30°', ctx()).A).toBe(1);
    expect(evaluate('2*sin(30 deg)', ctx()).v).toBeCloseTo(1);
    expect(evaluate('12,5', ctx()).v).toBe(12.5);
    // Estilo planilha e funções.
    expect(evaluate('=1+1', ctx()).v).toBe(2);
    expect(evaluate('= abs(-3) + sqrt(16) + pow(2, 3) + exp(0) + ln(1) + log10(100)', ctx()).v).toBe(18);
    expect(evaluate('sqrt(4 mm * 9 mm)', ctx())).toEqual({ v: 6, L: 1, A: 0 });
  });
  test('número puro somado a comprimento usa a unidade de exibição', () => {
    expect(evaluate('10 mm + 1', ctx('cm')).v).toBe(20);
  });
  test('erros legíveis', () => {
    expect(() => evaluate('10 mm + 5 deg', ctx())).toThrow('unidades diferentes');
    expect(() => evaluate('x + 1', ctx())).toThrow('"x" não definida');
    expect(() => evaluate('(1 + 2', ctx())).toThrow('Esperado ")"');
  });
  test('variáveis em ordem de dependência e ciclo', () => {
    const { values, errors } = evaluateVariables(
      [
        { name: 'Dr', expr: 'Ds - 2*g' },
        { name: 'Ds', expr: '100 mm' },
        { name: 'g', expr: '0.5 mm' },
        { name: 'a', expr: 'b' },
        { name: 'b', expr: 'a' },
      ],
      'mm',
    );
    expect(values.get('Dr')!.v).toBe(99);
    expect(formatQ(values.get('Dr')!, 'mm')).toBe('99 mm');
    expect(errors.get('a')).toMatch(/circular|erro/);
    expect(isConstant('2 cm + 3 mm')).toBe(true);
    expect(isConstant('Ds/2')).toBe(false);
  });
});

function lineSketch(): { sk: Sketch; l: string; p: string } {
  const d = new Draft(emptySketch());
  const p = d.addPoint(30, 0);
  const l = d.addLine(ORIGIN_ID, p);
  return { sk: d.sk, l, p };
}

describe('cotas com variáveis', () => {
  test('cota ligada a variável acompanha a mudança da variável', () => {
    const doc = new SketchDoc();
    let { sk, l, p } = lineSketch();
    sk = setVariable(sk, 'L', '40 mm');
    const d = new Draft(sk);
    d.addConstraint('horizontal', [l]);
    const k = d.addConstraint('distance', [l], { value: 30, expr: 'L' });
    expect(doc.commit(d.sk, []).ok).toBe(true);
    expect(pt(doc.sketch, p).x).toBeCloseTo(40, 6);
    expect(doc.commit(setVariable(doc.sketch, 'L', '2 cm + 5 mm'), []).ok).toBe(true);
    expect(pt(doc.sketch, p).x).toBeCloseTo(25, 6);
    // Renomear atualiza a expressão da cota; apagar variável em uso é bloqueado.
    const renamed = renameVariable(doc.sketch, 'L', 'comprimento');
    expect(renamed.constraints.find((c) => c.id === k)!.expr).toBe('comprimento');
    expect(usagesOf(renamed, 'comprimento')).toEqual([k]);
    expect(() => deleteVariable(renamed, 'comprimento')).toThrow('em uso');
    // Variável inválida: commit recusa com mensagem.
    const bad = doc.commit(setVariable(doc.sketch, 'L', '-5 mm'), []);
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/positivo/);
  });
  test('texto digitado: número vira valor; com variável vira expressão', () => {
    let { sk, l } = lineSketch();
    sk = setVariable(sk, 'g', '1 mm');
    const c = { id: 'k', type: 'distance' as const, refs: [l] };
    expect(parseDimensionInput(sk, c, '12,5')).toEqual({ value: 12.5 });
    expect(parseDimensionInput(sk, c, '2 cm')).toEqual({ value: 20 });
    expect(parseDimensionInput(sk, c, 'g*3')).toEqual({ value: 3, expr: 'g*3' });
    expect(() => parseDimensionInput(sk, { ...c, type: 'angle' }, '10 mm')).toThrow('ângulo');
  });
  test('resolveExpressions recalcula valores', () => {
    let { sk, l } = lineSketch();
    sk = setVariable(sk, 'a', '7 mm');
    sk = { ...sk, constraints: [{ id: 'k1', type: 'distance', refs: [l], value: 1, expr: 'a*2' }] };
    expect(resolveExpressions(sk).constraints[0].value).toBe(14);
  });
});

describe('cota de ângulo por setor', () => {
  test('mede o setor onde o texto está e o solver respeita o setor', () => {
    // Duas retas unidas em (0,0): l1 para a esquerda-baixo, l2 para baixo (como no teste do usuário).
    const d = new Draft(emptySketch());
    const a = d.addPoint(-40, -30);
    const l1 = d.addLine(a, ORIGIN_ID); // direção p1→p2 aponta para o vértice
    const b = d.addPoint(0, -50);
    const l2 = d.addLine(ORIGIN_ID, b);
    d.addConstraint('vertical', [l2]);
    const sk0 = solve(d.sk).sketch;
    // Texto entre as duas retas (abaixo-esquerda do vértice): setor agudo.
    const f = angleSectorAt(sk0, l1, l2, { x: -5, y: -20 });
    const c = { id: 'k', type: 'angle' as const, refs: [l1, l2], flip: f };
    const acute = measure(sk0, c);
    expect(acute).toBeCloseTo((Math.atan2(40, 30) * 180) / Math.PI, 6); // ≈ 53,13°
    const dd = new Draft(sk0);
    dd.addConstraint('angle', [l1, l2], { value: 30, flip: f });
    const r = solve(dd.sk);
    expect(r.ok).toBe(true);
    const A = pt(r.sketch, a);
    expect((Math.atan2(-A.x, -A.y) * 180) / Math.PI).toBeCloseTo(30, 6); // 30° a partir da vertical, mesmo lado
    expect(A.x).toBeLessThan(0);
  });
});

describe('fundir pontos, grupos e transformações', () => {
  test('arrastar a ponta de uma linha sobre a origem une os pontos', () => {
    const d = new Draft(emptySketch());
    const a = d.addPoint(5, 5);
    const b = d.addPoint(20, 5);
    const l = d.addLine(a, b);
    d.addConstraint('horizontal', [l]);
    const merged = mergePoints(d.sk, a, ORIGIN_ID)!;
    expect(merged.entities[a]).toBeUndefined();
    expect((merged.entities[l] as { p1: string }).p1).toBe(ORIGIN_ID);
    const r = solve(merged);
    expect(r.ok).toBe(true);
    expect(pt(r.sketch, b).y).toBeCloseTo(0, 9);
    // Não une as duas pontas da mesma linha.
    expect(mergePoints(d.sk, a, b)).toBeNull();
  });
  test('grupo: membros, pontos, apagar grupo apaga membros', () => {
    const d = new Draft(emptySketch());
    const c = d.addPoint(10, 10);
    const circ = d.addCircle(c, 3);
    const p = d.addPoint(0, 20);
    const l = d.addLine(ORIGIN_ID, p);
    const g = createGroup(d.sk, [circ, l], 'bobina')!;
    expect(expandSelection(g.sketch, [g.id]).sort()).toEqual([circ, l].sort());
    expect(selectionPoints(g.sketch, [g.id]).sort()).toEqual([ORIGIN_ID, c, p].sort());
    const del = deleteItems(g.sketch, [g.id]);
    expect(del.entities[circ]).toBeUndefined();
    expect(del.groups).toHaveLength(0);
    expect(del.entities[ORIGIN_ID]).toBeDefined();
  });
  test('girar 90° em torno da origem e transladar', () => {
    const d = new Draft(emptySketch());
    const p = d.addPoint(10, 0);
    const out = transformPoints(d.sk, [p, ORIGIN_ID], { dx: 1, dy: 2, angle: 90, pivot: { x: 0, y: 0 } });
    expect(pt(out, p).x).toBeCloseTo(1, 9);
    expect(pt(out, p).y).toBeCloseTo(12, 9);
    expect(pt(out, ORIGIN_ID).x).toBe(0); // origem fixa não move
  });
});

describe('código do histórico', () => {
  test('criação e restrições viram comandos da API', () => {
    const before = emptySketch();
    const d = new Draft(before);
    const p = d.addPoint(40, 0);
    const l = d.addLine(ORIGIN_ID, p);
    expect(creationCode(before, d.sk)).toEqual([`${l} = g.line("O", (40, 0))  # cria ${p}`]);
    expect(constraintCode({ id: 'k1', type: 'distance', refs: [l], value: 50 })).toBe(`g.distance("${l}", "50 mm")`);
    expect(constraintCode({ id: 'k1', type: 'angle', refs: ['l1', 'l2'], value: 30, expr: 'alfa' })).toBe('g.angle("l1", "l2", "alfa")');
  });
  test('o histórico do documento acompanha desfazer/refazer', () => {
    const doc = new SketchDoc();
    const { sk } = lineSketch();
    doc.commit(sk, ['a']);
    doc.commit({ ...doc.sketch }, ['b']);
    doc.undo();
    expect(doc.history).toEqual([
      { code: ['a'], undone: false },
      { code: ['b'], undone: true },
    ]);
  });
});

describe('entidades definidas', () => {
  test('retângulo cotado na origem fica definido; linha solta não', async () => {
    const { definedEntities } = await import('./solver');
    const d = new Draft(emptySketch());
    const b = d.addPoint(40, 0);
    const c = d.addPoint(40, 20);
    const e = d.addPoint(0, 20);
    const l1 = d.addLine(ORIGIN_ID, b);
    const l2 = d.addLine(b, c);
    const l3 = d.addLine(c, e);
    const l4 = d.addLine(e, ORIGIN_ID);
    d.addConstraint('horizontal', [l1]);
    d.addConstraint('vertical', [l2]);
    d.addConstraint('horizontal', [l3]);
    d.addConstraint('vertical', [l4]);
    d.addConstraint('distance', [l1], { value: 40 });
    d.addConstraint('distance', [l2], { value: 20 });
    const q1 = d.addPoint(-30, -30);
    const q2 = d.addPoint(-10, -30);
    const free = d.addLine(q1, q2);
    d.addConstraint('horizontal', [free]);
    const r = solve(d.sk);
    expect(r.dof).toBe(3);
    const def = definedEntities(r.sketch, r.dof);
    for (const id of [l1, l2, l3, l4, b, c, e, ORIGIN_ID]) expect(def.has(id)).toBe(true);
    for (const id of [free, q1, q2]) expect(def.has(id)).toBe(false);
  });
});

describe('soltar da origem', () => {
  test('retângulo preso à origem passa a ter canto próprio e continua fechado', async () => {
    const { detachFromPoint, curvesUsing, fixedPointsOf } = await import('./ops');
    const d = new Draft(emptySketch());
    const b = d.addPoint(40, 0);
    const c = d.addPoint(40, 20);
    const e = d.addPoint(0, 20);
    const ls = [d.addLine(ORIGIN_ID, b), d.addLine(b, c), d.addLine(c, e), d.addLine(e, ORIGIN_ID)];
    expect(fixedPointsOf(d.sk, ls)).toEqual([ORIGIN_ID]);
    const r = detachFromPoint(d.sk, ORIGIN_ID, curvesUsing(d.sk, ORIGIN_ID))!;
    const sk = r.sketch;
    expect(curvesUsing(sk, ORIGIN_ID)).toEqual([]);
    expect(curvesUsing(sk, r.newId).sort()).toEqual([ls[0], ls[3]].sort());
    expect(fixedPointsOf(sk, ls)).toEqual([]);
    const moved = solve(sk, [{ pointId: r.newId, x: 10, y: 10 }]);
    expect(pt(moved.sketch, r.newId).x).toBeCloseTo(10, 3);
  });
});

describe('medições', () => {
  test('distância mínima: ponto-linha, linha-linha, círculo-linha, cruzando = 0', async () => {
    const { minDistance } = await import('./inspect');
    const d = new Draft(emptySketch());
    const a = d.addPoint(0, 0);
    const b = d.addPoint(10, 0);
    const l1 = d.addLine(a, b);
    const c = d.addPoint(5, 7);
    const e = d.addPoint(20, 3);
    const f = d.addPoint(20, 9);
    const l2 = d.addLine(e, f);
    const cc = d.addPoint(5, 20);
    const circ = d.addCircle(cc, 4);
    const g = d.addPoint(5, -5);
    const h = d.addPoint(5, 5);
    const l3 = d.addLine(g, h); // cruza l1
    const sk = d.sk;
    expect(minDistance(sk, c, l1)!.d).toBeCloseTo(7, 9);
    expect(minDistance(sk, l1, l2)!.d).toBeCloseTo(Math.hypot(10, 3), 9);
    expect(minDistance(sk, circ, l1)!.d).toBeCloseTo(16, 7);
    expect(minDistance(sk, l1, l3)!.d).toBe(0);
  });
  test('área e perímetro: retângulo, círculo, retângulo com canto arredondado', async () => {
    const { loopArea } = await import('./inspect');
    const d = new Draft(emptySketch());
    const p = [d.addPoint(0, 0), d.addPoint(40, 0), d.addPoint(40, 20), d.addPoint(0, 20)];
    const rect = [d.addLine(p[0], p[1]), d.addLine(p[1], p[2]), d.addLine(p[2], p[3]), d.addLine(p[3], p[0])];
    const c = d.addCircle(d.addPoint(100, 0), 5);
    // "D": linha vertical + semicírculo à direita (raio 10, centro (200,0)).
    const q1 = d.addPoint(200, -10);
    const q2 = d.addPoint(200, 10);
    const qc = d.addPoint(200, 0);
    const dl = d.addLine(q2, q1);
    const da = d.addArc(qc, q1, q2, 10); // anti-horário de -90° a 90° (lado direito)
    const sk = d.sk;
    expect(loopArea(sk, rect)).toEqual({ area: 800, perimeter: 120 });
    const ca = loopArea(sk, [c])!;
    expect(ca.area).toBeCloseTo(Math.PI * 25, 9);
    const D = loopArea(sk, [dl, da])!;
    expect(D.area).toBeCloseTo((Math.PI * 100) / 2, 9);
    expect(D.perimeter).toBeCloseTo(20 + Math.PI * 10, 9);
    expect(loopArea(sk, rect.slice(0, 3))).toBeNull(); // aberto
  });
});

describe('nomes e getid', () => {
  test('getid resgata o id pelo nome; nomes são únicos', async () => {
    const { getId, renameEntity } = await import('./ops');
    const d = new Draft(emptySketch());
    const a = d.addPoint(0, 5);
    const b = d.addPoint(10, 5);
    const l = d.addLine(a, b);
    const l2 = d.addLine(ORIGIN_ID, b);
    const sk = renameEntity(d.sk, l, 'kru1');
    expect(getId(sk, 'kru1')).toBe(l);
    expect(getId(sk, l)).toBe(l); // o próprio id também vale
    expect(getId(sk, 'nada')).toBeNull();
    expect(() => renameEntity(sk, l2, 'kru1')).toThrow('já está em uso');
    expect(() => renameEntity(sk, l2, l)).toThrow('já está em uso'); // não pode usar o id de outro
  });
});

describe('console', () => {
  test('help imprime texto; getID em qualquer grafia; nomes sem aspas', async () => {
    const { CommandConsole } = await import('./console');
    const doc = new SketchDoc();
    doc.reset(emptySketch());
    const c = new CommandConsole({ doc });
    const h = c.run('help()');
    expect(h.ok).toBe(true);
    expect(h.out!.startsWith('"')).toBe(false);
    expect(h.out).toContain('\n');
    expect(c.run('l = s.line((0, 0), (10, 0))').ok).toBe(true);
    expect(c.run('s.rename(l, "kru1")').ok).toBe(true);
    const id = Object.values(doc.sketch.entities).find((e) => e.type === 'line')!.id;
    for (const cmd of ['getid("kru1")', 'getID(kru1)', 'getId("kru1")', 's.getid(kru1)']) expect(c.run(cmd)).toEqual({ ok: true, out: `"${id}"` });
    expect(c.run('foo()').ok).toBe(false);
  });
  test('autocompletar: métodos, nomes entre aspas e funções', async () => {
    const { CommandConsole, completions } = await import('./console');
    const doc = new SketchDoc();
    doc.reset(emptySketch());
    const c = new CommandConsole({ doc });
    c.run('l = s.line((0, 0), (10, 0))');
    c.run('s.rename(l, "kru1")');
    const m = completions(doc.sketch, c.env, 'g.rec');
    expect(m.items.map((i) => i.label)).toEqual(['rectangle', 'rectangle_center']);
    expect(m.start).toBe(2);
    const q = completions(doc.sketch, c.env, 'getid("kr');
    expect(q.items.map((i) => i.insert)).toEqual(['kru1']);
    const g = completions(doc.sketch, c.env, 'get');
    expect(g.items.map((i) => i.label)).toContain('getid');
    expect(completions(doc.sketch, c.env, 'l').items.map((i) => i.label)).toContain('l');
    // Sem "s." também funciona (e o Tab sugere).
    expect(completions(doc.sketch, c.env, 'circ').items.map((i) => i.label)).toContain('circle');
    expect(c.run('circle((30, 0), r=4)').ok).toBe(true);
    expect(Object.values(doc.sketch.entities).some((e) => e.type === 'circle')).toBe(true);
  });
});

describe('offset', () => {
  test('retângulo para fora, círculo, cadeia aberta e contorno com arco', async () => {
    const { offsetCurves } = await import('./offset');
    const d = new Draft(emptySketch());
    const p = [d.addPoint(0, 0), d.addPoint(40, 0), d.addPoint(40, 20), d.addPoint(0, 20)];
    // Sentido horário de propósito: o "para fora" não pode depender do sentido.
    const rect = [d.addLine(p[0], p[3]), d.addLine(p[3], p[2]), d.addLine(p[2], p[1]), d.addLine(p[1], p[0])];
    const circ = d.addCircle(d.addPoint(100, 0), 5);
    const r1 = offsetCurves(d.sk, rect, 2);
    const visLines = (sk2: Sketch, ids: string[]) => ids.filter((id) => sk2.entities[id].type === 'line' && !(sk2.entities[id] as { aux?: boolean }).aux && !(sk2.entities[id] as { construction?: boolean }).construction);
    const pts = visLines(r1.sketch, r1.created).flatMap((id) => {
      const l = r1.sketch.entities[id] as { p1: string };
      return [pt(r1.sketch, l.p1)];
    });
    const xs = pts.map((q) => Math.round(q.x * 1e9) / 1e9).sort((a, b) => a - b);
    const ys = pts.map((q) => Math.round(q.y * 1e9) / 1e9).sort((a, b) => a - b);
    expect([xs[0], xs[3], ys[0], ys[3]]).toEqual([-2, 42, -2, 22]);
    expect(r1.sketch.groups.find((g) => g.id === r1.groupId)!.members).toEqual(r1.created);
    // Para dentro.
    const r2 = offsetCurves(d.sk, rect, -3);
    const in2 = visLines(r2.sketch, r2.created).map((id) => pt(r2.sketch, (r2.sketch.entities[id] as { p1: string }).p1));
    expect(Math.min(...in2.map((q) => q.x))).toBeCloseTo(3, 9);
    expect(Math.max(...in2.map((q) => q.y))).toBeCloseTo(17, 9);
    // Círculo: raio + d, mesmo centro.
    const rc = offsetCurves(d.sk, [circ], 1.5);
    const c2 = rc.sketch.entities[rc.created[0]] as { r: number; c: string };
    expect(c2.r).toBe(6.5);
    expect(c2.c).toBe((d.sk.entities[circ] as { c: string }).c);
    // "D" (linha + semicírculo): área do offset externo confere.
    const q1 = d.addPoint(200, -10);
    const q2 = d.addPoint(200, 10);
    const qc = d.addPoint(200, 0);
    const dl = d.addLine(q2, q1);
    const da = d.addArc(qc, q1, q2, 10);
    const rd = offsetCurves(d.sk, [dl, da], 1);
    const { loopArea } = await import('./inspect');
    // Linha em x=199 cortando o círculo r=11 (centro x=200): meio círculo + faixa x∈[199, 200].
    const r = 11;
    expect(loopArea(rd.sketch, rd.created)!.area).toBeCloseTo((Math.PI * r * r) / 2 + Math.sqrt(r * r - 1) + r * r * Math.asin(1 / r), 6);
    expect(() => offsetCurves(d.sk, [circ], -5)).toThrow();
  });
});

describe('espelhar e padrões', () => {
  test('espelho no eixo Y inverte arcos e mantém a forma; padrões linear e circular', async () => {
    const { mirrorEntities, linearArray, circularArray } = await import('./patterns');
    const d = new Draft(emptySketch());
    const a = d.addPoint(10, 0);
    const b = d.addPoint(20, 0);
    const l = d.addLine(a, b);
    d.addConstraint('horizontal', [l]);
    d.addConstraint('distance', [l], { value: 10 });
    const c = d.addPoint(30, 0);
    const s1 = d.addPoint(35, 0);
    const e1 = d.addPoint(30, 5);
    const arc = d.addArc(c, s1, e1, 5); // quarto de círculo anti-horário (1º quadrante)
    let sk = solve(d.sk).sketch;
    const m = mirrorEntities(sk, [l, arc], 'y');
    const ml = m.sketch.entities[m.created[0]] as { p1: string; p2: string };
    expect(pt(m.sketch, ml.p1).x).toBeCloseTo(-10, 9);
    // Ponto sobre o eixo é compartilhado (a metade espelhada fica ligada à original).
    const d2 = new Draft(emptySketch());
    const top = d2.addPoint(0, 5);
    const half = d2.addLine(top, d2.addPoint(10, 5));
    const m2 = mirrorEntities(d2.sk, [half], 'y');
    expect((m2.sketch.entities[m2.created[0]] as { p1: string }).p1).toBe(top);
    // Associativo: cada ponto da cópia é simétrico ao original (sem copiar restrições internas).
    expect(m.sketch.constraints.filter((k) => k.type === 'symmetric').length).toBe(5); // a, b, c, s1, e1
    const dofBefore = solve(sk).dof;
    expect(solve(m.sketch).dof).toBe(dofBefore);
    const ma = m.sketch.entities[m.created[1]] as { s: string; e: string };
    // Espelhado: continua anti-horário (2º quadrante) de (-30,5) até (-35,0).
    expect(pt(m.sketch, ma.s)).toMatchObject({ x: -30, y: 5 });
    expect(pt(m.sketch, ma.e)).toMatchObject({ x: -35, y: 0 });
    const rs = solve(m.sketch);
    expect(rs.ok && !rs.conflicting.length).toBe(true);
    // Arrastar o original move o espelho.
    const moved = solve(m.sketch, [{ pointId: a, x: 12, y: 3 }]);
    expect(pt(moved.sketch, ml.p1).x).toBeCloseTo(-12, 3);
    expect(pt(moved.sketch, ml.p1).y).toBeCloseTo(3, 3);
    // Padrão linear 3×2: 5 cópias da linha, presas à origem (o DOF não aumenta).
    const dofL = solve(sk).dof;
    const la = linearArray(sk, [l], 3, 2, 30, 15);
    expect(la.created).toHaveLength(5);
    const rl = solve(la.sketch);
    expect(rl.ok && !rl.redundant.length && !rl.conflicting.length).toBe(true);
    expect(rl.dof).toBe(dofL);
    const xs = la.created.map((id) => pt(la.sketch, (la.sketch.entities[id] as { p1: string }).p1));
    expect(xs.map((p) => [p.x, p.y])).toContainEqual([70, 15]);
    // Mover a origem leva as cópias junto.
    const movedL = solve(la.sketch, [{ pointId: a, x: 12, y: 1 }]);
    const lastCopy = la.created[la.created.length - 1];
    expect(pt(movedL.sketch, (movedL.sketch.entities[lastCopy] as { p1: string }).p1).x).toBeCloseTo(72, 3);
    // Editar passo e quantidade.
    const { setPattern } = await import('./patterns');
    const ed1 = solve(setPattern(la.sketch, la.groupId, { dx: 50 }));
    expect(ed1.ok).toBe(true);
    const g1 = ed1.sketch.groups.find((g) => g.id === la.groupId)!;
    const firstCopy = g1.members.find((id) => ed1.sketch.entities[id]?.type === 'line')!;
    expect(pt(ed1.sketch, (ed1.sketch.entities[firstCopy] as { p1: string }).p1).x).toBeCloseTo(60, 6);
    const e2 = setPattern(ed1.sketch, la.groupId, { nx: 4 });
    expect(e2.groups.find((g) => g.id === la.groupId)!.members.filter((id) => e2.entities[id]?.type === 'line')).toHaveLength(7);
    // Padrão circular de 4 em 360° em torno da origem: cópias a 90°, 180°, 270°.
    sk = solve(d.sk).sketch;
    const dofC = solve(sk).dof;
    const ca = circularArray(sk, [l], 4, 360, { x: 0, y: 0 });
    const cLines = ca.created.filter((id) => !(ca.sketch.entities[id] as { aux?: boolean }).aux && ca.sketch.entities[id].type === 'line');
    expect(cLines).toHaveLength(3);
    const p90 = pt(ca.sketch, (ca.sketch.entities[cLines[0]] as { p1: string }).p1);
    expect(p90.x).toBeCloseTo(0, 9);
    expect(p90.y).toBeCloseTo(10, 9);
    const rc = solve(ca.sketch);
    expect(rc.ok && !rc.redundant.length).toBe(true);
    expect(rc.dof).toBe(dofC);
    // Girar a origem (arrastar a ponta) gira as cópias junto, mantendo 90° entre elas.
    const movedC = solve(ca.sketch, [{ pointId: a, x: 0, y: -10 }]);
    const q = pt(movedC.sketch, (movedC.sketch.entities[cLines[0]] as { p1: string }).p1);
    const o = pt(movedC.sketch, a);
    expect(q.x * o.x + q.y * o.y).toBeCloseTo(0, 3);
  });
});

describe('offset associativo', () => {
  test('não acrescenta DOF, segue o pai, distância editável (±) e arrastável', async () => {
    const { offsetCurves, setOffsetDistance } = await import('./offset');
    const { offsetParam } = await import('./solver');
    const d = new Draft(emptySketch());
    const p = [ORIGIN_ID, d.addPoint(40, 0), d.addPoint(40, 20), d.addPoint(0, 20)];
    const rect = [d.addLine(p[0], p[1]), d.addLine(p[1], p[2]), d.addLine(p[2], p[3]), d.addLine(p[3], p[0])];
    d.addConstraint('horizontal', [rect[0]]);
    d.addConstraint('vertical', [rect[1]]);
    d.addConstraint('horizontal', [rect[2]]);
    d.addConstraint('vertical', [rect[3]]);
    const wDim = d.addConstraint('distance', [rect[0]], { value: 40 });
    d.addConstraint('distance', [rect[1]], { value: 20 });
    const q1 = d.addPoint(100, -10);
    const q2 = d.addPoint(100, 10);
    const dl = d.addLine(q2, q1);
    const da = d.addArc(d.addPoint(100, 0), q1, q2, 10);
    const circ = d.addCircle(d.addPoint(-50, 0), 5);
    const o1 = d.addPoint(0, 50);
    const open = d.addLine(o1, d.addPoint(30, 60));
    const base = solve(d.sk);
    let sk = base.sketch;
    for (const [ids, dist] of [
      [rect, 2],
      [[dl, da], 1.5],
      [[open], 3],
      [[circ], -2],
    ] as [string[], number][]) {
      const r = offsetCurves(sk, ids, dist);
      const s = solve(r.sketch);
      expect(s.ok && !s.conflicting.length && !s.redundant.length).toBe(true);
      expect(s.dof).toBe(base.dof); // o offset fica preso ao pai (a distância é um parâmetro fixo)
      sk = s.sketch;
    }
    const og = sk.groups.find((g) => g.offset && g.offset.parents.includes(rect[0]))!;
    const lines = () => og.members.filter((id) => sk.entities[id]?.type === 'line' && !(sk.entities[id] as { aux?: boolean }).aux);
    const maxX = (ids: string[]) => Math.max(...ids.map((id) => pt(sk, (sk.entities[id] as { p1: string }).p1).x));
    expect(maxX(lines()) - maxX(rect)).toBeCloseTo(2, 6);
    // Editar a distância: 2 → 5 (mesmo lado) e −5 (inverte o lado, refaz no mesmo grupo).
    let r = solve(setOffsetDistance(sk, og.id, 5));
    expect(r.ok).toBe(true);
    sk = r.sketch;
    expect(maxX(lines()) - maxX(rect)).toBeCloseTo(5, 6);
    r = solve(setOffsetDistance(sk, og.id, -5));
    expect(r.ok && !r.redundant.length).toBe(true);
    sk = r.sketch;
    const og2 = sk.groups.find((g) => g.id === og.id)!;
    const lines2 = og2.members.filter((id) => sk.entities[id]?.type === 'line' && !(sk.entities[id] as { aux?: boolean }).aux);
    expect(lines2).toHaveLength(4);
    expect(maxX(rect) - maxX(lines2)).toBeCloseTo(5, 6); // agora para dentro
    expect(r.dof).toBe(base.dof);
    // Pai muda (largura 40 → 60): o offset acompanha, sem trocar de lado.
    sk = solve({ ...sk, constraints: sk.constraints.map((c) => (c.id === wDim ? { ...c, value: 60 } : c)) }).sketch;
    expect(maxX(rect)).toBeCloseTo(60, 6);
    expect(maxX(rect) - maxX(lines2)).toBeCloseTo(5, 6);
    // Arrastar o offset com a distância liberada: a distância muda, o pai fica.
    const corner = (sk.entities[lines2[0]] as { p1: string }).p1;
    const P = pt(sk, corner);
    // Canto interno (60−d, d): só se move na direção (−1, +1) — cada lado fica a d do pai.
    const dragged = solve(sk, [{ pointId: corner, x: P.x - 3, y: P.y + 3 }], new Set([offsetParam(og.id)]));
    expect(dragged.ok).toBe(true);
    const newD = dragged.sketch.groups.find((g) => g.id === og.id)!.offset!.distance;
    expect(newD).toBeCloseTo(8, 3);
    expect(maxX.call(null, rect)).toBeCloseTo(60, 6);
    // Apagar o pai apaga o offset dependente.
    const del = deleteItems(sk, rect);
    expect(del.groups.some((g) => g.id === og.id)).toBe(false);
  });
});

describe('alinhar ponto e linha', () => {
  test('horizontal com ponto+linha alinha; coincidente com duas linhas deixa colineares', () => {
    const d = new Draft(emptySketch());
    const a = d.addPoint(-70, 45);
    const b = d.addPoint(-40, 45);
    const l = d.addLine(a, b);
    d.addConstraint('horizontal', [l]);
    const p = d.addPoint(-25, 50, true);
    d.sk.entities[p] = { ...(d.sk.entities[p] as PointEnt), fixed: true };
    const h = constraintsFor(d.sk, 'horizontal', [p, l]);
    expect(h).toEqual([{ type: 'horizontal', refs: [p, a] }]);
    const d2 = new Draft(d.sk);
    for (const c of h) d2.addConstraint(c.type, c.refs);
    const r = solve(d2.sk);
    expect(r.ok && !r.redundant.length).toBe(true);
    expect(pt(r.sketch, a).y).toBeCloseTo(50, 9);
    // Duas linhas colineares.
    const q1 = d.addPoint(0, 10);
    const q2 = d.addPoint(20, 12);
    const l2 = d.addLine(q1, q2);
    const cs = constraintsFor(d.sk, 'coincident', [l, l2]);
    const d3 = new Draft(d.sk);
    for (const c of cs) d3.addConstraint(c.type, c.refs);
    const r3 = solve(d3.sk);
    expect(r3.ok).toBe(true);
    expect(pt(r3.sketch, q1).y).toBeCloseTo(pt(r3.sketch, a).y, 6);
    expect(pt(r3.sketch, q2).y).toBeCloseTo(pt(r3.sketch, a).y, 6);
  });
});
