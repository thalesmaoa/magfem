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
