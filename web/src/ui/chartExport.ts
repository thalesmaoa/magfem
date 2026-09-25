// Exportação das abas de gráfico (sobre linha, B-H, circuitos): SVG, PNG/JPG e CSV.
import type { SketchEditor } from '../cad/editor';
import { circuitResults, lineProfile } from '../cad/solve';

const CHART_STYLE = `
  .grid { stroke: #d9dee5; stroke-width: 1; }
  .frame { fill: none; stroke: #6b7785; }
  .curve { fill: none; stroke: #e8408a; stroke-width: 2; }
  .pt { fill: #e8408a; stroke: #fff; stroke-width: 2; }
  text { font: 12px system-ui, sans-serif; fill: #4a5563; }
  .axis-label { font-size: 13px; fill: #1b1f24; }
`;

/** SVG autocontido do gráfico mostrado na aba (fundo branco, estilos embutidos). */
export function chartSVG(): string | null {
  const el = document.querySelector('.chart-pane svg.xychart');
  if (!el) return null;
  const clone = el.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = clone.viewBox.baseVal;
  clone.setAttribute('width', String(vb.width));
  clone.setAttribute('height', String(vb.height));
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = CHART_STYLE;
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  clone.insertBefore(style, clone.firstChild);
  // Linha do valor da curva (a cor escolhida pelo usuário vem do estilo inline, se houver).
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** Rasteriza o SVG do gráfico (2× para ficar nítido). */
export async function chartImage(type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const svg = chartSVG();
  if (!svg) throw new Error('chart');
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise<void>((ok, fail) => {
    img.onload = () => ok();
    img.onerror = () => fail(new Error('svg'));
    img.src = url;
  });
  const c = document.createElement('canvas');
  c.width = img.width * 2;
  c.height = img.height * 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('canvas'))), type, 0.95));
}

/** Dados da aba em CSV (ponto e vírgula, cabeçalho com unidades). */
export function tabCSV(ed: SketchEditor, tab: string): string | null {
  const sk = ed.sketch;
  const rows: (string | number)[][] = [];
  if (tab.startsWith('chart:')) {
    const node = sk.nodes.find((n) => n.id === tab.slice(6));
    if (node?.kind !== 'post' || !node.physics || !node.curve) return null;
    const sol = ed.solutions.get(node.physics);
    if (!sol) return null;
    const smooth = sk.nodes.some((n) => n.id === node.view && n.kind === 'view' && !!n.level);
    const p = lineProfile(sol, sk, node.curve, 400, smooth);
    if (!p) return null;
    rows.push(['s (mm)', '|B| (T)', 'B normal (T)', 'B tangencial (T)', '|H| (A/m)', sol.axisymmetric ? 'psi (Wb/rad)' : 'A (Wb/m)']);
    p.s.forEach((s, i) => rows.push([s, p.b[i], p.bn[i], p.bt[i], p.h[i], p.a[i]]));
    rows.push([]);
    rows.push(['fluxo (Wb)', p.flux]);
  } else if (tab.startsWith('bh:')) {
    const m = sk.materials.find((x) => x.id === tab.slice(3));
    if (!m?.bh) return null;
    rows.push(['H (A/m)', 'B (T)']);
    for (const [h, b] of m.bh) rows.push([h, b]);
  } else if (tab.startsWith('circuits:')) {
    const sol = ed.solutions.get(tab.slice(9));
    if (!sol) return null;
    rows.push(['circuito', 'I (A)', 'espiras', 'lambda (Wb)', 'L (H)', 'R (ohm)', 'V (V)', 'P (W)']);
    for (const r of circuitResults(sk, ed.arrangement(), sol)) rows.push([r.name, r.I, r.turns, r.lambda, r.L ?? '', r.R ?? '', r.V ?? '', r.P ?? '']);
  } else return null;
  const cell = (v: string | number) => (typeof v === 'number' ? String(v) : /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(';')).join('\n') + '\n';
}
