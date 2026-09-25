// Bibliotecas do projeto: materiais (agrupados) e propriedades de contorno (como no FEMM).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { addBoundaryDef, addMaterial, assignBoundary, duplicateMaterial, removeBoundaryDef, removeMaterial, updateBoundaryDef, updateMaterial } from '../cad/mesh';
import { parseMatlib, type FemmMaterial } from '../io/femm';
import { materialLine } from '../cad/script';
import { BOUNDARY_TYPES, BOUNDARY_UNSUPPORTED, boundaryColor, OUTER_BOUNDARY, DEFAULT_MATERIALS, MATERIAL_GROUPS, type BoundaryType, type Id, type Material, type MaterialGroup } from '../cad/types';
import { displayName, useT } from '../i18n';
import { LazyInput } from './common';
import { openDrawer } from './drawerStore';
import { openTab } from './tabsStore';
import { Icons } from './icons';


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
  // Material da biblioteca original: pode voltar ao padrão.
  const orig = DEFAULT_MATERIALS.find((d) => d.id === id);
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
      <BHEditor ed={ed} m={m} />
      <div className="lib-actions">
        <button
          className="btn secondary"
          onClick={() => {
            const r = duplicateMaterial(ed.sketch, id);
            if (r && ed.commit(r.sketch, [`m.duplicate_material(${q(m.name)})`])) openDrawer('materials', r.material.id);
          }}
        >
          {Icons.copy} {t.mesh.duplicate}
        </button>
        {orig && (
          <button
            className="btn secondary"
            title={t.mesh.restoreHint}
            onClick={() => ed.meshOp((s) => updateMaterial(s, id, { ...orig, bh: orig.bh?.map((p) => [...p] as [number, number]) }), `m.restore_material(${q(m.name)})`)}
          >
            {t.mesh.restore}
          </button>
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
        <FemmImportButton ed={ed} />
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

/** Cor padrão dos materiais importados, por grupo. */
const GROUP_COLOR: Record<MaterialGroup, string> = { air: '#dfe9f3', conductor: '#e8a15c', steel: '#9aa5b1', magnet: '#c77dd6', custom: '#b5d98a' };

/** "Importar do FEMM…": lê um matlib.dat escolhido pelo usuário e importa os materiais marcados. */
function FemmImportButton({ ed }: { ed: SketchEditor }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [lib, setLib] = useState<FemmMaterial[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn secondary"
        title={t.mesh.femmHint}
        onClick={async () => setLib((await import('../data/femm-matlib.json')).default as FemmMaterial[])}
      >
        {t.mesh.femmImport}
      </button>
      <input
        ref={input}
        type="file"
        accept=".dat,text/plain"
        hidden
        aria-label={t.mesh.femmImport}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const list = parseMatlib(await f.text());
          if (!list.length) setErr(t.mesh.femmEmpty);
          else setLib(list);
        }}
      />
      {err && createPortal(
        <div className="modal-back" onClick={() => setErr(null)}>
          <div className="modal" role="alertdialog" onClick={(e) => e.stopPropagation()}>
            <p className="err-text">{err}</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setErr(null)}>
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {lib && createPortal(<FemmImportModal ed={ed} lib={lib} onClose={() => setLib(null)} onFile={() => input.current?.click()} />, document.body)}
    </>
  );
}

function FemmImportModal({ ed, lib, onClose, onFile }: { ed: SketchEditor; lib: FemmMaterial[]; onClose: () => void; onFile: () => void }) {
  const t = useT();
  const have = new Set(ed.sketch.materials.map((m) => m.name));
  const [sel, setSel] = useState<Set<number>>(() => new Set());
  const [filter, setFilter] = useState('');
  // Materiais por pasta (caminho completo), na ordem do arquivo.
  const folders = useMemo(() => {
    const map = new Map<string, number[]>();
    lib.forEach((m, i) => {
      const k = m.path.join(' / ') || '—';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    });
    return [...map];
  }, [lib]);
  const f = filter.trim().toLowerCase();
  const visible = (i: number) => !f || lib[i].material.name.toLowerCase().includes(f) || lib[i].path.join(' ').toLowerCase().includes(f);
  const toggle = (ids: number[], on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      for (const i of ids) {
        if (on) n.add(i);
        else n.delete(i);
      }
      return n;
    });
  const doImport = () => {
    let sk = ed.sketch;
    const code: string[] = [];
    for (const i of [...sel].sort((a, b) => a - b)) {
      const { name, ...src } = lib[i].material;
      const r = addMaterial(sk, name, { ...src, color: GROUP_COLOR[src.group ?? 'custom'] }, src.group);
      sk = r.sketch;
      code.push(materialLine(r.material));
    }
    if (code.length && ed.commit(sk, code)) onClose();
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal femm-modal" role="dialog" aria-label={t.mesh.femmImport} onClick={(e) => e.stopPropagation()}>
        <h3>{t.mesh.femmTitle(lib.length)}</h3>
        <p className="hint">{t.mesh.femmNote}</p>
        <input className="femm-filter" placeholder={t.mesh.femmFilter} aria-label={t.mesh.femmFilter} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="femm-list">
          {folders.map(([name, ids]) => {
            const shown = ids.filter(visible);
            if (!shown.length) return null;
            const all = shown.every((i) => sel.has(i));
            return (
              <div key={name} className="femm-folder">
                <label className="femm-row folder">
                  <input type="checkbox" checked={all} onChange={(e) => toggle(shown, e.target.checked)} />
                  <b>{name}</b> <span className="crefs">{shown.length}</span>
                </label>
                {shown.map((i) => {
                  const m = lib[i].material;
                  return (
                    <label key={i} className="femm-row">
                      <input type="checkbox" checked={sel.has(i)} onChange={(e) => toggle([i], e.target.checked)} />
                      <Swatch color={GROUP_COLOR[m.group ?? 'custom']} /> {m.name}
                      {have.has(m.name) && <span className="crefs">{t.mesh.femmExists}</span>}
                      <span className="crefs">{materialSummary(m as Material)}</span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn secondary" title={t.mesh.femmHint} onClick={onFile}>
            {t.mesh.femmFile}
          </button>
          <button className="btn secondary" onClick={() => toggle(lib.map((_, i) => i).filter(visible), true)}>
            {t.mesh.femmAll}
          </button>
          <button className="btn secondary" onClick={onClose}>
            {t.mesh.femmCancel}
          </button>
          <button className="btn" disabled={!sel.size} onClick={doImport}>
            {t.mesh.femmDo(sel.size)}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Editor de uma propriedade de contorno. */
export function BoundaryEditor({ ed, id, onRemoved }: { ed: SketchEditor; id: Id; onRemoved?: () => void }) {
  const t = useT();
  const b = ed.sketch.boundaries.find((x) => x.id === id);
  if (!b) return null;
  const set = (patch: Parameters<typeof updateBoundaryDef>[2], code: string) => ed.meshOp((s) => updateBoundaryDef(s, id, patch), `m.boundary_def(${q(b.name)}, ${code})`);
  // Campo de um parâmetro (expressão); desabilitado quando não vale para o tipo, como no FEMM.
  type Key = 'value' | 'a1' | 'a2' | 'phi' | 'mu' | 'sigma' | 'c0' | 'c1' | 'innerAngle' | 'outerAngle';
  const kwOf: Record<Key, string> = { value: 'value', a1: 'a1', a2: 'a2', phi: 'phi', mu: 'mu', sigma: 'sigma', c0: 'c0', c1: 'c1', innerAngle: 'inner_angle', outerAngle: 'outer_angle' };
  const param = (k: Key, label: string, on: boolean) => (
    <label className={`field bc-param${on ? '' : ' off'}`}>
      <span>{label}</span>
      {on ? (
        <LazyInput value={b[k] ?? ''} placeholder="0" ariaLabel={label} onCommit={(v) => set({ [k]: v.trim() || undefined }, `${kwOf[k]}=${q(v.trim() || '0')}`)} />
      ) : (
        <input disabled value="" placeholder="0" aria-label={label} />
      )}
    </label>
  );
  const ty = b.type;
  return (
    <div className="lib-editor">
      <label className="field">
        <span>{t.mesh.name}</span>
        <LazyInput value={b.name} ariaLabel={t.mesh.name} onCommit={(v) => v.trim() && v.trim() !== b.name && set({ name: v.trim() }, `name=${q(v.trim())}`)} />
      </label>
      <label className="field">
        <span>{t.mesh.bcType}</span>
        <select aria-label={t.mesh.boundaryType} value={ty} onChange={(e) => set({ type: e.target.value as BoundaryType }, `type=${q(e.target.value)}`)}>
          {BOUNDARY_TYPES.map((k) => (
            <option key={k} value={k}>
              {t.mesh[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t.mesh.bcColor}</span>
        <span className="bc-color">
          <input type="color" aria-label={t.mesh.bcColor} value={boundaryColor(b)} onChange={(e) => set({ color: e.target.value }, `color=${q(e.target.value)}`)} />
          {b.color && (
            <button className="btn secondary small" onClick={() => set({ color: undefined }, 'color=None')}>
              {t.mesh.bcColorReset}
            </button>
          )}
        </span>
      </label>
      <p className="help-line">{t.mesh.boundaryHelp[ty]}</p>
      {b.id === OUTER_BOUNDARY && ty === 'dirichlet' && <p className="help-line">{t.mesh.outerIncluded(ed.defaultOuter().length)}</p>}
      {BOUNDARY_UNSUPPORTED.includes(ty) && <p className="err-text">{t.mesh.bcUnsupported}</p>}
      <fieldset className="bc-group">
        <legend>{t.mesh.bcPrescribed}</legend>
        {param('value', 'A0 (Wb/m)', ty === 'dirichlet')}
        {param('a1', 'A1 (Wb/m²)', ty === 'dirichlet')}
        {param('a2', 'A2 (Wb/m²)', ty === 'dirichlet')}
        {param('phi', 'φ (°)', ty === 'dirichlet')}
      </fieldset>
      <fieldset className="bc-group">
        <legend>{t.mesh.bcMixed}</legend>
        {param('c0', 'c0', ty === 'mixed')}
        {param('c1', 'c1', ty === 'mixed')}
      </fieldset>
      <fieldset className="bc-group">
        <legend>{t.mesh.bcSkin}</legend>
        {param('mu', t.mesh.bcMu, ty === 'skin')}
        {param('sigma', t.mesh.bcSigma, ty === 'skin')}
      </fieldset>
      <fieldset className="bc-group">
        <legend>{t.mesh.bcAirGap}</legend>
        {param('innerAngle', t.mesh.bcInner, ty === 'periodicAirGap' || ty === 'antiperiodicAirGap')}
        {param('outerAngle', t.mesh.bcOuter, ty === 'periodicAirGap' || ty === 'antiperiodicAirGap')}
      </fieldset>
      {(ty === 'periodic' || ty === 'antiperiodic') && <p className="help-line">{t.mesh.periodicNeedsTwo}</p>}
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
  const outer = ed.defaultOuter();
  const hasOuterB = ed.sketch.boundaries.some((b) => b.id === OUTER_BOUNDARY && b.type === 'dirichlet');
  return (
    <section>
      <div className="lib-head">
        <h3>{t.mesh.libBoundaries}</h3>
        <button className="btn" onClick={() => onFocus(newBoundary(ed))}>
          + {t.mesh.newBoundary}
        </button>
      </div>
      <ul className="lib-list" role="listbox" aria-label={t.mesh.libBoundaries}>
        {outer.length > 0 && !hasOuterB && (
          <li>
            <button role="option" aria-selected={focus === 'outer'} className={`lib-item${focus === 'outer' ? ' on' : ''}`} onClick={() => onFocus(focus === 'outer' ? null : 'outer')}>
              <span className="bswatch b-dirichlet" /> <span className="tname">{t.mesh.outerDefault}</span>
              <span className="crefs">{t.mesh.curvesOf(outer.length)}</span>
            </button>
            {focus === 'outer' && (
              <div className="lib-editor">
                <p className="help-line">{t.mesh.outerHelp}</p>
                <button
                  className="btn"
                  onClick={() => {
                    const r = addBoundaryDef(ed.sketch, 'dirichlet', t.mesh.outerName);
                    const next = assignBoundary(r.sketch, outer, r.boundary.id);
                    if (ed.commit(next, [`m.boundary_def(${q(r.boundary.name)}, type="dirichlet")`, `m.boundary([${outer.map(q).join(', ')}], ${q(r.boundary.name)})`])) onFocus(r.boundary.id);
                  }}
                >
                  {t.mesh.outerMakeEditable}
                </button>
              </div>
            )}
          </li>
        )}
        {ed.sketch.boundaries.map((b) => (
          <li key={b.id}>
            <button role="option" aria-selected={focus === b.id} className={`lib-item${focus === b.id ? ' on' : ''}`} onClick={() => onFocus(focus === b.id ? null : b.id)}>
              <span className="bswatch" style={{ background: boundaryColor(b) }} /> <span className="tname">{displayName(b.name)}</span>
              <span className="crefs">
                {t.mesh[b.type]} · {t.mesh.curvesOf(b.curves.length + (b.id === OUTER_BOUNDARY && hasOuterB ? outer.length : 0))}
              </span>
            </button>
            {focus === b.id && <BoundaryEditor ed={ed} id={b.id} onRemoved={() => onFocus(null)} />}
          </li>
        ))}
      </ul>
      <p className="help-line">{t.mesh.stepBoundaries}</p>
    </section>
  );
}

/** Curva B-H do material: gráfico, tabela editável, incluir/remover pontos, criar/remover a curva. */
function BHEditor({ ed, m }: { ed: SketchEditor; m: Material }) {
  const t = useT();
  const code = (bh: [number, number][] | undefined) => `m.material(${q(m.name)}, bh=${bh ? `[${bh.map((p) => `(${p[0]}, ${p[1]})`).join(', ')}]` : 'None'})`;
  const save = (bh: [number, number][] | undefined) => {
    if (bh) {
      // Curva válida: H e B crescentes, começando em (0, 0).
      for (let i = 1; i < bh.length; i++)
        if (!(bh[i][0] > bh[i - 1][0]) || !(bh[i][1] >= bh[i - 1][1])) return ed.flash(t.mesh.bhMonotonic);
    }
    ed.meshOp((s) => updateMaterial(s, m.id, { bh }), code(bh));
  };
  if (!m.bh)
    return (
      <div className="field">
        <span>{t.mesh.bh}</span>
        <button
          className="btn secondary"
          onClick={() => {
            // Curva inicial: reta com o μr atual até 1 T, com um joelho simples.
            const mu = 4e-7 * Math.PI * m.mur;
            const pts: [number, number][] = [[0, 0]];
            for (const b of [0.5, 1.0, 1.4, 1.6, 1.8]) pts.push([Math.round((b / mu) * (b > 1 ? (b - 0.4) ** 3 * 4 : 1)), b]);
            save(pts);
            openTab({ kind: 'bh', material: m.id });
          }}
        >
          {t.mesh.bhAdd}
        </button>
      </div>
    );
  return (
    <div className="bh">
      <div className="field">
        <span>{t.mesh.bh}</span>
        <span className="cval">{t.mesh.bhPoints(m.bh.length)}</span>
      </div>
      <button className="btn" onClick={() => openTab({ kind: 'bh', material: m.id })}>
        {t.mesh.bhOpen}
      </button>
      <button className="btn danger" onClick={() => save(undefined)}>
        {t.mesh.bhRemove}
      </button>
      <p className="help-line">{t.mesh.bhHelp}</p>
    </div>
  );
}
