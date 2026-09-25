// Bibliotecas do projeto: materiais (agrupados) e propriedades de contorno (como no FEMM).
import { useEffect, useRef, useState } from 'react';
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { addBoundaryDef, addMaterial, removeBoundaryDef, removeMaterial, updateBoundaryDef, updateMaterial } from '../cad/mesh';
import { MATERIAL_GROUPS, type BoundaryType, type Id, type Material, type MaterialGroup } from '../cad/types';
import { useT } from '../i18n';
import { LazyInput } from './common';
import { openDrawer } from './drawerStore';

export const BOUNDARY_TYPES: BoundaryType[] = ['dirichlet', 'neumann', 'periodic', 'antiperiodic'];

export const Swatch = ({ color }: { color: string | null | undefined }) => (
  <span className="swatch" style={color ? { background: color } : undefined} aria-hidden="true" />
);

/** Materiais por grupo, na ordem da biblioteca. */
export function groupedMaterials(list: Material[]): [MaterialGroup, Material[]][] {
  return MATERIAL_GROUPS.map((g) => [g, list.filter((m) => (m.group ?? 'custom') === g)] as [MaterialGroup, Material[]]).filter(([, l]) => l.length);
}

export const materialSummary = (m: Material) => (m.bh ? 'B-H' : m.br ? `Br ${m.br} T` : `μr ${m.mur}`);

/**
 * Lista suspensa de materiais agrupados, com "Novo material" e "Editar biblioteca".
 * `onPick` recebe o id escolhido (ou o do material recém-criado).
 */
export function MaterialPicker({ ed, value, onPick, label }: { ed: SketchEditor; value?: Id; onPick: (id: Id) => void; label?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const sk = ed.sketch;
  const cur = value ? sk.materials.find((m) => m.id === value) : undefined;
  const pick = (id: Id) => {
    setOpen(false);
    onPick(id);
  };
  return (
    <div className="mat-picker" ref={ref} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <button className={`mat-chip${cur ? '' : ' none'}`} aria-label={label ?? t.mesh.pickMaterial} title={t.mesh.pickMaterial} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Swatch color={cur?.color} />
        <span>{cur?.name ?? t.mesh.noMaterial}</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="menu mat-menu" role="menu">
          {groupedMaterials(sk.materials).map(([g, list]) => (
            <div key={g} role="group" aria-label={t.mesh.groups[g]}>
              <div className="menu-label">{t.mesh.groups[g]}</div>
              {list.map((m) => (
                <button key={m.id} role="menuitemradio" aria-checked={m.id === value} className={m.id === value ? 'on' : ''} onClick={() => pick(m.id)}>
                  <Swatch color={m.color} /> {m.name}
                  <span className="crefs">{materialSummary(m)}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="menu-sep" />
          <button
            role="menuitem"
            onClick={() => {
              const r = addMaterial(ed.sketch);
              if (ed.commit(r.sketch, [`m.material(${q(r.material.name)}, mur=1, sigma=0)`])) {
                pick(r.material.id);
                openDrawer('materials', r.material.id);
              }
            }}
          >
            + {t.mesh.addMaterial}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openDrawer('materials', value ?? null);
            }}
          >
            {t.mesh.editLibrary}
          </button>
        </div>
      )}
    </div>
  );
}

/** Editor de um material (nome, grupo, cor, μr, σ, Br). */
export function MaterialEditor({ ed, id, onRemoved }: { ed: SketchEditor; id: Id; onRemoved?: () => void }) {
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
    <div className="lib-editor">
      <label className="field">
        <span>{t.mesh.name}</span>
        <LazyInput value={m.name} ariaLabel={t.mesh.name} onCommit={(v) => v.trim() && v.trim() !== m.name && set({ name: v.trim() }, `name=${q(v.trim())}`)} />
      </label>
      <label className="field">
        <span>{t.mesh.group}</span>
        <select aria-label={t.mesh.group} value={m.group ?? 'custom'} onChange={(e) => set({ group: e.target.value as MaterialGroup }, `group=${q(e.target.value)}`)}>
          {MATERIAL_GROUPS.map((g) => (
            <option key={g} value={g}>
              {t.mesh.groups[g]}
            </option>
          ))}
        </select>
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
          if (ed.meshOp((s) => removeMaterial(s, id), `m.del_material(${q(m.name)})`)) onRemoved?.();
        }}
      >
        {t.mesh.removeMaterial}
      </button>
    </div>
  );
}

