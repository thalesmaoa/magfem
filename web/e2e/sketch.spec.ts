import { expect, test } from '@playwright/test';
import { clickWorld, dof, dragWorld, lineEnds, openApp, point, sketch, toPage, typeDim } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('retângulo na origem cotado fica totalmente definido', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 25 });
  let sk = await sketch(page);
  const lines = Object.values(sk.entities).filter((e: any) => e.type === 'line') as any[];
  expect(lines).toHaveLength(4);
  expect(sk.constraints.filter((c: any) => c.type === 'horizontal')).toHaveLength(2);
  expect(sk.constraints.filter((c: any) => c.type === 'vertical')).toHaveLength(2);
  expect(await dof(page)).toBe(2);

  // Cota do lado de cima (linha horizontal em y=25) e do lado direito (x=40).
  const top = lines.find((l: any) => sk.entities[l.p1].y > 1 && sk.entities[l.p2].y > 1);
  const right = lines.find((l: any) => sk.entities[l.p1].x > 1 && sk.entities[l.p2].x > 1);
  await page.keyboard.press('d');
  await clickWorld(page, { x: 20, y: 25 });
  await clickWorld(page, { x: 20, y: 35 });
  await typeDim(page, '50');
  await clickWorld(page, { x: 50, y: 12.5 });
  await clickWorld(page, { x: 60, y: 12.5 });
  await typeDim(page, '30,5');

  expect(await dof(page)).toBe(0);
  await expect(page.locator('.status')).toContainText('Totalmente definido');
  const [a, b] = await lineEnds(page, top.id);
  expect(Math.abs(a.x - b.x)).toBeCloseTo(50, 6);
  const [c, d] = await lineEnds(page, right.id);
  expect(Math.abs(c.y - d.y)).toBeCloseTo(30.5, 6);
  await page.screenshot({ path: 'test-results/retangulo.png' });
});

test('polilinha com inferência H/V, fechamento e desfazer', async ({ page }) => {
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 30, y: 0.4 }); // quase horizontal -> H
  await clickWorld(page, { x: 30.3, y: 20 }); // quase vertical -> V
  await clickWorld(page, { x: 0, y: 0 }); // fecha na origem e encerra
  let sk = await sketch(page);
  expect(Object.values(sk.entities).filter((e: any) => e.type === 'line')).toHaveLength(3);
  const types = sk.constraints.map((c: any) => c.type).sort();
  // Início na origem: ponto próprio + coincidente com a Origem (o fechamento une ao 1º ponto da polilinha).
  expect(types).toEqual(['coincident', 'horizontal', 'vertical']);
  // A polilinha terminou: próximo clique inicia outra, não liga ao último ponto.
  await clickWorld(page, { x: -20, y: -20 });
  sk = await sketch(page);
  expect(Object.values(sk.entities).filter((e: any) => e.type === 'line')).toHaveLength(3);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  sk = await sketch(page);
  expect(Object.values(sk.entities).filter((e: any) => e.type === 'line')).toHaveLength(2);
  await page.keyboard.press('Control+Shift+z');
  sk = await sketch(page);
  expect(Object.values(sk.entities).filter((e: any) => e.type === 'line')).toHaveLength(3);
  await page.screenshot({ path: 'test-results/polilinha.png' });
});

