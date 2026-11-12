// Testes da navegação por gestos do Armazém 3D (palma e pinça).
// Rodar: node armazem-3d/tests/gesture-nav.test.js
const assert = require("node:assert/strict");
const { PalmNavigator, PinchDrag, classifyGesture } = require("../../shared/hand-logic.js");

const cases = [];
const test = (n, f) => cases.push([n, f]);

test("palma parada com tremor: não mexe a vista", () => {
  const n = new PalmNavigator();
  let moved = 0, zoomed = 0;
  for (let i = 0; i < 60; i++) {
    const r = n.update({ x: 0.5 + (i % 2 ? 0.0006 : -0.0006), y: 0.5 }, 0.15 + (i % 2 ? 0.0003 : -0.0003));
    if (r.dx || r.dy) moved++; if (r.zoom !== 1) zoomed++;
  }
  assert.equal(moved, 0); assert.equal(zoomed, 0);
});
test("palma para a direita: desloca para a direita", () => {
  const n = new PalmNavigator();
  let sum = 0;
  for (let i = 0; i < 20; i++) sum += n.update({ x: 0.4 + i * 0.01, y: 0.5 }, 0.15).dx;
  assert.ok(sum > 0.12, `deslocamento ${sum.toFixed(3)}`);
});
test("palma se aproximando da câmera (mão maior): zoom de aproximação", () => {
  const n = new PalmNavigator();
  let z = 1;
  for (let i = 0; i < 20; i++) z *= n.update({ x: 0.5, y: 0.5 }, 0.12 + i * 0.004).zoom;
  assert.ok(z > 1.4, `zoom acumulado ${z.toFixed(2)}`);
});
test("palma se afastando: zoom de afastamento", () => {
  const n = new PalmNavigator();
  let z = 1;
  for (let i = 0; i < 20; i++) z *= n.update({ x: 0.5, y: 0.5 }, 0.2 - i * 0.004).zoom;
  assert.ok(z < 0.7, `zoom acumulado ${z.toFixed(2)}`);
});
test("palma some: sem salto ao voltar", () => {
  const n = new PalmNavigator();
  n.update({ x: 0.2, y: 0.2 }, 0.15); n.update({ x: 0.2, y: 0.2 }, 0.15);
  n.update(null, 0);
  const r = n.update({ x: 0.9, y: 0.9 }, 0.3);
  assert.deepEqual(r, { dx: 0, dy: 0, zoom: 1 });
});

test("pinça curta e parada: clique", () => {
  const d = new PinchDrag();
  assert.equal(d.update(true, { x: 100, y: 100 }, 0).phase, "down");
  d.update(true, { x: 103, y: 101 }, 100);
  const up = d.update(false, { x: 103, y: 101 }, 250);
  assert.equal(up.phase, "up"); assert.equal(up.click, true);
});
test("pinça com movimento: arrasto, não clique", () => {
  const d = new PinchDrag();
  d.update(true, { x: 100, y: 100 }, 0);
  let total = 0;
  for (let i = 1; i <= 10; i++) total += d.update(true, { x: 100 + i * 8, y: 100 }, i * 33).dx;
  const up = d.update(false, { x: 180, y: 100 }, 400);
  assert.equal(up.click, false);
  assert.ok(total > 50, `arrasto ${total}`);
});
test("pinça longa parada: não é clique (segurou)", () => {
  const d = new PinchDrag();
  d.update(true, { x: 100, y: 100 }, 0);
  d.update(true, { x: 101, y: 100 }, 500);
  assert.equal(d.update(false, { x: 101, y: 100 }, 900).click, false);
});

// Gesto da palma aberta é reconhecido (mesma mão anatômica dos testes da vitrine)
test("mão com todos os dedos esticados é palma aberta", () => {
  const w = { x: 0.5, y: 0.8 }, lm = Array.from({ length: 21 }, () => ({ ...w }));
  lm[9] = { x: 0.5, y: 0.65 };
  [[8, 6, .44], [12, 10, .5], [16, 14, .56], [20, 18, .61]].forEach(([t, p, x]) => { lm[p] = { x, y: 0.58 }; lm[t] = { x, y: 0.45 }; });
  lm[4] = { x: 0.36, y: 0.66 };
  assert.equal(classifyGesture(lm), "aberta");
});

let fail = 0;
for (const [n, f] of cases) {
  try { f(); console.log("ok  ", n); } catch (e) { fail++; console.log("FAIL", n, "\n     ", e.message.split("\n")[0]); }
}
console.log(`\n${cases.length - fail}/${cases.length} passaram`);
process.exit(fail ? 1 : 0);
