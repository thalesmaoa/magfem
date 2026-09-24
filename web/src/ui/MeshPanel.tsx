// Malha: árvore (materiais, regiões, contornos) e propriedades do item selecionado.
import { useEffect, useState } from 'react';
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { addMaterial, assignRegion, pointCode, regionKey, removeMaterial, setBoundary, updateMaterial } from '../cad/mesh';
import { findRegion } from '../cad/regions';
import type { TreeSel } from '../cad/tree';
import type { BoundaryType, Id, Material } from '../cad/types';
import { useT } from '../i18n';
import { LazyInput } from './common';
import { Icons } from './icons';
import { useEditor } from './useStore';

const TYPES: BoundaryType[] = ['dirichlet', 'neumann', 'periodic', 'antiperiodic'];
const UNIT_MM: Record<string, number> = { 'µm': 1e-3, mm: 1, cm: 10, m: 1000, in: 25.4 };

function useTypeName() {
  const t = useT();
  return (k: BoundaryType) => t.mesh[k];
}

const boundaryCode = (ids: Id[], type: BoundaryType | null) => `m.boundary([${ids.map(q).join(', ')}], ${type ? q(type) : 'None'})`;

const Swatch = ({ color }: { color: string | null }) => (
  <span className="swatch" style={color ? { background: color } : undefined} aria-hidden="true" />
);

type RowProps = {
  icon: JSX.Element;
  label: string;
  selected?: boolean;
  onClick: () => void;
  extra?: React.ReactNode;
  toggle?: { open: boolean; onToggle: () => void };
};

function Row(p: RowProps) {
  return (
    <div className={`tnode${p.selected ? ' on' : ''}`} role="treeitem" aria-selected={!!p.selected} aria-label={p.label} onClick={p.onClick}>
      {p.toggle ? (
        <button
          className="twisty"
          aria-label={p.toggle.open ? '−' : '+'}
          onClick={(e) => {
            e.stopPropagation();
            p.toggle!.onToggle();
          }}
        >
          {p.toggle.open ? '▾' : '▸'}
        </button>
      ) : (
        <span className="twisty-space" />
      )}
      <span className="ticon">{p.icon}</span>
      <span className="tname">{p.label}</span>
      {p.extra}
    </div>
  );
}

