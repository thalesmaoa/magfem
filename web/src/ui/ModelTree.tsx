import { useEffect, useRef, useState } from 'react';
import { q } from '../cad/code';
import { entityLabel, type SketchEditor } from '../cad/editor';
import { evaluate, evaluateVariables, formatLength, formatQ } from '../cad/expr';
import { addNode, addSchematic, isMeshSel, NS, removeNode, updateNode, type AddKind, type TreeSel } from '../cad/tree';
import { MeshProps, MeshTree } from './MeshPanel';
import { InterpSection, PlotProps, TableItemProps, ResultsProps, ResultsTree, SolveButton, SolveSection } from './PostPanel';
import { isCurve, isDimension, ORIGIN_ID, type ConstraintType, type AnalysisType, type Entity, type Group, type Id, type PhysicsNode, type TreeNode } from '../cad/types';
import { deleteVariable, nextVarName, renameVariable, setVariable } from '../cad/vars';
import { groupOf } from '../cad/ops';
import { formatValue } from '../cad/measure';
import { useT } from '../i18n';
import { LazyInput } from './common';
import { Icons } from './icons';
import { GeometryProps } from './GeometryProps';
import { useDocVersion, useEditor } from './useStore';
import { ScriptExportButton } from './ScriptExport';

const ICON: Record<string, JSX.Element> = { pre: Icons.treePre, geometry: Icons.treeGeom, physics: Icons.treePhysics, mesh: Icons.treeMesh, post: Icons.treePost, schematic: Icons.circuit };
/** Ícone de cada tipo de restrição na árvore (reaproveita os da barra). */
const CONSTRAINT_ICON: Record<ConstraintType, keyof typeof Icons> = {
  coincident: 'coincident',
  horizontal: 'horizontal',
  vertical: 'vertical',
  parallel: 'parallel',
  perpendicular: 'perpendicular',
  tangent: 'tangent',
  equal: 'equal',
  pointOn: 'coincident',
  midpoint: 'midpoint',
  symmetric: 'symmetric',
  symmetricPoint: 'symmetric',
  concentric: 'concentric',
  radiusDiff: 'offset',
  coordDiff: 'arrayLinear',
  midpointOnLine: 'symmetric',
  distance: 'dimension',
  hdistance: 'dimension',
  vdistance: 'dimension',
  radius: 'dimension',
  diameter: 'dimension',
  angle: 'dimension',
};
const isAux = (e: Entity) => (e.type === 'point' || e.type === 'line') && !!e.aux;
const ENT_ICON: Record<Entity['type'], JSX.Element> = { point: Icons.point, line: Icons.line, circle: Icons.circle, arc: Icons.arc3 };

/** (+) de Modelo: inclui peças de nível do modelo (por enquanto, o circuito externo). */
function ModelAddMenu({ ed, onAdded }: { ed: SketchEditor; onAdded: (id: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="add-menu" ref={ref}>
      <button className="icon-btn tadd" title={t.sch.add} aria-label={t.sch.add} aria-expanded={open} onClick={() => setOpen(!open)}>
        +
      </button>
      {open && (
        <div className="menu" role="menu">
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              const r = addSchematic(ed.sketch);
              if (ed.commit(r.sketch, [r.code])) onAdded(r.node.id);
            }}
          >
            <span className="ticon">{Icons.circuit}</span> {t.sch.name}
          </button>
        </div>
      )}
    </div>
  );
}

