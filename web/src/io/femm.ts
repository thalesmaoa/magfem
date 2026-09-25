// Leitura da biblioteca de materiais do FEMM (matlib.dat) para materiais do MagFEM.
import type { Material, MaterialGroup } from '../cad/types';

const MU0 = 4e-7 * Math.PI;

/** Material do FEMM já convertido, com a pasta de origem ("Soft Magnetic Materials / Silicon Iron"). */
export interface FemmMaterial {
  path: string[];
  material: Omit<Material, 'id' | 'color'>;
}

/** Grupo do MagFEM pela pasta de nível superior (e pelas propriedades, fora de pastas). */
function groupOf(path: string[], mur: number, sigma: number, br: number, bh: boolean): MaterialGroup {
  const top = (path[0] ?? '').toLowerCase();
  if (top.startsWith('hard magnetic') || br > 0) return 'magnet';
  if (top.startsWith('soft magnetic') || top.startsWith('metals handbook') || bh || mur > 1.01) return 'steel';
  if (top.includes('conductor') || top.includes('wire') || sigma > 0) return 'conductor';
  if (mur === 1 && sigma === 0) return 'air';
  return 'custom';
}

/**
 * Converte o texto de um matlib.dat. Propriedades usadas: μ (Mu_x), σ (MS/m, mesma unidade),
 * Hc → Br = μ0·μr·Hc (ímã linear) e a curva B-H (pares B, H → [H, B]).
 * Ímãs com curva B-H entram lineares (o solver não combina Br com curva); laminação e fios são ignorados.
 */
export function parseMatlib(text: string): FemmMaterial[] {
  const out: FemmMaterial[] = [];
  const path: string[] = [];
  const lines = text.split(/\r?\n/);
  let block: Record<string, string> | null = null;
  let bh: [number, number][] = [];
  let bhLeft = 0;
  const str = (v: string) => v.trim().replace(/^"|"$/g, '');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (bhLeft > 0) {
      const [b, h] = line.split(/\s+/).map(Number);
      if (Number.isFinite(b) && Number.isFinite(h)) bh.push([h, b]);
      bhLeft--;
      continue;
    }
    const m = /^<([^>]+)>\s*(?:=\s*(.*))?$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2] ?? '';
    if (key === 'beginfolder') path.push('');
    else if (key === 'foldername') path[path.length - 1] = str(val);
    else if (key === 'endfolder') path.pop();
    else if (key === 'beginblock') {
      block = {};
      bh = [];
    } else if (key === 'endblock' && block) {
      const num = (k: string) => {
        const x = Number(block![k] ?? 0);
        return Number.isFinite(x) ? x : 0;
      };
      let mur = num('mu_x') || 1;
      const sigma = num('sigma'), hc = num('h_c');
      const curve = bh.filter(([h, b]) => h >= 0 && b >= 0).sort((a, b) => a[1] - b[1]);
      let br = hc > 0 ? MU0 * mur * hc : 0;
      if (hc > 0 && curve.length >= 2) {
        // Ímã não linear: a curva do FEMM usa H' = H + Hc; Br = B(H' = Hc), μr = inclinação ali (recuo).
        const i = curve.findIndex(([h]) => h >= hc);
        const k = i < 0 ? curve.length - 1 : Math.max(1, i);
        const [h0, b0] = curve[k - 1], [h1, b1] = curve[k];
        if (h1 > h0) {
          br = b0 + ((b1 - b0) * (hc - h0)) / (h1 - h0);
          mur = Math.max(1, (b1 - b0) / (h1 - h0) / MU0);
          mur = +mur.toPrecision(4);
        }
      }
      const useBh = br === 0 && curve.length >= 3;
      const material: FemmMaterial['material'] = {
        name: str(block.blockname ?? 'FEMM'),
        group: groupOf(path, mur, sigma, br, useBh),
        mur,
        sigma,
      };
      if (br > 0) material.br = +br.toFixed(4);
      if (useBh) material.bh = curve;
      out.push({ path: path.filter(Boolean), material });
      block = null;
    } else if (block) {
      if (key === 'bhpoints') bhLeft = Math.max(0, Math.floor(Number(val) || 0));
      block[key] = val;
    }
  }
  return out;
}