test('círculo, arcos e restrições por seleção', async ({ page }) => {
  await page.keyboard.press('c');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 10, y: 0 });
  await page.keyboard.press('c');
  await clickWorld(page, { x: 40, y: 5 });
  await clickWorld(page, { x: 46, y: 5 });
  await page.keyboard.press('a'); // arco por 3 pontos
  await clickWorld(page, { x: -30, y: 0 });
  await clickWorld(page, { x: -10, y: 20 });
  await clickWorld(page, { x: -30, y: 20 });
  await page.keyboard.press('Shift+A'); // arco pelo centro
  await clickWorld(page, { x: 0, y: -40 });
  await clickWorld(page, { x: 15, y: -40 });
  for (const t of [0.3, 0.8, 1.3]) {
    const s = await toPage(page, { x: 15 * Math.cos(t), y: -40 + 15 * Math.sin(t) });
    await page.mouse.move(s.x, s.y, { steps: 3 });
  }
  await clickWorld(page, { x: 0, y: -25 });
  let sk = await sketch(page);
  const circles = Object.values(sk.entities).filter((e: any) => e.type === 'circle') as any[];
  const arcs = Object.values(sk.entities).filter((e: any) => e.type === 'arc') as any[];
  expect(circles).toHaveLength(2);
  expect(arcs).toHaveLength(2);
  // O arco pelo centro vai no sentido anti-horário de (15,-40) até (0,-25).
  const ca = arcs.find((a: any) => Math.abs(sk.entities[a.c].y + 40) < 1e-6);
  expect(sk.entities[ca.s].x).toBeCloseTo(15, 6);

  // Seleciona os dois círculos (clique + Shift) e aplica "igual" (E).
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 0, y: 10 });
  await clickWorld(page, { x: 40, y: 11 }, { shift: true });
  await expect.poll(async () => (await page.evaluate(() => (window as any).__magfem.selection)).length).toBe(2);
  await page.keyboard.press('e');
  sk = await sketch(page);
  expect(sk.constraints.map((c: any) => c.type)).toContain('equal');
  const rs = (Object.values(sk.entities).filter((e: any) => e.type === 'circle') as any[]).map((c) => c.r);
  expect(rs[0]).toBeCloseTo(rs[1], 6);
  // A seleção é limpa após aplicar; seleciona de novo e usa o botão Concêntrica.
  expect(await page.evaluate(() => (window as any).__magfem.selection)).toEqual([]);
  await clickWorld(page, { x: 0, y: 10 });
  const c3 = (Object.values(sk.entities).filter((e: any) => e.type === 'circle') as any[])[1];
  await clickWorld(page, { x: sk.entities[c3.c].x, y: sk.entities[c3.c].y + c3.r }, { shift: true });
  await page.getByRole('button', { name: 'Concêntrica' }).click();
  sk = await sketch(page);
  const [c1, c2] = Object.values(sk.entities).filter((e: any) => e.type === 'circle') as any[];
  expect(sk.entities[c1.c].x).toBeCloseTo(sk.entities[c2.c].x, 6);
  await page.keyboard.press('f');
  await page.screenshot({ path: 'test-results/circulos-arcos.png' });
});

test('arrastar ponto move a geometria respeitando restrições', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await dragWorld(page, { x: 40, y: 20 }, { x: 60, y: 30 });
  const sk = await sketch(page);
  const corner = Object.values(sk.entities).find((e: any) => e.type === 'point' && e.x > 50) as any;
  expect(corner.x).toBeCloseTo(60, 1);
  expect(corner.y).toBeCloseTo(30, 1);
  // Continua retangular: os outros cantos acompanharam.
  const xs = Object.values(sk.entities).filter((e: any) => e.type === 'point').map((p: any) => Math.round(p.x * 100) / 100);
  expect(new Set(xs)).toEqual(new Set([0, 60]));
  await page.keyboard.press('Control+z');
  const back = await point(page, corner.id);
  expect(back.x).toBeCloseTo(40, 6);
});

test('restrição conflitante é rejeitada com mensagem', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // O retângulo nasce agrupado: duplo clique entra no grupo e seleciona o lado.
  expect((await sketch(page)).groups).toHaveLength(1);
  const base = await toPage(page, { x: 20, y: 0 });
  await page.mouse.dblclick(base.x, base.y);
  await clickWorld(page, { x: 0, y: 10 }, { shift: true }); // lado esquerdo (vertical)
  await page.getByRole('button', { name: 'Paralela' }).click();
  await expect(page.locator('.status .msg')).not.toBeEmpty();
  const sk = await sketch(page);
  expect(sk.constraints.map((c: any) => c.type)).not.toContain('parallel');
});

