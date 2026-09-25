// Malha: árvore na ordem de trabalho (Materiais → Contornos → Regiões → Malhas) e propriedades.
import { useEffect, useState } from 'react';
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { formatLength } from '../cad/expr';
import { assignBoundary, assignRegion, pointCode, regionKey } from '../cad/mesh';
import { autoSize, regionSizes, sizeOf } from '../cad/meshgen';
import { findRegion, type Region } from '../cad/regions';
import { addNode, updateNode, type MeshSub, type TreeSel } from '../cad/tree';
import type { Id, MeshNode } from '../cad/types';
import { T, useT } from '../i18n';
import { LazyInput } from './common';
import { openDrawer } from './drawerStore';
import { Icons } from './icons';
import { BoundaryEditor, MaterialPicker, newBoundary, Swatch } from './Libraries';
import { useEditor } from './useStore';

const UNIT_MM: Record<string, number> = { 'µm': 1e-3, mm: 1, cm: 10, m: 1000, in: 25.4 };

type RowProps = {
  icon: JSX.Element;
  label: string;
  selected?: boolean;
  onClick: () => void;
  extra?: React.ReactNode;
  toggle?: { open: boolean; onToggle: () => void };
  title?: string;
  /** Duplo clique no nome renomeia. */
  onRename?: (name: string) => void;
};

function Row(p: RowProps) {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  return (
    <div className={`tnode${p.selected ? ' on' : ''}`} role="treeitem" aria-selected={!!p.selected} aria-label={p.label} onClick={p.onClick} title={p.title}>
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
      {renaming && p.onRename ? (
        <LazyInput autoFocus value={p.label} ariaLabel={t.tree.rename} onCommit={(n) => p.onRename!(n)} onDone={() => setRenaming(false)} />
      ) : (
        <span
          className="tname"
          title={p.onRename ? t.tree.rename : undefined}
          onDoubleClick={(e) => {
            if (!p.onRename) return;
            e.stopPropagation();
            setRenaming(true);
          }}
        >
          {p.label}
        </span>
      )}
      {p.extra}
    </div>
  );
}

/** O nó de malha (único); cria se o projeto não tiver. */
function ensureMeshNode(ed: SketchEditor): Id | null {
  const n = ed.sketch.nodes.find((x) => x.kind === 'mesh');
  if (n) return n.id;
  const r = addNode(ed.sketch, 'mesh', T().mesh.elementsNode);
  return ed.commit(r.sketch, [r.code]) ? r.node.id : null;
}

/** Nome da região: o dado pelo usuário ou "Região N". */
export function regionName(ed: SketchEditor, r: Region): string {
  return ed.assignOf(regionKey(r))?.name ?? T().mesh.region(r.index + 1);
}

/** Renomeia a região (nome vazio volta ao padrão). */
function renameRegion(ed: SketchEditor, r: Region, name: string) {
  const n = name.trim();
  if (n === regionName(ed, r)) return;
  ed.meshOp((s) => assignRegion(s, ed.arrangement(), regionKey(r), { name: n || undefined }), regionCode(r, `name=${n ? q(n) : 'None'}`));
}

/** Código da atribuição (o ponto interno identifica a região). */
const regionCode = (r: Region, args: string) => `m.region(${pointCode(r.label)}, ${args})`;

