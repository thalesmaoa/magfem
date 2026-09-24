// Tema claro/escuro: "auto" segue o sistema. O tema resolvido vai em <html data-theme="light|dark">.
import { useSyncExternalStore } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'magfem-theme';
const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

let pref: ThemePref = (() => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {
    // sem localStorage: segue o sistema
  }
  return 'auto';
})();

export const resolvedTheme = (): 'light' | 'dark' => (pref === 'auto' ? (media?.matches ? 'dark' : 'light') : pref);
export const isDark = () => resolvedTheme() === 'dark';

function apply() {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = resolvedTheme();
  listeners.forEach((f) => f());
}

export function setThemePref(p: ThemePref) {
  pref = p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // sem localStorage: vale só nesta sessão
  }
  apply();
}

export function subscribeTheme(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const useThemePref = () => useSyncExternalStore(subscribeTheme, () => pref);

media?.addEventListener('change', () => pref === 'auto' && apply());
apply();