test('apagar e persistência do rascunho após recarregar', async ({ page }) => {
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 20, y: 10 });
  await clickWorld(page, { x: 30, y: -5 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 25, y: 2.5 }); // segunda linha
  await page.keyboard.press('Delete');
  let sk = await sketch(page);
  expect(Object.values(sk.entities).filter((e: any) => e.type === 'line')).toHaveLength(1);
  expect(Object.values(sk.entities).filter((e: any) => e.type === 'point')).toHaveLength(3); // origem + ponto coincidente com ela + 1
  await page.waitForTimeout(800); // rascunho salvo com debounce
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__magfem);
  sk = await sketch(page);
  expect(Object.values(sk.entities).filter((e: any) => e.type === 'line')).toHaveLength(1);
});

test('retângulo nasce agrupado; cotado fica preto e não arrasta (com aviso)', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('Escape');
  let sk = await sketch(page);
  expect(sk.groups).toHaveLength(1);
  expect(sk.groups[0].name).toBe('Retângulo 1');
  // Clique num lado seleciona o retângulo inteiro.
  await clickWorld(page, { x: 20, y: 20 });
  expect(await page.evaluate(() => (window as any).__magfem.selection)).toEqual([sk.groups[0].id]);
  await page.keyboard.press('Escape');
  // Cota largura e altura: tudo definido (preto).
  await page.keyboard.press('d');
  await clickWorld(page, { x: 20, y: 20 });
  await clickWorld(page, { x: 20, y: 30 });
  await typeDim(page, '40');
  await clickWorld(page, { x: 40, y: 10 });
  await clickWorld(page, { x: 50, y: 10 });
  await typeDim(page, '20');
  await page.keyboard.press('Escape');
  const defined = await page.evaluate(() => [...(window as any).__magfem.doc.defined]);
  sk = await sketch(page);
  for (const id of Object.keys(sk.entities)) expect(defined).toContain(id);
  // Tentar arrastar um vértice definido: não move e avisa.
  await dragWorld(page, { x: 40, y: 20 }, { x: 55, y: 30 });
  expect((await sketch(page)).entities).toEqual(sk.entities);
  await expect(page.locator('.status .msg')).toContainText('Totalmente definido');
  await page.screenshot({ path: 'test-results/r4-definido.png' });
});

test('na origem nasce "coincidente": cotado fica preto; apagar a restrição na árvore libera o arraste', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('d');
  await clickWorld(page, { x: 20, y: 20 });
  await clickWorld(page, { x: 20, y: 30 });
  await typeDim(page, '40');
  await clickWorld(page, { x: 40, y: 10 });
  await clickWorld(page, { x: 50, y: 10 });
  await typeDim(page, '20');
  await page.keyboard.press('Escape');
  let sk = await sketch(page);
  expect(sk.constraints.filter((c: any) => c.type === 'coincident' && c.refs.includes('O'))).toHaveLength(1);
  await clickWorld(page, { x: 20, y: 20 });
  await dragWorld(page, { x: 20, y: 20 }, { x: 30, y: 30 });
  await expect(page.locator('.status .msg')).toContainText('Totalmente definido');
  const tree = page.getByRole('tree');
  await tree.getByRole('treeitem', { name: /^Restrições/ }).click();
  await tree.getByRole('treeitem', { name: 'Coincidente' }).hover();
  await tree.getByRole('treeitem', { name: 'Coincidente' }).getByRole('button', { name: /Apagar restrição/ }).click();
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 20, y: 20 });
  await dragWorld(page, { x: 20, y: 20 }, { x: 30, y: 30 });
  sk = await sketch(page);
  const xs = Object.values(sk.entities).filter((e: any) => e.type === 'point' && e.id !== 'O').map((p: any) => Math.round(p.x));
  expect(Math.min(...xs)).toBe(10);
  expect(sk.entities.O).toMatchObject({ x: 0, y: 0 });
});

