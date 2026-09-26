import type { SketchEditor, Tool } from '../cad/editor';
import { constraintsFor, type GeomTool } from '../cad/ops';
import { useEffect, useRef, useState } from 'react';
import { Icons } from './icons';
import { TransformPopover } from './TransformPopover';
import { ModifyTools, SymmetryPopover } from './ModifyTools';
import { useDocVersion, useEditor } from './useStore';
import { useT } from '../i18n';

type ToolItem = { tool: Tool; key: string };
/** Itens da barra: ferramenta simples ou família com variantes (botão com menu, como no Onshape). */
const TOOLS: (ToolItem | { family: 'line' | 'rect' | 'arc'; variants: ToolItem[] })[] = [
  { tool: 'select', key: 'S / Esc' },
  { tool: 'measure', key: 'U' },
  {
    family: 'line',
    variants: [
      { tool: 'line', key: 'L' },
      { tool: 'cline', key: 'Shift+L' },
    ],
  },
  {
    family: 'rect',
    variants: [
      { tool: 'rect', key: 'R' },
      { tool: 'rectc', key: 'Shift+R' },
    ],
  },
  { tool: 'circle', key: 'C' },
  {
    family: 'arc',
    variants: [
      { tool: 'arc3', key: 'A' },
      { tool: 'arcc', key: 'Shift+A' },
    ],
  },
  { tool: 'point', key: 'P' },
];

/** Ferramentas que editam o desenho existente: ficam junto com offset, espelho e padrões. */
const EDIT_TOOLS: ToolItem[] = [
  { tool: 'dimension', key: 'D' },
  { tool: 'trim', key: 'X' },
];

const GEOMS: { tool: GeomTool; key?: string }[] = [
  { tool: 'coincident', key: 'I' },
  { tool: 'horizontal', key: 'H' },
  { tool: 'vertical', key: 'V' },
  { tool: 'parallel' },
  { tool: 'perpendicular' },
  { tool: 'tangent', key: 'T' },
  { tool: 'equal', key: 'E' },
  { tool: 'midpoint', key: 'M' },
  { tool: 'symmetric' },
  { tool: 'concentric' },
];

