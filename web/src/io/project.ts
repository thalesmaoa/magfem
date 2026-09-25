// Arquivo de projeto .magfem (JSON) — abrir/salvar direto no disco, estilo draw.io/Excalidraw.
import { T } from '../i18n';
import { DEFAULT_MATERIALS, DEFAULT_SETTINGS, emptySketch, newPhysics, ORIGIN_ID, type PlotKind, type PlotQuantity, type Sketch } from '../cad/types';

export const FILE_EXT = '.magfem';
const FORMAT = 'magfem';
const VERSION = 1;

export interface ProjectFile {
  format: typeof FORMAT;
  version: number;
  sketch: Sketch;
}

export function serialize(sketch: Sketch): string {
  const f: ProjectFile = { format: FORMAT, version: VERSION, sketch };
  return JSON.stringify(f, null, 1);
}

export function parse(text: string): Sketch {
  const f = JSON.parse(text) as Partial<ProjectFile>;
  if (f.format !== FORMAT || !f.sketch?.entities || !Array.isArray(f.sketch.constraints))
    throw new Error(T().file.invalidFile);
  if (typeof f.version !== 'number' || f.version > VERSION)
    throw new Error(T().file.unsupportedVersion(f.version));
  return normalizeSketch(f.sketch);
}

/** Completa campos ausentes (arquivos/rascunhos de versões anteriores). */
export function normalizeSketch(raw: Partial<Sketch>): Sketch {
  const base = emptySketch();
  const sk: Sketch = {
    entities: raw.entities ?? base.entities,
    constraints: raw.constraints ?? [],
    variables: raw.variables ?? [],
    groups: raw.groups ?? [],
    settings: { unit: raw.settings?.unit ?? DEFAULT_SETTINGS.unit, problem: raw.settings?.problem ?? DEFAULT_SETTINGS.problem, depth: raw.settings?.depth ?? DEFAULT_SETTINGS.depth },
    nodes: raw.nodes ?? [],
    materials: (raw.materials ?? DEFAULT_MATERIALS.map((m) => ({ ...m }))).map((m) => ({
      ...m,
      group: m.group ?? DEFAULT_MATERIALS.find((d) => d.id === m.id)?.group ?? 'custom',
    })),
    regionAssigns: raw.regionAssigns ?? [],
    boundaries: raw.boundaries ?? [],
    nextId: typeof raw.nextId === 'number' ? raw.nextId : 1,
  };
  // Versões anteriores guardavam a análise nas configurações: vira um nó de física.
  if (!raw.nodes) {
    const old = (raw.settings ?? {}) as Record<string, string>;
    const n = newPhysics(`n${sk.nextId++}`, 'Campo magnético');
    if (old.analysis) Object.assign(n, { analysis: old.analysis, frequency: old.frequency ?? n.frequency, dt: old.dt ?? n.dt, tEnd: old.tEnd ?? n.tEnd });
    sk.nodes.push(n);
  }
  if (!sk.entities[ORIGIN_ID]) sk.entities[ORIGIN_ID] = base.entities[ORIGIN_ID];
  // Resultados antigos (um nó com mapa + linhas): viram camadas da primeira física.
  const phys = sk.nodes.find((n) => n.kind === 'physics');
  const legacy = sk.nodes.filter((n) => n.kind === 'post' && !n.plot);
  if (legacy.length) {
    sk.nodes = sk.nodes.filter((n) => !legacy.includes(n));
    if (phys) {
      const old = legacy[0] as { map?: boolean; lines?: boolean; nLines?: number };
      sk.nodes.push({ id: `n${sk.nextId++}`, kind: 'post', name: 'Mapa 2D: |B|', physics: phys.id, plot: 'surface', quantity: 'b', hidden: old.map === false });
      sk.nodes.push({ id: `n${sk.nextId++}`, kind: 'post', name: 'Linhas de fluxo', physics: phys.id, plot: 'contour', quantity: 'a', hidden: old.lines === false, nLines: old.nLines });
    }
  }
  // Tipos de gráfico anteriores (grandeza embutida no tipo) → tipo + grandeza.
  const OLD: Record<string, [PlotKind, PlotQuantity]> = { bmap: ['surface', 'b'], hmap: ['surface', 'h'], amap: ['surface', 'a'], flux: ['contour', 'a'], vectors: ['arrow', 'b'] };
  sk.nodes = sk.nodes.map((n) => (n.kind === 'post' && n.plot && OLD[n.plot as string] ? { ...n, plot: OLD[n.plot as string][0], quantity: OLD[n.plot as string][1] } : n));
  // Offsets de versões anteriores: a primeira distância do grupo vira a cota visível do offset.
  for (const g of sk.groups) {
    if (!g.offset || sk.constraints.some((c) => c.offsetDim === g.id)) continue;
    const i = sk.constraints.findIndex((c) => c.type === 'distance' && c.param === `off_${g.id}`);
    if (i >= 0) sk.constraints[i] = { ...sk.constraints[i], offsetDim: g.id };
  }
  return sk;
}

// ---------- File System Access API (Chrome/Edge) com fallback ----------

type FileHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
};
type PickerWindow = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<FileHandle>;
};

const pickerTypes = [{ description: 'Projeto magfem', accept: { 'application/json': [FILE_EXT] } }];
const w = window as PickerWindow;
export const hasFsAccess = typeof w.showSaveFilePicker === 'function';

export interface OpenedFile {
  name: string;
  sketch: Sketch;
  handle: FileHandle | null;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export async function openProject(): Promise<OpenedFile | null> {
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: pickerTypes, multiple: false });
      const file = await handle.getFile();
      return { name: file.name, sketch: parse(await file.text()), handle };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${FILE_EXT},application/json`;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!file) return null;
  return { name: file.name, sketch: parse(await file.text()), handle: null };
}

/**
 * Salva. Com `handle` (e FS Access), regrava o mesmo arquivo; senão pede um nome
 * (ou baixa o arquivo, nos navegadores sem FS Access). Devolve o handle/nome usados.
 */
export async function saveProject(
  sketch: Sketch,
  name: string,
  handle: FileHandle | null,
): Promise<{ name: string; handle: FileHandle | null } | null> {
  const text = serialize(sketch);
  if (w.showSaveFilePicker) {
    try {
      const h = handle ?? (await w.showSaveFilePicker({ suggestedName: withExt(name), types: pickerTypes }));
      const out = await h.createWritable();
      await out.write(text);
      await out.close();
      return { name: h.name, handle: h };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = withExt(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return { name: withExt(name), handle: null };
}

const withExt = (n: string) => (n.endsWith(FILE_EXT) ? n : `${n}${FILE_EXT}`);

// ---------- rascunho automático (IndexedDB) ----------

const DB = 'magfem';
const STORE = 'kv';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface Draft {
  name: string;
  text: string;
  savedAt: number;
}

export async function saveDraft(d: Draft) {
  try {
    const conn = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = conn.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(d, 'draft');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    conn.close();
  } catch {
    // Sem IndexedDB (aba privada etc.): o app segue funcionando sem rascunho.
  }
}

export async function loadDraft(): Promise<Draft | null> {
  try {
    const conn = await db();
    const d = await new Promise<Draft | null>((resolve, reject) => {
      const req = conn.transaction(STORE, 'readonly').objectStore(STORE).get('draft');
      req.onsuccess = () => resolve((req.result as Draft) ?? null);
      req.onerror = () => reject(req.error);
    });
    conn.close();
    return d;
  } catch {
    return null;
  }
}
