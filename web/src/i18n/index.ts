// Idioma atual, acessível dentro e fora do React (o editor e o solver também geram mensagens).
import { useSyncExternalStore } from 'react';
import { TRANSLATIONS, type Lang, type Translations } from './translations';

export type { Lang, Translations };

const STORAGE_KEY = 'magfem-lang';

function detect(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    // localStorage indisponível (modo privado etc.) — segue para a detecção pelo navegador.
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

let lang: Lang = typeof window === 'undefined' ? 'pt' : detect();
if (typeof document !== 'undefined') document.documentElement.lang = lang;
const listeners = new Set<() => void>();

export const getLang = () => lang;

/** Textos no idioma atual. */
export const T = (): Translations => TRANSLATIONS[lang];

export function setLang(l: Lang) {
  lang = l;
  try {
    window.localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // ignora se localStorage não estiver disponível
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

export function subscribeLang(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Hook: idioma atual. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang);
}

/** Hook: re-renderiza ao trocar o idioma e devolve os textos. */
export function useT(): Translations {
  const l = useSyncExternalStore(subscribeLang, getLang);
  return TRANSLATIONS[l];
}

// Nomes padrão gravados no projeto ("Campo magnético", "Vista 2", "Superfície: B") aparecem no idioma atual;
// nomes digitados pelo usuário ficam como estão.
let nameIndex: Map<string, string> | null = null;
function buildIndex() {
  const idx = new Map<string, string>();
  const walk = (o: unknown, path: string) => {
    if (typeof o === 'string') {
      if (o.length >= 3 && o.length <= 48 && /\p{L}{2}/u.test(o) && !idx.has(o)) idx.set(o, path);
    } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(TRANSLATIONS.pt, '');
  walk(TRANSLATIONS.en, '');
  return idx;
}
function lookup(s: string): string | null {
  nameIndex ??= buildIndex();
  const path = nameIndex.get(s);
  if (!path) return null;
  let o: unknown = TRANSLATIONS[lang];
  for (const k of path.split('.')) o = (o as Record<string, unknown> | undefined)?.[k];
  return typeof o === 'string' ? o : null;
}
export function displayName(name: string): string {
  const m = /^(.*?)(\s+\d+)?$/.exec(name)!;
  const base = lookup(m[1]);
  if (base) return base + (m[2] ?? '');
  const k = name.indexOf(': ');
  if (k > 0) {
    const head = lookup(name.slice(0, k));
    if (head) return head + name.slice(k);
  }
  return name;
}
