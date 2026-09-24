import { describeEntity, type SketchEditor } from '../cad/editor';
import { asAngle, asLength, evaluate, evaluateVariables, formatLength } from '../cad/expr';
import { LazyInput } from './common';
import { expandSelection, fixedPointsOf } from '../cad/ops';
import { arcAngles } from '../cad/geometry';
import { loopArea, minDistanceSets } from '../cad/inspect';
import type { LengthUnit } from '../cad/expr';
import { dist, pt } from '../cad/geometry';
import type { Id } from '../cad/types';
import { useT } from '../i18n';
import { useDocVersion, useEditor } from './useStore';

function EntityInfo({ ed, id }: { ed: SketchEditor; id: Id }) {
  const t = useT();
  const sk = ed.sketch;
  const e = sk.entities[id];
  const u = ed.unit;
  let info = '';
  if (sk.groups.some((g) => g.id === id)) info = t.groups.members(sk.groups.find((g) => g.id === id)!.members.length);
  else if (e?.type === 'point') info = `(${formatLength(e.x, u)}; ${formatLength(e.y, u)})${e.fixed ? ` · ${t.sel.fixed}` : ''}`;
  else if (e?.type === 'line') info = `${t.sel.length} ${formatLength(dist(pt(sk, e.p1), pt(sk, e.p2)), u)}`;
  else if (e) info = `${t.sel.radius} ${formatLength(e.r, u)}`;
  if (e && e.type !== 'point' && e.construction) info += ` · ${t.sel.construction}`;
  return (
    <li>
      <b>{describeEntity(sk, id)}</b> <span className="muted">{info}</span>
    </li>
  );
}

const deg = (rad: number) => `${Number(((rad * 180) / Math.PI).toFixed(3)).toString().replace('.', ',')}°`;
const area = (mm2: number, u: LengthUnit) => {
  const f = { 'µm': 1e-3, mm: 1, cm: 10, m: 1000, in: 25.4 }[u];
  return `${Number((mm2 / (f * f)).toPrecision(8)).toString().replace('.', ',')} ${u}²`;
};