/** Aba "Materiais" da gaveta: lista agrupada + editor do selecionado. */
export function MaterialLibrary({ ed, focus, onFocus }: { ed: SketchEditor; focus: Id | null; onFocus: (id: Id | null) => void }) {
  const t = useT();
  const sk = ed.sketch;
  return (
    <section>
      <div className="lib-head">
        <h3>{t.mesh.libMaterials}</h3>
        <button
          className="btn"
          onClick={() => {
            const r = addMaterial(sk);
            if (ed.commit(r.sketch, [`m.material(${q(r.material.name)}, mur=1, sigma=0)`])) onFocus(r.material.id);
          }}
        >
          + {t.mesh.addMaterial}
        </button>
      </div>
      <ul className="lib-list" role="listbox" aria-label={t.mesh.libMaterials}>
        {groupedMaterials(sk.materials).map(([g, list]) => (
          <li key={g}>
            <div className="menu-label">{t.mesh.groups[g]}</div>
            <ul>
              {list.map((m) => (
                <li key={m.id}>
                  <button role="option" aria-selected={focus === m.id} className={`lib-item${focus === m.id ? ' on' : ''}`} onClick={() => onFocus(focus === m.id ? null : m.id)}>
                    <Swatch color={m.color} /> <span className="tname">{m.name}</span>
                    <span className="crefs">{materialSummary(m)}</span>
                  </button>
                  {focus === m.id && <MaterialEditor ed={ed} id={m.id} onRemoved={() => onFocus(null)} />}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Editor de uma propriedade de contorno. */
export function BoundaryEditor({ ed, id, onRemoved }: { ed: SketchEditor; id: Id; onRemoved?: () => void }) {
  const t = useT();
  const b = ed.sketch.boundaries.find((x) => x.id === id);
  if (!b) return null;
  const set = (patch: Parameters<typeof updateBoundaryDef>[2], code: string) => ed.meshOp((s) => updateBoundaryDef(s, id, patch), `m.boundary_def(${q(b.name)}, ${code})`);
  return (
    <div className="lib-editor">
      <label className="field">
        <span>{t.mesh.name}</span>
        <LazyInput value={b.name} ariaLabel={t.mesh.name} onCommit={(v) => v.trim() && v.trim() !== b.name && set({ name: v.trim() }, `name=${q(v.trim())}`)} />
      </label>
      <label className="field">
        <span>{t.mesh.boundaryType}</span>
        <select aria-label={t.mesh.boundaryType} value={b.type} onChange={(e) => set({ type: e.target.value as BoundaryType }, `type=${q(e.target.value)}`)}>
          {BOUNDARY_TYPES.map((k) => (
            <option key={k} value={k}>
              {t.mesh[k]}
            </option>
          ))}
        </select>
      </label>
      {b.type === 'dirichlet' && (
        <label className="field">
          <span>{t.mesh.boundaryValue}</span>
          <LazyInput value={b.value ?? ''} placeholder="0" ariaLabel={t.mesh.boundaryValue} onCommit={(v) => set({ value: v.trim() || undefined }, `value=${q(v.trim() || '0')}`)} />
        </label>
      )}
      {(b.type === 'periodic' || b.type === 'antiperiodic') && <p className="help-line">{t.mesh.periodicNeedsTwo}</p>}
      <p className="muted">{t.mesh.curvesOf(b.curves.length)}</p>
      <button
        className="btn danger"
        onClick={() => {
          if (ed.meshOp((s) => removeBoundaryDef(s, id), `m.boundary([${b.curves.map(q).join(', ')}], None)`)) onRemoved?.();
        }}
      >
        {t.mesh.removeBoundary}
      </button>
    </div>
  );
}

/** Cria uma propriedade de contorno e devolve o id. */
export function newBoundary(ed: SketchEditor, type: BoundaryType = 'dirichlet'): Id | null {
  const r = addBoundaryDef(ed.sketch, type);
  return ed.commit(r.sketch, [`m.boundary_def(${q(r.boundary.name)}, type=${q(type)})`]) ? r.boundary.id : null;
}

/** Aba "Contornos" da gaveta. */
export function BoundaryLibrary({ ed, focus, onFocus }: { ed: SketchEditor; focus: Id | null; onFocus: (id: Id | null) => void }) {
  const t = useT();
  return (
    <section>
      <div className="lib-head">
        <h3>{t.mesh.libBoundaries}</h3>
        <button className="btn" onClick={() => onFocus(newBoundary(ed))}>
          + {t.mesh.newBoundary}
        </button>
      </div>
      <ul className="lib-list" role="listbox" aria-label={t.mesh.libBoundaries}>
        {ed.sketch.boundaries.map((b) => (
          <li key={b.id}>
            <button role="option" aria-selected={focus === b.id} className={`lib-item${focus === b.id ? ' on' : ''}`} onClick={() => onFocus(focus === b.id ? null : b.id)}>
              <span className={`bswatch b-${b.type}`} /> <span className="tname">{b.name}</span>
              <span className="crefs">{t.mesh.curvesOf(b.curves.length)}</span>
            </button>
            {focus === b.id && <BoundaryEditor ed={ed} id={b.id} onRemoved={() => onFocus(null)} />}
          </li>
        ))}
      </ul>
      <p className="help-line">{t.mesh.stepBoundaries}</p>
    </section>
  );
}
