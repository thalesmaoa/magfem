import { expect, test } from '@playwright/test';
import { clickWorld, dragWorld, openApp, sketch, toPage, typeDim } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const ents = async (page: any, type: string) => Object.values((await sketch(page)).entities).filter((e: any) => e.type === type) as any[];

test('cota de ângulo entre duas linhas', async ({ page }) => {
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 0.2 }); // H inferida
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 30, y: 25 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await clickWorld(page, { x: 30, y: 0 });
  await clickWorld(page, { x: 15, y: 12.5 });
  await clickWorld(page, { x: 25, y: 8 }); // posiciona entre as linhas
  await typeDim(page, '30');
  const sk = await sketch(page);
  const ang = sk.constraints.find((c: any) => c.type === 'angle');
  expect(ang.value).toBe(30);
  const oblique = (await ents(page, 'line')).find((l: any) => Math.abs(sk.entities[l.p2].y) > 1);
  const p = sk.entities[oblique.p2];
  expect((Math.atan2(p.y, p.x) * 180) / Math.PI).toBeCloseTo(30, 6);
  await page.screenshot({ path: 'test-results/angulo.png' });
});

test('diâmetro do círculo, raio do arco e tangência linha-arco', async ({ page }) => {
  await page.keyboard.press('c');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 12, y: 0 });
  // Linha horizontal terminando num arco (arco pelo centro com início no fim da linha).
  await page.keyboard.press('l');
  await clickWorld(page, { x: -40, y: 30 });
  await clickWorld(page, { x: 0, y: 30.3 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+A');
  await clickWorld(page, { x: 1, y: 40 }); // centro (levemente fora da tangência)
  await clickWorld(page, { x: 0, y: 30 }); // início = fim da linha (encaixa no ponto)
  for (const t of [-1.2, -0.6, 0]) {
    const s = await toPage(page, { x: 1 + 10 * Math.cos(t), y: 40 + 10 * Math.sin(t) });
    await page.mouse.move(s.x, s.y, { steps: 3 });
  }
  await clickWorld(page, { x: 11, y: 40 });
  await page.keyboard.press('Escape');
  let sk = await sketch(page);
  const arc = (await ents(page, 'arc'))[0];
  const line = (await ents(page, 'line'))[0];
  expect([arc.s, arc.e]).toContain(line.p2); // ponto compartilhado

  // Tangência: seleciona linha e arco.
  await clickWorld(page, { x: -20, y: 30 });
  const ac = sk.entities[arc.c];
  await clickWorld(page, { x: ac.x + arc.r * Math.cos(-0.7), y: ac.y + arc.r * Math.sin(-0.7) }, { shift: true });
  await page.keyboard.press('t');
  sk = await sketch(page);
  expect(sk.constraints.map((c: any) => c.type)).toContain('tangent');
  const c2 = sk.entities[sk.entities[arc.id].c];
  const ly = sk.entities[line.p1].y; // linha continua horizontal
  expect(sk.entities[line.p2].y).toBeCloseTo(ly, 6);
  expect(Math.abs(c2.y - ly)).toBeCloseTo(sk.entities[arc.id].r, 6); // centro a r da linha

  // Diâmetro do círculo e raio do arco.
  await page.keyboard.press('d');
  await clickWorld(page, { x: 0, y: -12 });
  await clickWorld(page, { x: 20, y: -20 });
  await typeDim(page, '30');
  sk = await sketch(page);
  const a2 = sk.entities[arc.id];
  const ac2 = sk.entities[a2.c];
  await clickWorld(page, { x: ac2.x + a2.r * Math.cos(-0.7), y: ac2.y + a2.r * Math.sin(-0.7) });
  await clickWorld(page, { x: ac2.x + 25, y: ac2.y - 10 });
  await typeDim(page, '8');
  sk = await sketch(page);
  expect((await ents(page, 'circle'))[0].r).toBeCloseTo(15, 6);
  expect(sk.entities[arc.id].r).toBeCloseTo(8, 6);
  expect(sk.constraints.map((c: any) => c.type).sort()).toEqual(expect.arrayContaining(['diameter', 'radius', 'tangent']));
  await page.keyboard.press('f');
  await page.screenshot({ path: 'test-results/tangente-raio.png' });
});

test('distância ponto-linha e cotas horizontal/vertical pelo posicionamento', async ({ page }) => {
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 30, y: 20 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('p');
  await clickWorld(page, { x: 0, y: 25 });
  await page.keyboard.press('d');
  // Horizontal: texto acima do segmento, dentro da faixa em x.
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 30, y: 20 });
  await clickWorld(page, { x: 15, y: 35 });
  await typeDim(page, '40');
  // Vertical: texto à direita, dentro da faixa em y.
  await clickWorld(page, { x: 0, y: 0 });
  let sk = await sketch(page);
  const far = Object.values(sk.entities).find((e: any) => e.type === 'point' && e.x > 35) as any;
  await clickWorld(page, far);
  await clickWorld(page, { x: far.x + 15, y: far.y / 2 });
  await typeDim(page, '10');
  // Ponto livre até a linha.
  sk = await sketch(page);
  const line = (await ents(page, 'line'))[0];
  const P = Object.values(sk.entities).find((e: any) => e.type === 'point' && e.free && e.id !== 'O') as any;
  await clickWorld(page, P);
  const a = sk.entities[line.p1];
  const b = sk.entities[line.p2];
  await clickWorld(page, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  await clickWorld(page, { x: P.x - 10, y: P.y + 10 });
  await typeDim(page, '5');
  sk = await sketch(page);
  const types = sk.constraints.map((c: any) => c.type);
  expect(types).toEqual(['coincident', 'hdistance', 'vdistance', 'distance']);
  const B = sk.entities[line.p2];
  expect(B.x).toBeCloseTo(40, 6);
  expect(B.y).toBeCloseTo(10, 6);
  const Q = sk.entities[P.id];
  const dPL = Math.abs(B.x * Q.y - B.y * Q.x) / Math.hypot(B.x, B.y);
  expect(dPL).toBeCloseTo(5, 6);
  await page.screenshot({ path: 'test-results/cotas-hv.png' });
});

test('arrastar o texto da cota não muda a geometria; zoom e pan mudam só a vista', async ({ page }) => {
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 30, y: 0 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await clickWorld(page, { x: 15, y: 0 });
  await clickWorld(page, { x: 15, y: 8 });
  await typeDim(page, '30');
  await page.keyboard.press('Escape');
  const before = await sketch(page);
  await dragWorld(page, { x: 15, y: 8 }, { x: 25, y: 20 });
  const after = await sketch(page);
  const dimOf = (sk: any) => sk.constraints.find((c: any) => c.type === 'distance');
  expect(dimOf(after).label.y).toBeGreaterThan(dimOf(before).label.y + 5);
  expect(after.entities.p1).toEqual(before.entities.p1);

  const scale0 = await page.evaluate(() => (window as any).__magfem.view.scale);
  const s = await toPage(page, { x: 0, y: 0 });
  await page.mouse.move(s.x, s.y);
  await page.mouse.wheel(0, -300);
  const scale1 = await page.evaluate(() => (window as any).__magfem.view.scale);
  expect(scale1).toBeGreaterThan(scale0);
  // O ponto sob o cursor fica parado durante o zoom.
  const s2 = await toPage(page, { x: 0, y: 0 });
  expect(Math.abs(s2.x - s.x)).toBeLessThan(1);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(s.x + 100, s.y + 50, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  const s3 = await toPage(page, { x: 0, y: 0 });
  expect(s3.x - s.x).toBeCloseTo(100, 0);
  expect(await sketch(page)).toEqual(after);
});