/** Filhos de "Malha" na árvore: Materiais, Regiões e Contornos. */
export function MeshTree({ ed, sel, onSelect }: { ed: SketchEditor; sel: TreeSel; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  const typeName = useTypeName();
  const snap = useEditor(ed);
  const sk = ed.sketch;
  const [open, setOpen] = useState<Set<string>>(() => new Set(['regions', 'boundaries']));
  const toggle = (k: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const arr = ed.arrangement();
  const mats = new Map(sk.materials.map((m) => [m.id, m]));
  const selRegion = snap.meshSel?.kind === 'region' ? findRegion(arr, snap.meshSel) : null;
  const outer = ed.defaultOuter();

  // Clique no canvas enquanto um material está aberto: as propriedades passam a ser da seleção.
  useEffect(() => {
    if (snap.meshSel && sel.kind === 'material') onSelect({ kind: 'mesh' });
    if (sel.kind === 'boundary' && snap.meshSel?.kind !== 'curves') onSelect({ kind: 'mesh' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.meshSel]);

  const addMat = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = addMaterial(sk);
    if (ed.commit(r.sketch, [`m.material(${q(r.material.name)}, mur=1, sigma=0)`])) {
      setOpen((o) => new Set(o).add('materials'));
      ed.selectCurves([]);
      onSelect({ kind: 'material', id: r.material.id });
    }
  };

  return (
    <ul role="group">
      <li>
        <Row
          icon={Icons.material}
          label={`${t.mesh.materials} (${sk.materials.length})`}
          toggle={{ open: open.has('materials'), onToggle: () => toggle('materials') }}
          onClick={() => toggle('materials')}
          extra={
            <button className="icon-btn tadd" title={t.mesh.addMaterial} aria-label={t.mesh.addMaterial} onClick={addMat}>
              +
            </button>
          }
        />
        {open.has('materials') && (
          <ul role="group">
            {sk.materials.map((m) => (
              <li key={m.id}>
                <Row
                  icon={<Swatch color={m.color} />}
                  label={m.name}
                  selected={sel.kind === 'material' && sel.id === m.id}
                  onClick={() => {
                    ed.selectCurves([]);
                    onSelect({ kind: 'material', id: m.id });
                  }}
                  extra={<span className="crefs">{m.bh ? 'B-H' : m.br ? `Br ${m.br} T` : `μr ${m.mur}`}</span>}
                />
              </li>
            ))}
          </ul>
        )}
      </li>
      <li>
        <Row
          icon={Icons.region}
          label={`${t.mesh.regions} (${arr.regions.length})`}
          toggle={{ open: open.has('regions'), onToggle: () => toggle('regions') }}
          onClick={() => toggle('regions')}
        />
        {open.has('regions') && (
          <ul role="group">
            {!arr.regions.length && <li className="muted tnote">{t.mesh.noRegions}</li>}
            {arr.regions.map((r) => {
              const a = ed.assignOf(regionKey(r));
              const m = a ? mats.get(a.material) : undefined;
              return (
                <li key={r.index}>
                  <Row
                    icon={<Swatch color={m?.color ?? null} />}
                    label={t.mesh.region(r.index + 1)}
                    selected={selRegion === r}
                    onClick={() => {
                      onSelect({ kind: 'mesh' });
                      ed.selectRegion(r.index);
                    }}
                    extra={<span className={`crefs${m ? '' : ' bad'}`}>{m?.name ?? t.mesh.noMaterial}</span>}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </li>
      <li>
        <Row
          icon={Icons.boundary}
          label={`${t.mesh.boundaries} (${sk.boundaries.length + (outer.length ? 1 : 0)})`}
          toggle={{ open: open.has('boundaries'), onToggle: () => toggle('boundaries') }}
          onClick={() => toggle('boundaries')}
        />
        {open.has('boundaries') && (
          <ul role="group">
            {outer.length > 0 && (
              <li>
                <Row
                  icon={Icons.boundary}
                  label={t.mesh.outerDefault}
                  selected={sel.kind === 'boundary' && sel.id === 'outer'}
                  onClick={() => {
                    ed.selectCurves(outer);
                    onSelect({ kind: 'boundary', id: 'outer' });
                  }}
                  extra={<span className="crefs">{outer.length}</span>}
                />
              </li>
            )}
            {sk.boundaries.map((b) => (
              <li key={b.id}>
                <Row
                  icon={Icons.boundary}
                  label={b.name}
                  selected={sel.kind === 'boundary' && sel.id === b.id}
                  onClick={() => {
                    ed.selectCurves(b.curves);
                    onSelect({ kind: 'boundary', id: b.id });
                  }}
                  extra={
                    <>
                      <span className="crefs">{typeName(b.type)}</span>
                      <button
                        className="x"
                        title={t.mesh.removeBoundary}
                        aria-label={`${t.mesh.removeBoundary} ${b.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          ed.meshOp((s) => setBoundary(s, b.curves, null), boundaryCode(b.curves, null));
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
    </ul>
  );
}

/** Propriedades no modo malha: material, região selecionada ou curvas selecionadas. */
export function MeshProps({ ed, sel, onSelect }: { ed: SketchEditor; sel: TreeSel; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  const snap = useEditor(ed);
  const node = sel.kind === 'node' ? ed.sketch.nodes.find((n) => n.id === sel.id) : null;
  let body: JSX.Element;
  if (sel.kind === 'material') body = <MaterialProps ed={ed} id={sel.id} onRemoved={() => onSelect({ kind: 'mesh' })} />;
  else if (snap.meshSel?.kind === 'region') body = <RegionProps ed={ed} />;
  else if (snap.meshSel?.kind === 'curves') body = <CurvesProps ed={ed} ids={snap.meshSel.ids} />;
  else
    body = (
      <section>
        <p className="help-line">{t.mesh.hint}</p>
      </section>
    );
  return (
    <div className="props-body">
      {node && (
        <section>
          <h3>
            {t.tree.meshProps}: {node.name}
          </h3>
          <p className="muted">{t.mesh.nodeHint}</p>
        </section>
      )}
      {body}
    </div>
  );
}

function RegionProps({ ed }: { ed: SketchEditor }) {
  const t = useT();
  const sk = ed.sketch;
  const arr = ed.arrangement();
  const key = ed.meshSel?.kind === 'region' ? ed.meshSel : null;
  const r = key ? findRegion(arr, key) : null;
  if (!r) return null;
  const a = ed.assignOf(regionKey(r));
  const m = a ? sk.materials.find((x) => x.id === a.material) : undefined;
  const f = UNIT_MM[sk.settings.unit] ?? 1;
  const at = pointCode(r.label);
  const set = (patch: Parameters<typeof assignRegion>[3], code: string) => ed.meshOp((s) => assignRegion(s, ed.arrangement(), regionKey(r), patch), `m.region(${at}, ${code})`);
  return (
    <section>
      <h3>{t.mesh.region(r.index + 1)}</h3>
      <label className="field">
        <span>{t.mesh.area}</span>
        <span className="cval">
          {Number((r.area / (f * f)).toPrecision(6))} {sk.settings.unit}²
        </span>
      </label>
      <label className="field">
        <span>{t.mesh.material}</span>
        <select
          aria-label={t.mesh.material}
          value={m?.id ?? ''}
          onChange={(e) => {
            const mm = sk.materials.find((x) => x.id === e.target.value);
            if (mm) set({ material: mm.id }, `material=${q(mm.name)}`);
          }}
        >
          {!m && <option value="">{t.mesh.none}</option>}
          {sk.materials.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {m && (
        <>
          <label className="field">
            <span>{t.mesh.current}</span>
            <LazyInput value={a?.current ?? ''} placeholder="0" ariaLabel={t.mesh.current} onCommit={(v) => set({ current: v.trim() || undefined }, `current=${v.trim() ? q(v.trim()) : 'None'}`)} />
          </label>
          <label className="field">
            <span>{t.mesh.turns}</span>
            <LazyInput
              value={a?.turns !== undefined ? String(a.turns) : ''}
              placeholder="1"
              ariaLabel={t.mesh.turns}
              onCommit={(v) => {
                const n = Number(v);
                if (!v.trim()) set({ turns: undefined }, 'turns=None');
                else if (Number.isFinite(n) && n > 0) set({ turns: n }, `turns=${n}`);
                else ed.flash(t.msg.positive);
              }}
            />
          </label>
          {!!m.br && (
            <label className="field">
              <span>{t.mesh.magnetAngle}</span>
              <LazyInput value={a?.magnetAngle ?? ''} placeholder="0" ariaLabel={t.mesh.magnetAngle} onCommit={(v) => set({ magnetAngle: v.trim() || undefined }, `angle=${v.trim() ? q(v.trim()) : 'None'}`)} />
            </label>
          )}
        </>
      )}
    </section>
  );
}

function CurvesProps({ ed, ids }: { ed: SketchEditor; ids: Id[] }) {
  const t = useT();
  const typeName = useTypeName();
  const sk = ed.sketch;
  const outer = new Set(ed.defaultOuter());
  const typeOf = (id: Id): BoundaryType | '' => sk.boundaries.find((b) => b.curves.includes(id))?.type ?? (outer.has(id) ? 'dirichlet' : '');
  const types = new Set(ids.map(typeOf));
  const current = types.size === 1 ? [...types][0] : 'mixed';
  const isDefault = ids.every((id) => outer.has(id));
  return (
    <section>
      <h3>{t.mesh.boundaries}</h3>
      <p className="muted">{t.mesh.curves(ids.length)}{isDefault ? ` · ${t.mesh.outerDefault}` : ''}</p>
      <label className="field">
        <span>{t.mesh.boundaryType}</span>
        <select
          aria-label={t.mesh.boundaryType}
          value={current}
          onChange={(e) => {
            const v = e.target.value as BoundaryType | '';
            ed.meshOp((s) => setBoundary(s, ids, v || null), boundaryCode(ids, v || null));
          }}
        >
          {current === 'mixed' && <option value="mixed">—</option>}
          <option value="">{t.mesh.none}</option>
          {TYPES.map((k) => (
            <option key={k} value={k} disabled={(k === 'periodic' || k === 'antiperiodic') && ids.length !== 2}>
              {typeName(k)}
            </option>
          ))}
        </select>
      </label>
      {ids.length !== 2 && <p className="help-line">{t.mesh.periodicNeedsTwo}</p>}
    </section>
  );
}

function MaterialProps({ ed, id, onRemoved }: { ed: SketchEditor; id: Id; onRemoved: () => void }) {
  const t = useT();
  const sk = ed.sketch;
  const m = sk.materials.find((x) => x.id === id);
  if (!m) return null;
  const set = (patch: Partial<Material>, code: string) => ed.meshOp((s) => updateMaterial(s, id, patch), `m.material(${q(m.name)}, ${code})`);
  const num = (label: string, key: 'mur' | 'sigma' | 'br', allowEmpty = false) => (
    <label className="field">
      <span>{label}</span>
      <LazyInput
        value={m[key] !== undefined ? String(m[key]) : ''}
        ariaLabel={label}
        placeholder={allowEmpty ? '—' : undefined}
        onCommit={(v) => {
          if (allowEmpty && !v.trim()) return set({ [key]: undefined }, `${key}=0`);
          const n = Number(v.replace(',', '.'));
          if (!Number.isFinite(n) || n < 0 || (key === 'mur' && n <= 0)) return ed.flash(t.msg.positive);
          set({ [key]: n }, `${key}=${n}`);
        }}
      />
    </label>
  );
  return (
    <section>
      <h3>{t.mesh.material}</h3>
      <label className="field">
        <span>{t.mesh.name}</span>
        <LazyInput
          value={m.name}
          ariaLabel={t.mesh.name}
          onCommit={(v) => v.trim() && v.trim() !== m.name && set({ name: v.trim() }, `name=${q(v.trim())}`)}
        />
      </label>
      <label className="field">
        <span>{t.mesh.color}</span>
        <input type="color" aria-label={t.mesh.color} value={m.color} onChange={(e) => set({ color: e.target.value }, `color=${q(e.target.value)}`)} />
      </label>
      {num(t.mesh.mur, 'mur')}
      {num(t.mesh.sigma, 'sigma')}
      {num(t.mesh.br, 'br', true)}
      {m.bh && (
        <label className="field">
          <span>{t.mesh.bh}</span>
          <span className="cval">{t.mesh.bhPoints(m.bh.length)}</span>
        </label>
      )}
      <button
        className="btn danger"
        onClick={() => {
          if (ed.meshOp((s) => removeMaterial(s, id), `m.del_material(${q(m.name)})`)) onRemoved();
        }}
      >
        {t.mesh.removeMaterial}
      </button>
    </section>
  );
}

