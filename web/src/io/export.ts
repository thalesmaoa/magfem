// Exportação da geometria: SVG e DXF (vetorial, em mm) — imagens PNG/JPG ficam no editor (canvas).
import { arcAngles, entityBBox, pt } from '../cad/geometry';
import { isCurve, type Curve, type Sketch } from '../cad/types';

const fmt = (v: number) => Number(v.toFixed(6)).toString();

/** Curvas exportadas: todas as reais; as de construção só se `construction` for verdadeiro. */
function curves(sk: Sketch, construction: boolean): Curve[] {
  return Object.values(sk.entities).filter(isCurve).filter((c) => !(c.type === 'line' && c.aux) && (construction || !c.construction));
}

function bbox(sk: Sketch, list: Curve[]) {
  let b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const c of list) {
    const e = entityBBox(sk, c);
    b = { x0: Math.min(b.x0, e.x0), y0: Math.min(b.y0, e.y0), x1: Math.max(b.x1, e.x1), y1: Math.max(b.y1, e.y1) };
  }
  if (!isFinite(b.x0)) b = { x0: -10, y0: -10, x1: 10, y1: 10 };
  return b;
}

/** SVG em milímetros (1 unidade = 1 mm), eixo y para cima como no desenho. */
export function toSVG(sk: Sketch, opts: { construction?: boolean } = {}): string {
  const list = curves(sk, !!opts.construction);
  const b = bbox(sk, list);
  const m = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.05 + 1;
  const x0 = b.x0 - m;
  const y0 = b.y0 - m;
  const w = b.x1 - b.x0 + 2 * m;
  const h = b.y1 - b.y0 + 2 * m;
  // Espelha y: no SVG o y cresce para baixo.
  const Y = (y: number) => fmt(b.y1 + m - y + y0);
  const X = (x: number) => fmt(x);
  const shapes: string[] = [];
  for (const c of list) {
    const style = c.construction ? ' stroke-dasharray="2 1.5" stroke="#8fa1b5"' : '';
    if (c.type === 'line') {
      const a = pt(sk, c.p1);
      const e = pt(sk, c.p2);
      shapes.push(`<line id="${c.id}" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(e.x)}" y2="${Y(e.y)}"${style}/>`);
    } else if (c.type === 'circle') {
      const cc = pt(sk, c.c);
      shapes.push(`<circle id="${c.id}" cx="${X(cc.x)}" cy="${Y(cc.y)}" r="${fmt(c.r)}"${style}/>`);
    } else {
      const { c: cc, start, end } = arcAngles(sk, c);
      const s = { x: cc.x + c.r * Math.cos(start), y: cc.y + c.r * Math.sin(start) };
      const e = { x: cc.x + c.r * Math.cos(end), y: cc.y + c.r * Math.sin(end) };
      const large = end - start > Math.PI ? 1 : 0;
      // Anti-horário no desenho = horário na tela do SVG (sweep-flag 0).
      shapes.push(`<path id="${c.id}" d="M ${X(s.x)} ${Y(s.y)} A ${fmt(c.r)} ${fmt(c.r)} 0 ${large} 0 ${X(e.x)} ${Y(e.y)}"${style}/>`);
    }
  }
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- MagFEM — geometria exportada em mm -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)}">`,
    `<g fill="none" stroke="#1b1f24" stroke-width="${fmt(Math.max(w, h) / 500)}" stroke-linecap="round">`,
    ...shapes,
    `</g>`,
    `</svg>`,
    '',
  ].join('\n');
}

/** DXF R12 (ASCII), unidades em mm; curvas de construção na camada CONSTRUCAO. */
export function toDXF(sk: Sketch, opts: { construction?: boolean } = {}): string {
  const list = curves(sk, opts.construction ?? true);
  const out: (string | number)[] = [];
  const g = (code: number, value: string | number) => out.push(code, typeof value === 'number' ? fmt(value) : value);
  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$INSUNITS');
  g(70, '4'); // milímetros
  g(0, 'ENDSEC');
  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, '2');
  for (const [name, color] of [
    ['0', '7'],
    ['CONSTRUCAO', '8'],
  ]) {
    g(0, 'LAYER');
    g(2, name);
    g(70, '0');
    g(62, color);
    g(6, name === '0' ? 'CONTINUOUS' : 'DASHED');
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION');
  g(2, 'ENTITIES');
  for (const c of list) {
    const layer = c.construction ? 'CONSTRUCAO' : '0';
    if (c.type === 'line') {
      const a = pt(sk, c.p1);
      const e = pt(sk, c.p2);
      g(0, 'LINE');
      g(8, layer);
      g(10, a.x);
      g(20, a.y);
      g(30, 0);
      g(11, e.x);
      g(21, e.y);
      g(31, 0);
    } else if (c.type === 'circle') {
      const cc = pt(sk, c.c);
      g(0, 'CIRCLE');
      g(8, layer);
      g(10, cc.x);
      g(20, cc.y);
      g(30, 0);
      g(40, c.r);
    } else {
      const { c: cc, start, end } = arcAngles(sk, c);
      g(0, 'ARC');
      g(8, layer);
      g(10, cc.x);
      g(20, cc.y);
      g(30, 0);
      g(40, c.r);
      g(50, ((start * 180) / Math.PI + 360) % 360); // DXF: anti-horário, graus
      g(51, ((end * 180) / Math.PI + 360) % 360);
    }
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\n') + '\n';
}

export function download(name: string, data: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