/** Filhos de "Malha" na árvore. */
export function MeshTree({ ed, sel, onSelect }: { ed: SketchEditor; sel: TreeSel; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  const snap = useEditor(ed);
  const sk = ed.sketch;
  const [open, setOpen] = useState<Set<string>>(() => new Set(['materials', 'boundaries', 'regions']));
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
  const sub = sel.kind === 'mesh' ? sel.sub : undefined;
  const meshNodes = sk.nodes.filter((n): n is MeshNode => n.kind === 'mesh');
  const unit = sk.settings.unit;

  // Clique no desenho com um contorno aberto: as propriedades passam a ser da nova seleção.
  useEffect(() => {
    if (sel.kind === 'boundary' && snap.meshSel?.kind !== 'curves') onSelect({ kind: 'mesh', sub: 'boundaries' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.meshSel]);

  const section = (key: MeshSub, icon: JSX.Element, label: string, extra?: React.ReactNode) => (
    <Row
      icon={icon}
      label={label}
      selected={sub === key && !snap.meshSel}
      toggle={{ open: open.has(key), onToggle: () => toggle(key) }}
      onClick={() => {
        ed.selectCurves([]);
        onSelect({ kind: 'mesh', sub: key });
        setOpen((o) => new Set(o).add(key));
      }}
      extra={extra}
    />
  );
  const pickRegion = (r: Region, s: MeshSub) => {
    onSelect({ kind: 'mesh', sub: s });
    ed.selectRegion(r.index);
  };
  const sizes = meshNodes[0] ? regionSizes(sk, arr, meshNodes[0]) : [];
  const meshNode = meshNodes[0];
  const mesh = meshNode ? ed.meshes.get(meshNode.id) : undefined;
  const stale = meshNode ? ed.meshStale(meshNode.id) : false;

  return (
    <ul role="group">
      {/* 1. Materiais: uma linha por região; o material vem de uma lista agrupada. */}
      <li>
        {section(
          'materials',
          Icons.material,
          t.mesh.materials,
          <button
            className="icon-btn"
            title={t.mesh.editLibrary}
            aria-label={t.mesh.editLibrary}
            onClick={(e) => {
              e.stopPropagation();
              openDrawer('materials');
            }}
          >
            ⋯
          </button>,
        )}
        {open.has('materials') && (
          <ul role="group">
            {!arr.regions.length && <li className="muted tnote">{t.mesh.noRegions}</li>}
            {arr.regions.map((r) => {
              const a = ed.assignOf(regionKey(r));
              const m = a?.material ? mats.get(a.material) : undefined;
              return (
                <li key={r.index}>
                  <Row
                    icon={<Swatch color={m?.color} />}
                    label={regionName(ed, r)}
                    onRename={(n) => renameRegion(ed, r, n)}
                    selected={selRegion === r && sub !== 'regions'}
                    onClick={() => pickRegion(r, 'materials')}
                    extra={
                      <MaterialPicker
                        ed={ed}
                        value={a?.material}
                        label={`${t.mesh.pickMaterial}: ${regionName(ed, r)}`}
                        onPick={(id) => {
                          const mm = ed.sketch.materials.find((x) => x.id === id);
                          if (mm) ed.meshOp((s) => assignRegion(s, ed.arrangement(), regionKey(r), { material: id }), regionCode(r, `material=${q(mm.name)}`));
                          pickRegion(r, 'materials');
                        }}
                      />
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </li>
      {/* 2. Contornos: propriedades (como no FEMM) e as curvas de cada uma. */}
      <li>
        {section(
          'boundaries',
          Icons.boundary,
          t.mesh.boundaries,
          <button
            className="icon-btn tadd"
            title={t.mesh.newBoundary}
            aria-label={t.mesh.newBoundary}
            onClick={(e) => {
              e.stopPropagation();
              const id = newBoundary(ed);
              if (id) {
                ed.selectCurves([]);
                onSelect({ kind: 'boundary', id });
                setOpen((o) => new Set(o).add('boundaries'));
              }
            }}
          >
            +
          </button>,
        )}
        {open.has('boundaries') && (
          <ul role="group">
            {outer.length > 0 && (
              <li>
                <Row
                  icon={<span className="bswatch b-dirichlet" />}
                  label={t.mesh.outerDefault}
                  selected={sel.kind === 'boundary' && sel.id === 'outer'}
                  onClick={() => {
                    ed.selectCurves(outer);
                    onSelect({ kind: 'boundary', id: 'outer' });
                  }}
                  extra={<span className="crefs">{t.mesh.curvesOf(outer.length)}</span>}
                />
              </li>
            )}
            {sk.boundaries.map((b) => (
              <li key={b.id}>
                <Row
                  icon={<span className={`bswatch b-${b.type}`} />}
                  label={b.name}
                  selected={sel.kind === 'boundary' && sel.id === b.id}
                  onClick={() => {
                    ed.selectCurves(b.curves);
                    onSelect({ kind: 'boundary', id: b.id });
                  }}
                  extra={<span className="crefs">{t.mesh.curvesOf(b.curves.length)}</span>}
                />
              </li>
            ))}
          </ul>
        )}
      </li>
      {/* 3. Regiões: tamanho do elemento por região (automático por padrão). */}
      <li>
        {section('regions', Icons.region, t.mesh.regions)}
        {open.has('regions') && (
          <ul role="group">
            {arr.regions.map((r) => {
              const a = ed.assignOf(regionKey(r));
              const own = sizeOf(sk, a?.meshSize);
              return (
                <li key={r.index}>
                  <Row
                    icon={Icons.region}
                    label={regionName(ed, r)}
                    onRename={(n) => renameRegion(ed, r, n)}
                    selected={selRegion === r && sub === 'regions'}
                    onClick={() => pickRegion(r, 'regions')}
                    extra={<span className="crefs">{own ? formatLength(own, unit) : sizes[r.index] ? `auto · ${formatLength(sizes[r.index], unit)}` : 'auto'}</span>}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </li>
      {/* 4. Elementos (Triangle): nó único, sem filhos — configurações e o botão de gerar. */}
      <li>
        <Row
          icon={Icons.treeMesh}
          label={t.mesh.elementsNode}
          selected={sel.kind === 'node' && sel.id === meshNode?.id}
          onClick={() => {
            const id = ensureMeshNode(ed);
            if (id) onSelect({ kind: 'node', id });
          }}
          extra={
            <>
              <span className={`crefs${stale ? ' bad' : ''}`}>{meshNode && ed.meshBusy === meshNode.id ? t.mesh.generating : mesh ? t.mesh.elements(mesh.elements) : '—'}</span>
              <button
                className="icon-btn"
                title={t.mesh.generate}
                aria-label={t.mesh.generate}
                disabled={ed.meshBusy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  const id = ensureMeshNode(ed);
                  if (!id) return;
                  onSelect({ kind: 'node', id });
                  void ed.generateMesh(id);
                }}
              >
                ▶
              </button>
            </>
          }
        />
      </li>
    </ul>
  );
}

/** Propriedades no modo malha. */
export function MeshProps({ ed, sel, onSelect }: { ed: SketchEditor; sel: TreeSel; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  const snap = useEditor(ed);
  const node = sel.kind === 'node' ? ed.sketch.nodes.find((n): n is MeshNode => n.id === sel.id && n.kind === 'mesh') : undefined;
  const sub = sel.kind === 'mesh' ? sel.sub : undefined;
  let body: JSX.Element;
  if (node) body = <MeshNodeProps ed={ed} node={node} />;
  else if (sel.kind === 'boundary' && sel.id !== 'outer') body = <BoundaryProps ed={ed} id={sel.id} onRemoved={() => onSelect({ kind: 'mesh', sub: 'boundaries' })} />;
  else if (snap.meshSel?.kind === 'region') body = sub === 'regions' ? <RegionSizeProps ed={ed} /> : <RegionMaterialProps ed={ed} />;
  else if (snap.meshSel?.kind === 'curves') body = <CurvesProps ed={ed} ids={snap.meshSel.ids} onNew={(id) => onSelect({ kind: 'boundary', id })} />;
  else
    body = (
      <section>
        <h3>{t.tree.addMesh}</h3>
        {(['materials', 'boundaries', 'regions'] as const).map((k, i) => (
          <p key={k} className={`help-line${sub === k ? ' strong' : ''}`}>
            {[t.mesh.stepMaterials, t.mesh.stepBoundaries, t.mesh.stepRegions][i]}
          </p>
        ))}
        <p className="help-line">{t.mesh.stepMeshes}</p>
      </section>
    );
  return <div className="props-body">{body}</div>;
}

function selectedRegion(ed: SketchEditor): Region | null {
  const key = ed.meshSel?.kind === 'region' ? ed.meshSel : null;
  return key ? findRegion(ed.arrangement(), key) : null;
}

function RegionMaterialProps({ ed }: { ed: SketchEditor }) {
  const t = useT();
  const sk = ed.sketch;
  const r = selectedRegion(ed);
  if (!r) return null;
  const a = ed.assignOf(regionKey(r));
  const m = a?.material ? sk.materials.find((x) => x.id === a.material) : undefined;
  const f = UNIT_MM[sk.settings.unit] ?? 1;
  const set = (patch: Parameters<typeof assignRegion>[3], code: string) => ed.meshOp((s) => assignRegion(s, ed.arrangement(), regionKey(r), patch), regionCode(r, code));
  return (
    <section>
      <h3>{regionName(ed, r)}</h3>
      <label className="field">
        <span>{t.mesh.name}</span>
        <LazyInput value={a?.name ?? ''} placeholder={t.mesh.region(r.index + 1)} ariaLabel={t.mesh.regionName} onCommit={(v) => renameRegion(ed, r, v)} />
      </label>
      <label className="field">
        <span>{t.mesh.area}</span>
        <span className="cval">
          {Number((r.area / (f * f)).toPrecision(6))} {sk.settings.unit}²
        </span>
      </label>
      <div className="field">
        <span>{t.mesh.material}</span>
        <MaterialPicker
          ed={ed}
          value={a?.material}
          onPick={(id) => {
            const mm = ed.sketch.materials.find((x) => x.id === id);
            if (mm) set({ material: id }, `material=${q(mm.name)}`);
          }}
        />
      </div>
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
          <button className="btn" onClick={() => openDrawer('materials', m.id)}>
            {t.mesh.editMaterial}
          </button>
        </>
      )}
    </section>
  );
}

function RegionSizeProps({ ed }: { ed: SketchEditor }) {
  const t = useT();
  const sk = ed.sketch;
  const r = selectedRegion(ed);
  const node = sk.nodes.find((n): n is MeshNode => n.kind === 'mesh');
  if (!r) return null;
  const a = ed.assignOf(regionKey(r));
  // Tamanho automático desta região (ignora o valor próprio dela).
  const withoutOwn = { ...sk, regionAssigns: sk.regionAssigns.filter((x) => x.id !== a?.id) };
  const auto = node ? regionSizes(withoutOwn, ed.arrangement(), node)[r.index] : autoSize(ed.arrangement());
  const own = a?.meshSize ?? '';
  const bad = own.trim() !== '' && sizeOf(sk, own) === null;
  return (
    <section>
      <h3>{regionName(ed, r)}</h3>
      <label className="field">
        <span>{t.mesh.name}</span>
        <LazyInput value={a?.name ?? ''} placeholder={t.mesh.region(r.index + 1)} ariaLabel={t.mesh.regionName} onCommit={(v) => renameRegion(ed, r, v)} />
      </label>
      <label className="field">
        <span>{t.mesh.meshSize}</span>
        <LazyInput
          value={own}
          className={bad ? 'bad' : ''}
          placeholder={t.mesh.auto(formatLength(auto, sk.settings.unit))}
          ariaLabel={t.mesh.meshSize}
          onCommit={(v) =>
            ed.meshOp((s) => assignRegion(s, ed.arrangement(), regionKey(r), { meshSize: v.trim() || undefined }), `m.mesh_size(${pointCode(r.label)}, ${v.trim() ? q(v.trim()) : '"auto"'})`)
          }
        />
      </label>
      <p className="help-line">{t.mesh.sizeHint}</p>
    </section>
  );
}

function BoundaryProps({ ed, id, onRemoved }: { ed: SketchEditor; id: Id; onRemoved: () => void }) {
  const t = useT();
  return (
    <section>
      <h3>{t.mesh.boundary}</h3>
      <BoundaryEditor ed={ed} id={id} onRemoved={onRemoved} />
    </section>
  );
}

/** Curvas selecionadas no desenho: escolher a propriedade de contorno. */
function CurvesProps({ ed, ids, onNew }: { ed: SketchEditor; ids: Id[]; onNew: (id: Id) => void }) {
  const t = useT();
  const sk = ed.sketch;
  const outer = new Set(ed.defaultOuter());
  const of = (c: Id) => sk.boundaries.find((b) => b.curves.includes(c))?.id ?? (outer.has(c) ? 'outer' : '');
  const kinds = new Set(ids.map(of));
  const current = kinds.size === 1 ? [...kinds][0] : 'mixed';
  const code = (ref: string | null) => `m.boundary([${ids.map(q).join(', ')}], ${ref ? q(ref) : 'None'})`;
  return (
    <section>
      <h3>{t.mesh.boundaries}</h3>
      <p className="muted">{t.mesh.curves(ids.length)}</p>
      <label className="field">
        <span>{t.mesh.boundary}</span>
        <select
          aria-label={t.mesh.boundary}
          value={current}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__new') {
              const nid = newBoundary(ed);
              const name = ed.sketch.boundaries.find((b) => b.id === nid)?.name ?? null;
              if (nid && ed.meshOp((s) => assignBoundary(s, ids, nid), code(name))) onNew(nid);
              return;
            }
            const b = sk.boundaries.find((x) => x.id === v);
            ed.meshOp((s) => assignBoundary(s, ids, b ? b.id : null), code(b ? b.name : null));
          }}
        >
          {current === 'mixed' && <option value="mixed">—</option>}
          {current === 'outer' && <option value="outer">{t.mesh.outerDefault}</option>}
          {current !== 'outer' && <option value="">{t.mesh.unassigned}</option>}
          {sk.boundaries.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} · {t.mesh[b.type]}
            </option>
          ))}
          <option value="__new">{t.mesh.newBoundaryFor}</option>
        </select>
      </label>
    </section>
  );
}

function MeshNodeProps({ ed, node }: { ed: SketchEditor; node: MeshNode }) {
  const t = useT();
  const sk = ed.sketch;
  const m = ed.meshes.get(node.id);
  const stale = ed.meshStale(node.id);
  const auto = autoSize(ed.arrangement());
  const set = (patch: Partial<MeshNode>, code: string) => ed.commit(updateNode(sk, node.id, patch), [code]);
  const badSize = !!node.size?.trim() && sizeOf(sk, node.size) === null;
  return (
    <section>
      <h3>{t.mesh.elementsNode}</h3>
      <label className="field">
        <span>{t.mesh.globalSize}</span>
        <LazyInput
          value={node.size ?? ''}
          className={badSize ? 'bad' : ''}
          placeholder={t.mesh.auto(formatLength(auto, sk.settings.unit))}
          ariaLabel={t.mesh.globalSize}
          onCommit={(v) => set({ size: v.trim() }, `m.settings(${q(node.id)}, size=${v.trim() ? q(v.trim()) : '"auto"'})`)}
        />
      </label>
      <label className="field">
        <span>{t.mesh.minAngle}</span>
        <LazyInput
          value={String(node.minAngle ?? 30)}
          ariaLabel={t.mesh.minAngle}
          onCommit={(v) => {
            const n = Number(v.replace(',', '.'));
            if (!(n >= 0 && n <= 34)) return ed.flash('0 – 34°');
            set({ minAngle: n }, `m.settings(${q(node.id)}, min_angle=${n})`);
          }}
        />
      </label>
      <p className="help-line">{t.mesh.minAngleHelp}</p>
      <button className="btn primary" disabled={ed.meshBusy !== null} onClick={() => void ed.generateMesh(node.id)}>
        {ed.meshBusy === node.id ? t.mesh.generating : `▶ ${t.mesh.generate}`}
      </button>
      <p className={stale ? 'err-text' : 'muted'}>{m ? (stale ? t.mesh.stale : t.mesh.stats(m.nodes, m.elements, m.minAngle, m.ms)) : t.mesh.notGenerated}</p>
      {m && stale && <p className="muted">{t.mesh.stats(m.nodes, m.elements, m.minAngle, m.ms)}</p>}
      <p className="help-line">{t.mesh.mesher}</p>
    </section>
  );
}