test('retângulo preso à origem (desenho antigo): aviso ao arrastar, "Soltar da origem" e então move', async ({ page }) => {
  // Desenhos antigos (e o console com "O") usam a própria Origem como vértice.
  const box = page.getByRole('textbox', { name: 'Console' });
  await box.fill('g.rectangle("O", (40, 20))');
  await box.press('Enter');
  await box.blur();
  await page.keyboard.press('d');
  await clickWorld(page, { x: 20, y: 20 });
  await clickWorld(page, { x: 20, y: 30 });
  await typeDim(page, '40');
  await clickWorld(page, { x: 40, y: 10 });
  await clickWorld(page, { x: 50, y: 10 });
  await typeDim(page, '20');
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 20, y: 20 }); // seleciona o retângulo (grupo)
  await dragWorld(page, { x: 20, y: 20 }, { x: 30, y: 30 });
  await expect(page.locator('.status .msg')).toContainText('própria Origem');
  await page.getByRole('button', { name: 'Soltar da origem' }).click();
  await expect(page.locator('.status .msg')).toHaveCount(0);
  await dragWorld(page, { x: 20, y: 20 }, { x: 30, y: 30 });
  const sk = await sketch(page);
  const xs = Object.values(sk.entities).filter((e: any) => e.type === 'point' && e.id !== 'O').map((p: any) => Math.round(p.x));
  expect(Math.min(...xs)).toBe(10);
  expect(sk.entities.O).toMatchObject({ x: 0, y: 0 });
  const code = await page.locator('.console .code').innerText();
  expect(code).toMatch(/p\d+ = g\.detach\("O", \["l\d+", "l\d+"\]\)/);
});

test('caixa como nos CADs: para a direita só o que está dentro, para a esquerda o que cruza', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  for (const c of ['a = g.line((0, 0), (20, 0))', 'b = g.line((0, 10), (50, 10))']) {
    await box.fill(c);
    await box.press('Enter');
  }
  const ids = async () => {
    const sk = await sketch(page);
    const lines = Object.values(sk.entities).filter((e: any) => e.type === 'line') as any[];
    return lines;
  };
  const [la, lb] = await ids();
  const sel = () => page.evaluate(() => (window as any).__magfem.selection as string[]);
  // Janela (esquerda → direita) de -5 a 30: só a linha curta cabe inteira.
  await dragWorld(page, { x: -5, y: -5 }, { x: 30, y: 15 });
  expect(await sel()).toContain(la.id);
  expect(await sel()).not.toContain(lb.id);
  await page.keyboard.press('Escape');
  // Cruzamento (direita → esquerda) no mesmo retângulo: as duas tocam a caixa.
  await dragWorld(page, { x: 30, y: 15 }, { x: -5, y: -5 });
  expect(await sel()).toEqual(expect.arrayContaining([la.id, lb.id]));
  // Cruzamento que só toca o meio da linha longa, sem pegar extremidades.
  await page.keyboard.press('Escape');
  await dragWorld(page, { x: 40, y: 12 }, { x: 35, y: 8 });
  expect(await sel()).toEqual([lb.id]);
});

test('axissimétrico: desenhar em r < 0 avisa que só vale o lado direito', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (c: string) => {
    await box.fill(c);
    await box.press('Enter');
  };
  await run('g.problem("axisymmetric")');
  await run('g.line((5, 0), (20, 10))');
  await expect(page.locator('.status')).not.toContainText('r ≥ 0');
  await run('g.line((-10, 0), (-2, 10))');
  await expect(page.locator('.status .msg')).toContainText('só vale o lado direito (r ≥ 0)');
  await page.screenshot({ path: 'test-results/axi-lado-esquerdo.png' });
});