/** (+) de uma seção da árvore: inclui os tipos de nó daquela seção. */
function AddMenu({ ed, kinds, label, onAdded }: { ed: SketchEditor; kinds: AddKind[]; label: string; onAdded: (id: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const count = (k: TreeNode['kind']) => ed.sketch.nodes.filter((n) => n.kind === k).length;
  const numbered = (base: string, k: TreeNode['kind']) => (count(k) ? `${base} ${count(k) + 1}` : base);
  const add = (kind: AddKind) => {
    setOpen(false);
    const name = kind === 'physics-magnetic' ? numbered(t.tree.magnetic, 'physics') : kind === 'mesh' ? numbered(t.tree.addMesh, 'mesh') : numbered(t.tree.addPost, 'post');
    const r = addNode(ed.sketch, kind, name);
    if (ed.commit(r.sketch, [r.code])) onAdded(r.node.id);
  };
  const itemIcon = (k: AddKind) => (k === 'physics-magnetic' ? ICON.physics : k === 'mesh' ? ICON.mesh : ICON.post);
  const itemLabel = (k: AddKind) => (k === 'physics-magnetic' ? t.tree.magnetic : k === 'mesh' ? t.tree.addMesh : t.tree.addPost);
  return (
    <div className="add-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        className="icon-btn tadd"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => (kinds.length === 1 && kinds[0] !== 'physics-magnetic' ? add(kinds[0]) : setOpen(!open))}
      >
        +
      </button>
      {open && (
        <div className="menu" role="menu">
          {kinds.includes('physics-magnetic') && <div className="menu-label">{t.tree.addPhysics}</div>}
          {kinds.map((k) => (
            <button key={k} role="menuitem" onClick={() => add(k)}>
              <span className="ticon">{itemIcon(k)}</span> {itemLabel(k)}
            </button>
          ))}
          {kinds.includes('physics-magnetic') && <div className="menu-note">{t.tree.moreSoon}</div>}
        </div>
      )}
    </div>
  );
}

function NodeRow({ ed, node, active, onSelect, onTreeSelect }: { ed: SketchEditor; node: TreeNode; active: boolean; onSelect: () => void; onTreeSelect: (s: TreeSel) => void }) {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  return (
    <li className={`tnode${active ? ' on' : ''}`} onClick={onSelect} role="treeitem" aria-selected={active}>
      <span className="ticon">{ICON[node.kind]}</span>
      {renaming ? (
        <LazyInput
          autoFocus
          value={node.name}
          onDone={() => setRenaming(false)}
          onCommit={(n) => {
            if (n.trim() && n.trim() !== node.name) ed.commit(updateNode(ed.sketch, node.id, { name: n.trim() }), [`${NS[node.kind]}.rename(${q(node.id)}, ${q(n.trim())})`]);
          }}
        />
      ) : (
        <span className="tname" title={t.tree.rename} onDoubleClick={() => setRenaming(true)}>
          {node.name}
        </span>
      )}
      {node.kind === 'physics' && <span className="crefs">{t.problem[node.analysis]}</span>}
      {node.kind === 'physics' && <SolveButton ed={ed} id={node.id} onSelect={onTreeSelect} />}
      <button
        className="x"
        title={t.tree.remove}
        aria-label={`${t.tree.remove} ${node.name}`}
        onClick={(e) => {
          e.stopPropagation();
          ed.commit(removeNode(ed.sketch, node.id), [`${NS[node.kind]}.remove(${q(node.id)})`]);
        }}
      >
        ×
      </button>
    </li>
  );
}

function PhysicsProps({ ed, node, onSelect }: { ed: SketchEditor; node: PhysicsNode; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  const sk = ed.sketch;
  const { values } = evaluateVariables(sk.variables, sk.settings.unit);
  const set = (patch: Partial<PhysicsNode>, code: string) => ed.commit(updateNode(sk, node.id, patch), [code]);
  const field = (label: string, key: 'frequency' | 'dt' | 'tEnd', arg: string) => {
    let err: string | null = null;
    try {
      if (!(evaluate(node[key], { env: values, unit: sk.settings.unit }).v > 0)) err = t.msg.positive;
    } catch (e) {
      err = (e as Error).message;
    }
    return (
      <label className="field">
        <span>{label}</span>
        <LazyInput value={node[key]} className={err ? 'bad' : ''} onCommit={(v) => set({ [key]: v.trim() }, `s.physics(${q(node.id)}, ${arg}=${q(v.trim())})`)} />
        {err && (
          <span className="err" title={err}>
            !
          </span>
        )}
      </label>
    );
  };
  return (
    <div className="props-body">
      <section>
        <h3>
          {t.tree.physicsProps}: {node.name}
        </h3>
        <label className="field">
          <span>{t.problem.analysis}</span>
          <select value={node.analysis} onChange={(e) => set({ analysis: e.target.value as AnalysisType }, `s.physics(${q(node.id)}, analysis=${q(e.target.value)})`)}>
            <option value="magnetostatic">{t.problem.magnetostatic}</option>
            <option value="harmonic">{t.problem.harmonic}</option>
            <option value="transient">{t.problem.transient}</option>
            <option value="circuit">{t.problem.circuit}</option>
          </select>
        </label>
        {node.analysis === 'harmonic' && field(t.problem.frequency, 'frequency', 'frequency')}
        {(node.analysis === 'transient' || node.analysis === 'circuit') && (
          <>
            {field(t.problem.dt, 'dt', 'dt')}
            {field(t.problem.tEnd, 'tEnd', 't_end')}
            {node.analysis === 'circuit' && (
              <label className="field">
                <span>{t.solve.schematic}</span>
                <select
                  aria-label={t.solve.schematic}
                  value={node.schematic ?? sk.nodes.find((n) => n.kind === 'schematic')?.id ?? ''}
                  onChange={(e) => set({ schematic: e.target.value } as Partial<PhysicsNode>, `s.physics(${q(node.id)}, schematic=${q(e.target.value)})`)}
                >
                  {sk.nodes
                    .filter((n) => n.kind === 'schematic')
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <p className="help-line">{t.solve.timeHelp}</p>
          </>
        )}
      </section>
      <SolveSection ed={ed} node={node} onSelect={onSelect} />
    </div>
  );
}


/** (+) da Geometria: incluir variável ou grupo (da seleção). */
function GeometryAddMenu({ ed, onVar }: { ed: SketchEditor; onVar: (name: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const sk = ed.sketch;
  const addVar = () => {
    setOpen(false);
    const n = nextVarName(sk);
    const expr = `10 ${sk.settings.unit}`;
    if (ed.commit(setVariable(sk, n, expr), [`g.var(${q(n)}, ${q(expr)})`])) onVar(n);
  };
  return (
    <div className="add-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn tadd" aria-label={t.tree.addToGeometry} title={t.tree.addToGeometry} aria-expanded={open} onClick={() => setOpen(!open)}>
        +
      </button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={addVar}>
            <span className="ticon">{Icons.variable}</span> {t.tree.variable}
          </button>
          <button
            role="menuitem"
            disabled={!ed.selection.length}
            title={ed.selection.length ? undefined : t.tree.groupNeedsSelection}
            onClick={() => {
              setOpen(false);
              ed.groupSelection();
            }}
          >
            <span className="ticon">{Icons.group}</span> {t.tree.groupFromSelection}
          </button>
        </div>
      )}
    </div>
  );
}

/** Linha da árvore com nome renomeável por duplo clique. */
function Row(props: {
  icon: JSX.Element;
  label: string;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onRename?: (n: string) => void;
  extra?: React.ReactNode;
  toggle?: { open: boolean; onToggle: () => void };
  muted?: boolean;
  construction?: boolean;
  title?: string;
}) {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  return (
    <div className={`tnode${props.selected ? ' on' : ''}${props.muted ? ' dim' : ''}`} role="treeitem" aria-selected={props.selected} aria-label={props.label} onClick={props.onClick} title={props.title}>
      {props.toggle ? (
        <button
          className="twisty"
          aria-label={props.toggle.open ? '−' : '+'}
          onClick={(e) => {
            e.stopPropagation();
            props.toggle!.onToggle();
          }}
        >
          {props.toggle.open ? '▾' : '▸'}
        </button>
      ) : (
        <span className="twisty-space" />
      )}
      <span className={`ticon${props.construction ? ' cons' : ''}`}>{props.icon}</span>
      {renaming && props.onRename ? (
        <LazyInput
          autoFocus
          value={props.label}
          ariaLabel={t.tree.rename}
          onCommit={(n) => props.onRename!(n)}
          onDone={() => setRenaming(false)}
        />
      ) : (
        <span
          className="tname"
          title={props.onRename ? t.tree.rename : undefined}
          onDoubleClick={(e) => {
            if (!props.onRename) return;
            e.stopPropagation();
            setRenaming(true);
          }}
        >
          {props.label}
        </span>
      )}
      {props.extra}
    </div>
  );
}

/** Conteúdo da Geometria: variáveis, origem, grupos e entidades (inspirado no Onshape). */
function GeometryTree({ ed, sel, onSelect }: { ed: SketchEditor; sel: TreeSel; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  const snap = useEditor(ed);
  const sk = ed.sketch;
  const [open, setOpen] = useState<Set<string>>(() => new Set(['vars']));
  const toggle = (k: string) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });
  const selected = new Set(snap.selection);
  const { values, errors } = evaluateVariables(sk.variables, sk.settings.unit);

  const pick = (id: Id, e: React.MouseEvent, group?: Group) => {
    onSelect({ kind: 'geometry' });
    if (group) ed.enterGroup(group.id);
    else if (!sk.groups.some((g) => g.id === id)) ed.enterGroup(null);
    ed.select(e.shiftKey ? [...ed.selection.filter((x) => x !== id), id] : [id]);
  };
  // Entidades de topo: curvas e pontos soltos que não estão em grupo (pontos de curvas não aparecem).
  const top = Object.values(sk.entities).filter((e) => e.id !== ORIGIN_ID && !isAux(e) && !groupOf(sk, e.id) && (isCurve(e) || e.free));
  const entityRow = (e: Entity, group?: Group) => (
    <Row
      key={e.id}
      icon={ENT_ICON[e.type]}
      label={entityLabel(sk, e.id)}
      construction={e.type !== 'point' && !!e.construction}
      selected={selected.has(e.id)}
      onClick={(ev) => pick(e.id, ev, group)}
      onRename={(n) => ed.renameEntity(e.id, n)}
      extra={<span className="crefs">{e.id}</span>}
    />
  );
  // Grupo com filhos (ex.: Retângulo 1 › Linha…, Offset 1), recursivo.
  const groupNode = (g: Group): JSX.Element => (
    <li key={g.id}>
      <Row
        icon={g.offset ? Icons.offset : g.pattern?.kind === 'linear' ? Icons.arrayLinear : g.pattern ? Icons.arrayCircular : Icons.group}
        label={g.name}
        muted={g.hidden}
        selected={selected.has(g.id)}
        toggle={{ open: open.has(g.id), onToggle: () => toggle(g.id) }}
        onClick={(e) => pick(g.id, e)}
        onRename={(n) => ed.renameGroup(g.id, n)}
        extra={
          <>
            {g.offset && <span className="crefs">{formatLength(g.offset.side * g.offset.distance, sk.settings.unit)}</span>}
            {g.pattern && (
              <span className="crefs">
                {g.pattern.kind === 'linear'
                  ? `${g.pattern.nx}×${g.pattern.ny} · ${formatLength(g.pattern.dx, sk.settings.unit)}`
                  : `${g.pattern.n} × ${Number(g.pattern.angle.toFixed(2))}°`}
              </span>
            )}
            <button
              className="icon-btn"
              title={g.hidden ? t.groups.show : t.groups.hide}
              aria-label={`${g.hidden ? t.groups.show : t.groups.hide} ${g.name}`}
              onClick={(e) => {
                e.stopPropagation();
                ed.toggleGroupHidden(g);
              }}
            >
              {g.hidden ? Icons.eyeOff : Icons.eye}
            </button>
          </>
        }
      />
      {open.has(g.id) && (
        <ul role="group">
          {g.members.map((m) => sk.entities[m]).filter((e): e is Entity => !!e && !isAux(e)).map((e) => <li key={e.id}>{entityRow(e, g)}</li>)}
          {sk.groups.filter((c) => c.parent === g.id).map((c) => groupNode(c))}
        </ul>
      )}
    </li>
  );
  const addVar = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    const n = nextVarName(sk);
    const expr = `10 ${sk.settings.unit}`;
    if (ed.commit(setVariable(sk, n, expr), [`g.var(${q(n)}, ${q(expr)})`])) {
      setOpen((o) => new Set(o).add('vars'));
      onSelect({ kind: 'var', name: n });
    }
  };
  return (
    <ul role="group">
      <li>
        <Row
          icon={Icons.variable}
          label={`${t.vars.title} (${sk.variables.length})`}
          selected={false}
          toggle={{ open: open.has('vars'), onToggle: () => toggle('vars') }}
          onClick={() => toggle('vars')}
          extra={
            <button className="icon-btn tadd" title={t.vars.add} aria-label={t.vars.add} onClick={addVar}>
              +
            </button>
          }
        />
        {open.has('vars') && (
          <ul role="group">
            {sk.variables.map((v) => {
              const val = values.get(v.name);
              const err = errors.get(v.name);
              return (
                <li key={v.name}>
                  <Row
                    icon={Icons.variable}
                    label={v.name}
                    selected={sel.kind === 'var' && sel.name === v.name}
                    onClick={() => {
                      ed.select([]);
                      onSelect({ kind: 'var', name: v.name });
                    }}
                    onRename={(n) => {
                      try {
                        if (ed.commit(renameVariable(sk, v.name, n.trim()), [`g.rename_var(${q(v.name)}, ${q(n.trim())})`])) onSelect({ kind: 'var', name: n.trim() });
                      } catch (e) {
                        ed.flash((e as Error).message);
                      }
                    }}
                    extra={<span className={`crefs${err ? ' bad' : ''}`}>{err ? '⚠' : val ? formatQ(val, sk.settings.unit) : ''}</span>}
                    title={err ?? v.expr}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </li>
      <li>
        <Row
          icon={Icons.constraints}
          label={`${t.cons.title} (${sk.constraints.filter((c) => !c.internal).length})`}
          selected={false}
          toggle={{ open: open.has('cons'), onToggle: () => toggle('cons') }}
          onClick={() => toggle('cons')}
        />
        {open.has('cons') && (
          <ul role="group">
            {sk.constraints.filter((c) => !c.internal).map((c) => (
              <li key={c.id}>
                <Row
                  icon={Icons[CONSTRAINT_ICON[c.type]]}
                  label={isDimension(c) ? `${t.constraintNames[c.type]} ${formatValue(c, sk.settings.unit)}` : t.constraintNames[c.type]}
                  selected={selected.has(c.id)}
                  onClick={(e) => {
                    onSelect({ kind: 'geometry' });
                    ed.select(e.shiftKey ? [...ed.selection.filter((x) => x !== c.id), c.id] : [c.id]);
                  }}
                  title={c.refs.map((r) => entityLabel(sk, r)).join(' · ')}
                  extra={
                    <>
                      {isDimension(c) && (
                        <button className="icon-btn tedit" title={t.cons.edit} aria-label={`${t.cons.edit} ${c.id}`} onClick={(e) => {
                          e.stopPropagation();
                          ed.startEditing(c.id);
                        }}>
                          ✎
                        </button>
                      )}
                      <button
                        className="x"
                        title={t.cons.del}
                        aria-label={`${t.cons.del} ${c.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          ed.select([c.id]);
                          ed.deleteSelection();
                        }}
                      >
                        ×
                      </button>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </li>
      <li>
        <Row icon={Icons.origin} label={t.entity.origin} selected={selected.has(ORIGIN_ID)} onClick={(e) => pick(ORIGIN_ID, e)} />
      </li>
      {sk.groups.filter((g) => !g.parent || !sk.groups.some((p) => p.id === g.parent)).map((g) => groupNode(g))}
      {top.map((e) => (
        <li key={e.id}>{entityRow(e)}</li>
      ))}
    </ul>
  );
}

/** Propriedades de uma variável (nome, expressão, valor). */
function VariableProps({ ed, name, onRenamed }: { ed: SketchEditor; name: string; onRenamed: (n: string | null) => void }) {
  const t = useT();
  const sk = ed.sketch;
  const v = sk.variables.find((x) => x.name === name);
  if (!v) return null;
  const { values, errors } = evaluateVariables(sk.variables, sk.settings.unit);
  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      ed.flash((e as Error).message);
    }
  };
  const val = values.get(name);
  const err = errors.get(name);
  return (
    <div className="props-body">
      <section>
        <h3>{t.vars.title}</h3>
        <label className="field">
          <span>{t.vars.name}</span>
          <LazyInput
            value={v.name}
            ariaLabel={t.vars.name}
            onCommit={(n) => run(() => ed.commit(renameVariable(sk, v.name, n.trim()), [`g.rename_var(${q(v.name)}, ${q(n.trim())})`]) && onRenamed(n.trim()))}
          />
        </label>
        <label className="field">
          <span>{t.vars.expr}</span>
          <LazyInput
            value={v.expr}
            ariaLabel={t.vars.expr}
            className={err ? 'bad' : ''}
            onCommit={(x) => run(() => ed.commit(setVariable(sk, v.name, x.trim()), [`g.var(${q(v.name)}, ${q(x.trim())})`]))}
          />
        </label>
        <label className="field">
          <span>{t.vars.value}</span>
          <span className={err ? 'err-text' : 'cval'}>{err ?? (val ? formatQ(val, sk.settings.unit) : '')}</span>
        </label>
        <p className="help-line">{t.vars.help}</p>
        <button className="btn danger" onClick={() => run(() => ed.commit(deleteVariable(sk, v.name), [`g.del_var(${q(v.name)})`]) && onRenamed(null))}>
          {t.vars.del}
        </button>
      </section>
    </div>
  );
}

/** Árvore do modelo (esquerda) + propriedades do item selecionado. */
export function ModelTree({ ed, sel, onSelect, name = 'magfem' }: { ed: SketchEditor; sel: TreeSel; onSelect: (s: TreeSel) => void; name?: string }) {
  const t = useT();
  useDocVersion(ed.doc);
  const [geoOpen, setGeoOpen] = useState(true);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggleSection = (k: string) =>
    setClosed((c) => {
      const n = new Set(c);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const nodes = ed.sketch.nodes;
  const isOn = (id: string) => sel.kind === 'node' && sel.id === id;
  const current = sel.kind === 'node' ? nodes.find((n) => n.id === sel.id) : null;

  // Del/Backspace com uma variável selecionada na árvore apaga a variável (se não estiver em uso).
  useEffect(() => {
    if (sel.kind !== 'var') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      try {
        if (ed.commit(deleteVariable(ed.sketch, sel.name), [`g.del_var(${q(sel.name)})`])) onSelect({ kind: 'geometry' });
      } catch (err) {
        ed.flash((err as Error).message);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, ed, onSelect]);

  // Nó ou variável que sumiu (removido/desfeito): volta para a Geometria.
  useEffect(() => {
    if ((sel.kind === 'node' && !current) || (sel.kind === 'var' && !ed.sketch.variables.some((v) => v.name === sel.name))) onSelect({ kind: 'geometry' });
    if (sel.kind === 'results' && !ed.sketch.nodes.some((n) => n.id === sel.id && n.kind === 'physics')) onSelect({ kind: 'geometry' });
    if (sel.kind === 'boundary' && sel.id !== 'outer' && !ed.sketch.boundaries.some((b) => b.id === sel.id)) onSelect({ kind: 'mesh' });
  }, [sel, current, onSelect, ed.sketch.variables, ed.sketch.boundaries]);

  return (
    <aside className="side left">
      <section className="tree">
        <h3 className="tree-title">
          {t.tree.title}
          <span className="tree-actions">
            <ModelAddMenu ed={ed} onAdded={(id) => onSelect({ kind: 'node', id })} />
            <ScriptExportButton ed={ed} name={name} />
          </span>
        </h3>
        <ul role="tree">
          <li>
            <Row
              icon={ICON.geometry}
              label={t.tree.geometry}
              selected={sel.kind === 'geometry' && !ed.selection.length}
              toggle={{ open: geoOpen, onToggle: () => setGeoOpen(!geoOpen) }}
              onClick={() => {
                onSelect({ kind: 'geometry' });
                ed.enterGroup(null);
                ed.select([]);
              }}
              extra={
                <>
                  <span className="crefs">{Object.keys(ed.sketch.entities).length - 1}</span>
                  <GeometryAddMenu
                    ed={ed}
                    onVar={(n) => {
                      setGeoOpen(true);
                      onSelect({ kind: 'var', name: n });
                    }}
                  />
                </>
              }
            />
            {geoOpen && <GeometryTree ed={ed} sel={sel} onSelect={onSelect} />}
          </li>
          {nodes.some((n) => n.kind === 'schematic') && (
            <li>
              <Row icon={Icons.circuit} label={t.sch.section} selected={false} onClick={() => undefined} />
              <ul role="group">
                {nodes
                  .filter((n) => n.kind === 'schematic')
                  .map((n) => (
                    <NodeRow key={n.id} ed={ed} node={n} active={isOn(n.id)} onSelect={() => onSelect({ kind: 'node', id: n.id })} onTreeSelect={onSelect} />
                  ))}
              </ul>
            </li>
          )}
          {(
            [
              { key: 'mesh', icon: ICON.mesh, label: t.tree.addMesh, kinds: ['mesh'], add: t.tree.addToMesh, match: (n: TreeNode) => n.kind === 'mesh' },
              { key: 'solver', icon: Icons.solver, label: t.tree.solver, kinds: ['physics-magnetic'], add: t.tree.addToSolver, match: (n: TreeNode) => n.kind === 'physics' },
              { key: 'results', icon: ICON.post, label: t.tree.results, kinds: ['post'], add: t.tree.addToResults, match: (n: TreeNode) => n.kind === 'post' },
            ] as const
          ).map((sec) => (
            <li key={sec.key}>
              <Row
                icon={sec.icon}
                label={sec.label}
                selected={sec.key === 'mesh' && sel.kind === 'mesh' && !ed.meshSel}
                toggle={{ open: !closed.has(sec.key), onToggle: () => toggleSection(sec.key) }}
                onClick={() => {
                  if (sec.key !== 'mesh') return toggleSection(sec.key);
                  // Malha: mostra o desenho com regiões e contornos.
                  ed.selectCurves([]);
                  onSelect({ kind: 'mesh' });
                  setClosed((c) => {
                    const n = new Set(c);
                    n.delete('mesh');
                    return n;
                  });
                }}
                extra={
                  // Malha tem um único nó (Elementos), sem (+) na seção.
                  sec.key !== 'mesh' && sec.key !== 'results' && <AddMenu
                    ed={ed}
                    kinds={[...sec.kinds]}
                    label={sec.add}
                    onAdded={(id) => {
                      setClosed((c) => {
                        const n = new Set(c);
                        n.delete(sec.key);
                        return n;
                      });
                      onSelect({ kind: 'node', id });
                    }}
                  />
                }
              />
              {!closed.has(sec.key) && sec.key === 'mesh' && <MeshTree ed={ed} sel={sel} onSelect={onSelect} />}
              {!closed.has(sec.key) && sec.key === 'results' && <ResultsTree ed={ed} sel={sel} onSelect={onSelect} />}
              {!closed.has(sec.key) && sec.key !== 'mesh' && sec.key !== 'results' && (
                <ul role="group">
                  {nodes.filter(sec.match).map((n) => (
                    <NodeRow key={n.id} ed={ed} node={n} active={isOn(n.id)} onSelect={() => onSelect({ kind: 'node', id: n.id })} onTreeSelect={onSelect} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
      <div className="props">
        <h3 className="props-title">{t.tree.props}</h3>
        {sel.kind === 'geometry' && <GeometryProps ed={ed} />}
        {sel.kind === 'var' && <VariableProps ed={ed} name={sel.name} onRenamed={(n) => onSelect(n ? { kind: 'var', name: n } : { kind: 'geometry' })} />}
        {current?.kind === 'physics' && <PhysicsProps ed={ed} node={current} onSelect={onSelect} />}
        {isMeshSel(sel, ed.sketch) && <MeshProps ed={ed} sel={sel} onSelect={onSelect} />}
        {current && current.kind === 'post' && !current.item && <PlotProps ed={ed} node={current} />}
        {current && current.kind === 'post' && current.item && <TableItemProps ed={ed} node={current} />}
        {current?.kind === 'schematic' && (
          <div className="props-body">
            <section>
              <h3>{current.name}</h3>
              <p className="help-line">{t.sch.help}</p>
              <p className="help-line">{t.sch.coupledNote}</p>
            </section>
          </div>
        )}
        {current?.kind === 'table' && <ResultsProps ed={ed} id={current.physics} onSelect={onSelect} />}
        {sel.kind === 'results' && <ResultsProps ed={ed} id={sel.id} onSelect={onSelect} />}
        {current?.kind === 'view' && <InterpSection ed={ed} view={current} />}
        {current?.kind === 'view' && <ResultsProps ed={ed} id={current.physics} onSelect={onSelect} />}
      </div>
    </aside>
  );
}