/** Botão de família de ferramentas: mostra a última variante usada; a seta abre a lista. */
function ToolFamily({ ed, variants, current }: { ed: SketchEditor; variants: ToolItem[]; current: Tool }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<Tool>(variants[0].tool);
  const ref = useRef<HTMLSpanElement>(null);
  const active = variants.find((v) => v.tool === current);
  // Atalho de teclado também atualiza a variante mostrada.
  useEffect(() => {
    if (active && active.tool !== last) setLast(active.tool);
  }, [active, last]);
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
  const shown = variants.find((v) => v.tool === last) ?? variants[0];
  const pick = (v: ToolItem) => {
    setLast(v.tool);
    setOpen(false);
    ed.setTool(v.tool);
  };
  return (
    <span className="tb-family" ref={ref}>
      <Btn icon={Icons[shown.tool]} label={t.tools[shown.tool]} kbd={shown.key} active={!!active} onClick={() => ed.setTool(shown.tool)} />
      <button className={`tb-caret${open ? ' open' : ''}`} aria-label={`${t.tools[shown.tool]}: ${t.tools.variants}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      {open && (
        <div className="menu tool-menu" role="menu">
          {variants.map((v) => (
            <button key={v.tool} role="menuitem" className={v.tool === current ? 'on' : ''} onClick={() => pick(v)}>
              <span className="mi-icon">{Icons[v.tool]}</span>
              <span className="mi-label">{t.tools[v.tool]}</span>
              <kbd>{v.key}</kbd>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** Botão com tooltip próprio (nome + atalho). */
export function Btn(props: { icon: JSX.Element; label: string; kbd?: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`tb-btn${props.active ? ' active' : ''}`} aria-label={props.label} disabled={props.disabled} onClick={props.onClick}>
      {props.icon}
      <span className="tip" role="tooltip">
        {props.label}
        {props.kbd && <kbd>{props.kbd}</kbd>}
      </span>
    </button>
  );
}

export function Toolbar({ ed }: { ed: SketchEditor }) {
  const snap = useEditor(ed);
  const t = useT();
  const [moveOpen, setMoveOpen] = useState(false);
  const [symOpen, setSymOpen] = useState(false);
  useEffect(() => {
    // Atalho G abre o popover (quando há seleção).
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== 'g' || e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      if (ed.selection.length) setMoveOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed]);
  useEffect(() => {
    if (!snap.selection.length) setMoveOpen(false);
  }, [snap.selection.length]);
  useDocVersion(ed.doc);
  const sk = ed.sketch;
  const sel = snap.selection.filter((id) => sk.entities[id]);
  const all = ed.selectedEntities;
  const hasCurves = all.some((id) => sk.entities[id]?.type !== 'point');
  const hasGroup = snap.selection.some((id) => sk.groups.some((g) => g.id === id));
  const twoPoints = sel.length === 2 && snap.selection.length === 2 && sel.every((id) => sk.entities[id]?.type === 'point');
  return (
    <div className="toolbar" role="toolbar">
      <div className="tb-group">
        <Btn icon={Icons.undo} label={t.tools.undo} kbd="Ctrl+Z" disabled={!ed.doc.canUndo} onClick={() => ed.undo()} />
        <Btn icon={Icons.redo} label={t.tools.redo} kbd="Ctrl+Shift+Z" disabled={!ed.doc.canRedo} onClick={() => ed.redo()} />
      </div>
      <div className="tb-group">
        {TOOLS.map((x) =>
          'family' in x ? (
            <ToolFamily key={x.family} ed={ed} variants={x.variants} current={snap.tool} />
          ) : (
            <Btn key={x.tool} icon={Icons[x.tool]} label={t.tools[x.tool]} kbd={x.key} active={snap.tool === x.tool} onClick={() => ed.setTool(x.tool)} />
          ),
        )}
      </div>
      <div className="tb-group">
        {GEOMS.map((g) => {
          const btn = (
            <Btn
              key={g.tool}
              icon={Icons[g.tool]}
              label={t.geom[g.tool]}
              kbd={g.key}
              disabled={constraintsFor(sk, g.tool, sel).length === 0 && !(hasGroup && snap.selection.length >= 2)}
              onClick={() => (g.tool === 'symmetric' && twoPoints ? setSymOpen(!symOpen) : ed.applyGeom(g.tool))}
            />
          );
          if (g.tool !== 'symmetric') return btn;
          return (
            <span key={g.tool} className="tb-anchor" data-modify-btn>
              {btn}
              {symOpen && twoPoints && <SymmetryPopover ed={ed} p1={sel[0]} p2={sel[1]} onClose={() => setSymOpen(false)} />}
            </span>
          );
        })}
        <Btn icon={Icons.fix} label={t.tools.fix} disabled={!all.length} onClick={() => ed.toggleFixed()} />
      </div>
      <div className="tb-group">
        {EDIT_TOOLS.map((x) => (
          <Btn key={x.tool} icon={Icons[x.tool]} label={t.tools[x.tool]} kbd={x.key} active={snap.tool === x.tool} onClick={() => ed.setTool(x.tool)} />
        ))}
        <ModifyTools ed={ed} />
      </div>
      <div className="tb-group">
        <span className="tb-anchor" data-transform-btn>
          <Btn icon={Icons.move} label={t.sel.transform} kbd="G" disabled={!snap.selection.some((id) => sk.entities[id] || sk.groups.some((g) => g.id === id))} active={moveOpen} onClick={() => setMoveOpen(!moveOpen)} />
          {moveOpen && <TransformPopover ed={ed} ids={snap.selection.filter((id) => sk.entities[id] || sk.groups.some((g) => g.id === id))} onClose={() => setMoveOpen(false)} />}
        </span>
        <Btn icon={Icons.group} label={t.tools.group} kbd="Ctrl+G" disabled={!snap.selection.length} onClick={() => ed.groupSelection()} />
        <Btn icon={Icons.ungroup} label={t.tools.ungroup} kbd="Ctrl+Shift+G" disabled={!hasGroup} onClick={() => ed.ungroupSelection()} />
      </div>
      <div className="tb-group">
        <Btn icon={Icons.construction} label={t.tools.construction} kbd="Q" disabled={!hasCurves} onClick={() => ed.toggleConstruction()} />
        <Btn icon={Icons.trash} label={t.tools.delete} kbd="Del" disabled={!snap.selection.length} onClick={() => ed.deleteSelection()} />
        <Btn icon={Icons.fit} label={t.tools.fit} kbd="F" onClick={() => ed.fit()} />
      </div>
    </div>
  );
}
