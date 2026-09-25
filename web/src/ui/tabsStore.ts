// Abas do canvas: Desenho (fixa), vistas de resultados, gráficos e curvas B-H. Estado da interface.
import { useSyncExternalStore } from 'react';

export type CanvasTab = { kind: 'draw' } | { kind: 'view'; id: string } | { kind: 'chart'; plot: string } | { kind: 'bh'; material: string } | { kind: 'circuits'; physics: string };

export const tabKey = (t: CanvasTab) =>
  t.kind === 'draw' ? 'draw' : t.kind === 'view' ? `view:${t.id}` : t.kind === 'chart' ? `chart:${t.plot}` : t.kind === 'bh' ? `bh:${t.material}` : `circuits:${t.physics}`;

interface TabsState {
  tabs: CanvasTab[];
  active: string;
}
let state: TabsState = { tabs: [{ kind: 'draw' }], active: 'draw' };
const listeners = new Set<() => void>();
const emit = (s: TabsState) => {
  state = s;
  listeners.forEach((f) => f());
};

/** Abre (se preciso) e ativa a aba. */
export function openTab(t: CanvasTab) {
  const k = tabKey(t);
  if (state.active === k && state.tabs.some((x) => tabKey(x) === k)) return;
  emit({ tabs: state.tabs.some((x) => tabKey(x) === k) ? state.tabs : [...state.tabs, t], active: k });
}

export function activateTab(k: string) {
  if (state.active !== k) emit({ ...state, active: k });
}

export function closeTab(k: string) {
  if (k === 'draw') return;
  const i = state.tabs.findIndex((x) => tabKey(x) === k);
  const tabs = state.tabs.filter((x) => tabKey(x) !== k);
  emit({ tabs, active: state.active === k ? tabKey(tabs[Math.max(0, i - 1)] ?? { kind: 'draw' }) : state.active });
}

/** Fecha abas cujo alvo sumiu (vista, gráfico ou material removidos). */
export function pruneTabs(exists: (t: CanvasTab) => boolean) {
  const tabs = state.tabs.filter((t) => t.kind === 'draw' || exists(t));
  if (tabs.length !== state.tabs.length) emit({ tabs, active: tabs.some((t) => tabKey(t) === state.active) ? state.active : 'draw' });
}

export function useTabs(): TabsState {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
  );
}
