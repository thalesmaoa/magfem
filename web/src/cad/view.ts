import type { Vec } from './geometry';

/** Transformação mundo (mm, y para cima) <-> tela (px CSS, y para baixo). */
export class View {
  scale = 4; // px por mm
  cx = 0; // centro da vista em mm
  cy = 0;
  w = 1;
  h = 1;

  toScreen(p: Vec): Vec {
    return { x: (p.x - this.cx) * this.scale + this.w / 2, y: this.h / 2 - (p.y - this.cy) * this.scale };
  }
  toWorld(s: Vec): Vec {
    return { x: (s.x - this.w / 2) / this.scale + this.cx, y: (this.h / 2 - s.y) / this.scale + this.cy };
  }
  /** Converte uma distância em px para mm. */
  px(n: number) {
    return n / this.scale;
  }
  zoomAt(s: Vec, factor: number) {
    const before = this.toWorld(s);
    this.scale = Math.min(1e5, Math.max(1e-3, this.scale * factor));
    const after = this.toWorld(s);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }
  panPx(dx: number, dy: number) {
    this.cx -= dx / this.scale;
    this.cy += dy / this.scale;
  }
  fit(b: { x0: number; y0: number; x1: number; y1: number }, marginPx = 60) {
    const bw = Math.max(b.x1 - b.x0, 1e-6);
    const bh = Math.max(b.y1 - b.y0, 1e-6);
    if (!isFinite(bw) || !isFinite(bh) || (bw < 1e-3 && bh < 1e-3)) {
      this.scale = 4;
      this.cx = 0;
      this.cy = 0;
      return;
    }
    this.scale = Math.min((this.w - 2 * marginPx) / bw, (this.h - 2 * marginPx) / bh);
    this.cx = (b.x0 + b.x1) / 2;
    this.cy = (b.y0 + b.y1) / 2;
  }
}
