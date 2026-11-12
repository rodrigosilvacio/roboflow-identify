// Testes da lógica da Vitrine por Gestos.
// Rodar: node vitrine-maos/tests/hand-logic.test.js
const assert = require("node:assert/strict");
const { OneEuroFilter, mapToScreen, PinchDetector, DwellSelector, TargetHistory, AttentionTracker } = require("../hand-logic.js");

// Mão sintética: punho em (wx, wy), tamanho s; pinchGap = distância polegar-indicador em "tamanhos de mão"
function hand({ wx = 0.5, wy = 0.7, s = 0.15, pinchGap = 0.8 } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: wx, y: wy, z: 0 }));
  lm[9] = { x: wx, y: wy - s, z: 0 };               // base do dedo médio
  lm[8] = { x: wx + 0.02, y: wy - 1.6 * s, z: 0 };  // ponta do indicador
  lm[4] = { x: lm[8].x + pinchGap * s, y: lm[8].y, z: 0 }; // ponta do polegar
  return lm;
}

const cases = [];
const test = (n, f) => cases.push([n, f]);

test("filtro: parado com ruído fica estável", () => {
  const f = new OneEuroFilter();
  let out = [];
  for (let i = 0; i < 90; i++) out.push(f.filter(0.5 + (i % 2 ? 0.01 : -0.01), i * 33));
  const tail = out.slice(-30);
  const spread = Math.max(...tail) - Math.min(...tail);
  assert.ok(spread < 0.01, `oscilação ${spread.toFixed(4)} deveria ser menor que o ruído (0,02)`);
});
test("filtro: movimento rápido acompanha sem atraso grande", () => {
  const f = new OneEuroFilter();
  let v;
  for (let i = 0; i < 15; i++) v = f.filter(0.2, i * 33);
  for (let i = 15; i < 30; i++) v = f.filter(0.2 + (i - 14) * 0.04, i * 33); // anda 0,6 em 0,5 s
  assert.ok(v > 0.72, `posição filtrada ${v.toFixed(2)} deveria estar perto de 0,8 (atraso de até ~0,08 da tela)`);
});

test("área ativa: centro da câmera vira centro da tela", () => {
  const p = mapToScreen({ x: 0.5, y: 0.45 });
  assert.ok(Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - 0.5) < 1e-9);
});
test("área ativa: espelhado (mão à direita do usuário = cursor à direita)", () => {
  // Na imagem da câmera, a direita do usuário aparece à esquerda (x pequeno)
  assert.ok(mapToScreen({ x: 0.2, y: 0.5 }).x > 0.9);
});
test("área ativa: fora da área fica preso na borda", () => {
  const p = mapToScreen({ x: 0.0, y: 1.0 });
  assert.equal(p.x, 1); assert.equal(p.y, 1);
});

test("pinça: fecha, segura e abre com histerese", () => {
  const d = new PinchDetector();
  const evs = [0.8, 0.5, 0.25, 0.3, 0.35, 0.3, 0.5].map((g) => d.update(hand({ pinchGap: g })).event);
  assert.deepEqual(evs, [null, null, "down", null, null, null, "up"]);
});
test("pinça: independe do tamanho da mão (perto ou longe)", () => {
  const near = new PinchDetector(), far = new PinchDetector();
  assert.equal(near.update(hand({ s: 0.25, pinchGap: 0.2 })).event, "down");
  assert.equal(far.update(hand({ s: 0.08, pinchGap: 0.2 })).event, "down");
});
test("pinça: mão some enquanto fechada solta a pinça", () => {
  const d = new PinchDetector();
  d.update(hand({ pinchGap: 0.2 }));
  assert.equal(d.update(null).event, "up");
});

test("permanência: seleciona após 1,2 s parado no mesmo produto", () => {
  const s = new DwellSelector();
  let sel = null;
  for (let t = 0; t <= 1300; t += 33) { const r = s.update("banana", t); if (r.selected) sel = r.selected; }
  assert.equal(sel, "banana");
});
test("permanência: passar por cima rápido não seleciona (toque de Midas)", () => {
  const s = new DwellSelector();
  const path = ["banana", "pera", "maca", "uva", "leite", "queijo"];
  let sel = [];
  path.forEach((id, i) => { for (let k = 0; k < 9; k++) { const r = s.update(id, i * 300 + k * 33); if (r.selected) sel.push(r.selected); } });
  assert.deepEqual(sel, []);
});
test("permanência: tremor curto (perde o alvo por 100 ms) não zera", () => {
  const s = new DwellSelector();
  let sel = null, t = 0;
  for (; t < 700; t += 33) s.update("banana", t);
  for (let k = 0; k < 3; k++, t += 33) s.update(null, t);        // ~100 ms fora
  for (; t < 1500; t += 33) { const r = s.update("banana", t); if (r.selected) sel = r.selected; }
  assert.equal(sel, "banana");
});
test("permanência: não repete o mesmo produto sem sair dele", () => {
  const s = new DwellSelector();
  let n = 0;
  for (let t = 0; t <= 5000; t += 33) if (s.update("banana", t).selected) n++;
  assert.equal(n, 1);
});
test("permanência: sair e voltar permite selecionar de novo", () => {
  const s = new DwellSelector();
  let n = 0, t = 0;
  for (; t <= 1300; t += 33) if (s.update("banana", t).selected) n++;
  for (let k = 0; k < 10; k++, t += 33) s.update("pera", t);
  for (let k = 0; k < 45; k++, t += 33) if (s.update("banana", t).selected) n++;
  assert.equal(n, 2);
});
test("permanência: produto selecionado por pinça não é repetido pela permanência", () => {
  const s = new DwellSelector();
  for (let t = 0; t < 300; t += 33) s.update("pera", t);
  s.consumed("pera");
  let n = 0;
  for (let t = 300; t < 3000; t += 33) if (s.update("pera", t).selected) n++;
  assert.equal(n, 0);
});

test("histórico: pinça usa o alvo de 150 ms antes (o dedo se desloca ao fechar)", () => {
  const h = new TargetHistory();
  h.push("banana", 0); h.push("banana", 100); h.push("pera", 200); h.push("pera", 250);
  assert.equal(h.at(250 - 150), "banana");
});

test("atenção: soma o tempo por produto e ignora pausas longas", () => {
  const a = new AttentionTracker();
  for (let t = 0; t <= 1000; t += 50) a.update("banana", t);
  a.update(null, 1100);
  a.update("pera", 5000);   // pausa de 3,9 s (aba parada) conta no máximo 250 ms
  a.update("pera", 5050);
  assert.ok(Math.abs(a.get("banana") - 1000) <= 50, `banana ${a.get("banana")}`);
  assert.ok(a.get("pera") <= 300, `pera ${a.get("pera")}`);
});

let fail = 0;
for (const [n, f] of cases) {
  try { f(); console.log("ok  ", n); } catch (e) { fail++; console.log("FAIL", n, "\n     ", e.message.split("\n")[0]); }
}
console.log(`\n${cases.length - fail}/${cases.length} passaram`);
process.exit(fail ? 1 : 0);
