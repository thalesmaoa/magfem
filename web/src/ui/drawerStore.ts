// Estado da gaveta da direita (Problema, biblioteca de materiais e de contornos): abrível de qualquer lugar.
import { useSyncExternalStore } from 'react';

export type DrawerTab = 'problem' | 'materials' | 'boundaries' | 'about';
export interface DrawerState {
  open: boolean;
  tab: DrawerTab;
  /** Item a destacar/editar (id de material ou contorno). */
  focus: string | null;
}

let state: DrawerState = { open: false, tab: 'problem', focus: null };
const listeners = new Set<() => void>();

export function setDrawer(patch: Partial<DrawerState>) {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
}

export const openDrawer = (tab: DrawerTab, focus: string | null = null) => setDrawer({ open: true, tab, focus });

export function useDrawer(): DrawerState {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
  );
}