/** Medidas da seleção (e da régua): x, y, comprimento, raio, distância mínima, área. */
function Measures({ ed }: { ed: SketchEditor }) {
  const snap = useEditor(ed);
  const t = useT();
  const sk = ed.sketch;
  const u = sk.settings.unit;
  const L = (v: number) => formatLength(v, u);
  const rows: [string, string][] = [];
  const ents = expandSelection(sk, snap.selection);
  if (snap.ruler) {
    const a = snap.ruler.a;
    const b = snap.ruler.b ?? ed.cursor;
    rows.push([t.meas.distance, L(dist(a, b))], ['Δx', L(b.x - a.x)], ['Δy', L(b.y - a.y)], [t.meas.angle, deg(Math.atan2(b.y - a.y, b.x - a.x))]);
  } else if (ents.length === 1) {
    const e = sk.entities[ents[0]];
    if (e.type === 'point') rows.push(['x', L(e.x)], ['y', L(e.y)], ['ρ', L(Math.hypot(e.x, e.y))], ['θ', deg(Math.atan2(e.y, e.x))]);
    else if (e.type === 'line') {
      const a = pt(sk, e.p1);
      const b = pt(sk, e.p2);
      rows.push([t.meas.length, L(dist(a, b))], [t.meas.angle, deg(Math.atan2(b.y - a.y, b.x - a.x))], ['Δx', L(b.x - a.x)], ['Δy', L(b.y - a.y)]);
    } else if (e.type === 'circle') {
      const c = pt(sk, e.c);
      rows.push([t.meas.center, `(${L(c.x)}; ${L(c.y)})`], [t.meas.radius, L(e.r)], [t.meas.diameter, L(2 * e.r)], [t.meas.area, area(Math.PI * e.r * e.r, u)], [t.meas.perimeter, L(2 * Math.PI * e.r)]);
    } else {
      const { c, start, end } = arcAngles(sk, e);
      rows.push([t.meas.center, `(${L(c.x)}; ${L(c.y)})`], [t.meas.radius, L(e.r)], [t.meas.sweep, deg(end - start)], [t.meas.arcLength, L(e.r * (end - start))]);
    }
  } else if (snap.selection.length === 2 && snap.selection.every((id) => sk.entities[id] || sk.groups.some((g) => g.id === id))) {
    // Entre os dois itens selecionados (um deles pode ser um grupo).
    const m = minDistanceSets(sk, expandSelection(sk, [snap.selection[0]]), expandSelection(sk, [snap.selection[1]]));
    if (m) rows.push([t.meas.minDistance, L(m.d)], ['Δx', L(m.pb.x - m.pa.x)], ['Δy', L(m.pb.y - m.pa.y)]);
  }
  if (ents.length >= 1) {
    const lp = loopArea(sk, ents);
    if (lp && !(ents.length === 1 && sk.entities[ents[0]].type === 'circle')) rows.push([t.meas.area, area(lp.area, u)], [t.meas.perimeter, L(lp.perimeter)]);
  }
  if (!rows.length) return null;
  return (
    <div className="measures">
      <h4>{snap.ruler ? t.tools.measure : t.meas.title}</h4>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Offset selecionado: distância com sinal (negativo inverte o lado). Enter aplica. */
function OffsetProps({ ed }: { ed: SketchEditor }) {
  const snap = useEditor(ed);
  const t = useT();
  const sk = ed.sketch;
  const g = snap.selection.length === 1 ? sk.groups.find((x) => x.id === snap.selection[0] && x.offset) : undefined;
  if (!g?.offset) return null;
  const u = sk.settings.unit;
  const f = { 'µm': 1e-3, mm: 1, cm: 10, m: 1000, in: 25.4 }[u];
  const shown = String(Number(((g.offset.side * g.offset.distance) / f).toFixed(4))).replace('.', ',');
  return (
    <div className="offset-props">
      <h4>{t.offset.tool}</h4>
      <label className="field">
        <span>{t.offset.distance}</span>
        <LazyInput
          value={shown}
          ariaLabel={t.offset.distance}
          onCommit={(v) => {
            try {
              const unitCtx = { env: evaluateVariables(sk.variables, u).values, unit: u };
              const d = asLength(evaluate(v, unitCtx), u);
              ed.setOffset(g.id, d, /^[-+]?[\d.,]+$/.test(v.trim()) ? `${v.trim().replace(',', '.')} ${u}` : v.trim());
            } catch (e) {
              ed.flash((e as Error).message);
            }
          }}
        />
        <span className="suffix">{u}</span>
      </label>
      <p className="help-line">{t.offset.editHint}</p>
    </div>
  );
}

/** Padrão selecionado: quantidade e passo (linear) ou quantidade e ângulo total (circular). */
function PatternProps({ ed }: { ed: SketchEditor }) {
  const snap = useEditor(ed);
  const t = useT();
  const sk = ed.sketch;
  const g = snap.selection.length === 1 ? sk.groups.find((x) => x.id === snap.selection[0] && x.pattern) : undefined;
  const p = g?.pattern;
  if (!g || !p) return null;
  const u = sk.settings.unit;
  const f = { 'µm': 1e-3, mm: 1, cm: 10, m: 1000, in: 25.4 }[u];
  const num = (v: number) => String(Number(v.toFixed(4))).replace('.', ',');
  const ctx = () => ({ env: evaluateVariables(sk.variables, u).values, unit: u });
  const setNum = (key: string, text: string, kind: 'count' | 'len' | 'ang') => {
    try {
      const v = kind === 'count' ? Math.round(Number(text.replace(',', '.'))) : kind === 'len' ? asLength(evaluate(text, ctx()), u) : asAngle(evaluate(text, ctx()));
      if (!isFinite(v)) throw new Error(t.patterns.badCount);
      const shown = kind === 'count' ? String(v) : kind === 'len' ? `"${Number(v.toFixed(6))} mm"` : `"${Number(v.toFixed(6))} deg"`;
      ed.setPatternParams(g.id, { [key]: v }, `g.set_pattern("${g.id}", ${key}=${shown})`);
    } catch (e) {
      ed.flash((e as Error).message);
    }
  };
  const field = (label: string, key: string, value: string, kind: 'count' | 'len' | 'ang', suffix = '') => (
    <label className="field" key={key}>
      <span>{label}</span>
      <LazyInput value={value} ariaLabel={label} onCommit={(v) => setNum(key, v, kind)} />
      <span className="suffix">{suffix}</span>
    </label>
  );
  return (
    <div className="offset-props">
      <h4>{p.kind === 'linear' ? t.patterns.linear : t.patterns.circular}</h4>
      {p.kind === 'linear' ? (
        <>
          {field(t.patterns.countX, 'nx', String(p.nx), 'count')}
          {field(t.patterns.stepX, 'dx', num(p.dx / f), 'len', u)}
          {field(t.patterns.countY, 'ny', String(p.ny), 'count')}
          {field(t.patterns.stepY, 'dy', num(p.dy / f), 'len', u)}
        </>
      ) : (
        <>
          {field(t.patterns.count, 'n', String(p.n), 'count')}
          {field(t.patterns.angle, 'angle', num(p.angle), 'ang', '°')}
        </>
      )}
      <p className="help-line">{t.patterns.editHint}</p>
    </div>
  );
}

/** Propriedades da Geometria (painel sob a árvore): o que está selecionado. */
export function GeometryProps({ ed }: { ed: SketchEditor }) {
  const snap = useEditor(ed);
  const t = useT();
  useDocVersion(ed.doc);
  const sk = ed.sketch;
  const selItems = snap.selection.filter((id) => sk.entities[id] || sk.groups.some((g) => g.id === id));

  return (
    <div className="props-body">
      <section>
        <h3>{t.sel.title}</h3>
        <OffsetProps ed={ed} />
        <PatternProps ed={ed} />
        <Measures ed={ed} />
        {selItems.length === 0 ? (
          !snap.ruler && <p className="muted">{t.sel.none}</p>
        ) : (
          <>
            <ul className="plain">
              {selItems.slice(0, 8).map((id) => (
                <EntityInfo key={id} ed={ed} id={id} />
              ))}
              {selItems.length > 8 && <li className="muted">{t.sel.more(selItems.length - 8)}</li>}
            </ul>
            {fixedPointsOf(sk, selItems).length > 0 && (
              <div className="detach">
                <p className="muted">{t.sel.detachHelp}</p>
                <button className="btn" onClick={() => ed.detachSelection()}>
                  {t.sel.detach}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