test('linha: o segundo ponto também trava sobre uma curva, mesmo com a inferência horizontal', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  await box.fill('v = g.line((20, 0), (20, 40))');
  await box.press('Enter');
  await page.locator('canvas.sketch').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 10 });
  await clickWorld(page, { x: 20.2, y: 10.3 }); // perto da linha vertical e quase horizontal ao 1º ponto
  await page.keyboard.press('Escape');
  const sk = await sketch(page);
  const vline = Object.values(sk.entities).find((e: any) => e.type === 'line' && sk.entities[e.p1].x === 20 && sk.entities[e.p2].x === 20) as any;
  const on = sk.constraints.filter((c: any) => c.type === 'pointOn' && c.refs[1] === vline.id);
  expect(on).toHaveLength(1);
  const p = sk.entities[on[0].refs[0]];
  expect(p.x).toBeCloseTo(20, 6);
  expect(p.y).toBeCloseTo(10, 6); // horizontal ao primeiro ponto
  expect(sk.constraints.some((c: any) => c.type === 'horizontal')).toBe(true);
});

test('tesoura (X): apara a ponta da linha, divide ao meio, círculo vira arco e curva sem cortes some', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  for (const c of ['g.line((0, 0), (60, 0))', 'g.line((20, -10), (20, 10))', 'g.line((40, -10), (40, 10))', 'g.circle((100, 0), r=10)', 'g.line((95, -20), (95, 20))', 'g.line((0, 40), (30, 40))']) {
    await box.fill(c);
    await box.press('Enter');
  }
  await box.blur();
  await page.keyboard.press('x');
  const lines = async () => (Object.values((await sketch(page)).entities).filter((e: any) => e.type === 'line') as any[]);
  const horiz = async () => {
    const sk = await sketch(page);
    return (await lines()).filter((l) => Math.abs(sk.entities[l.p1].y) < 1e-6 && Math.abs(sk.entities[l.p2].y) < 1e-6).map((l) => [sk.entities[l.p1].x, sk.entities[l.p2].x].sort((a, b) => a - b));
  };
  // Trecho do meio (entre x = 20 e 40): a linha vira duas.
  await clickWorld(page, { x: 30, y: 0 });
  expect((await horiz()).sort((a, b) => a[0] - b[0])).toEqual([[0, 20], [40, 60]]);
  // Ponta (x > 40): encurta.
  await clickWorld(page, { x: 50, y: 0 });
  expect((await horiz()).sort((a, b) => a[0] - b[0])).toEqual([[0, 20]]);
  // Círculo cortado pela linha x = 95: tirar o lado direito deixa um arco.
  await clickWorld(page, { x: 110, y: 0 });
  let sk = await sketch(page);
  expect(Object.values(sk.entities).filter((e: any) => e.type === 'circle')).toHaveLength(0);
  expect(Object.values(sk.entities).filter((e: any) => e.type === 'arc')).toHaveLength(1);
  // Sem cortes: a curva inteira sai.
  await clickWorld(page, { x: 15, y: 40 });
  sk = await sketch(page);
  expect((await lines()).some((l) => sk.entities[l.p1].y === 40)).toBe(false);
  const code = await page.locator('.console .code').innerText();
  expect((code.match(/g\.trim\(/g) ?? []).length).toBe(4);
});

test('snap nos eixos: centro do círculo no eixo y fica vertical à Origem; linha termina no eixo x', async ({ page }) => {
  await page.keyboard.press('c');
  await clickWorld(page, { x: 0.2, y: 30 });
  await clickWorld(page, { x: 10, y: 30 });
  let sk = await sketch(page);
  const circ = Object.values(sk.entities).find((e: any) => e.type === 'circle') as any;
  expect(sk.entities[circ.c]).toMatchObject({ x: 0, y: 30 });
  expect(sk.constraints).toContainEqual(expect.objectContaining({ type: 'vertical', refs: [circ.c, 'O'] }));
  await page.keyboard.press('l');
  await clickWorld(page, { x: 20, y: 20 });
  await clickWorld(page, { x: 40, y: 0.2 });
  await page.keyboard.press('Escape');
  sk = await sketch(page);
  const line = Object.values(sk.entities).find((e: any) => e.type === 'line') as any;
  expect(sk.entities[line.p2].y).toBe(0);
  expect(sk.constraints).toContainEqual(expect.objectContaining({ type: 'horizontal', refs: [line.p2, 'O'] }));
});
