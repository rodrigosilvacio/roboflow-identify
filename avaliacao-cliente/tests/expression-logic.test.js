// Testes da lógica de expressão com blendshapes sintéticos.
// Rodar: node avaliacao-cliente/tests/expression-logic.test.js
const assert = require("node:assert/strict");
const { scores, classify, Session, summarize } = require("../expression-logic.js");

const face = (o = {}) => ({
  mouthSmileLeft: 0.02, mouthSmileRight: 0.02, mouthFrownLeft: 0.01, mouthFrownRight: 0.01,
  mouthPressLeft: 0.05, mouthPressRight: 0.05, browInnerUp: 0.08, ...o,
});
const SMILE = face({ mouthSmileLeft: 0.8, mouthSmileRight: 0.75 });
const SERIOUS = face();
const SAD = face({ mouthFrownLeft: 0.18, mouthFrownRight: 0.16, browInnerUp: 0.45, mouthPressLeft: 0.2, mouthPressRight: 0.2 });
const FAINT_SMILE = face({ mouthSmileLeft: 0.3, mouthSmileRight: 0.25 });
const SURPRISE = face({ browInnerUp: 0.6 }); // sobrancelha levantada sem boca para baixo

const cases = [];
const test = (n, f) => cases.push([n, f]);

test("sorriso: feliz", () => assert.equal(classify(scores(SMILE)), "feliz"));
test("rosto sério: neutro", () => assert.equal(classify(scores(SERIOUS)), "neutro"));
test("boca para baixo e sobrancelha interna levantada: triste", () => assert.equal(classify(scores(SAD)), "triste"));
test("sorriso discreto: neutro (não força satisfação)", () => assert.equal(classify(scores(FAINT_SMILE)), "neutro"));
test("só sobrancelha levantada (surpresa): não é triste", () => assert.notEqual(classify(scores(SURPRISE)), "triste"));
test("aceita o formato do MediaPipe (lista de categorias)", () => {
  const list = Object.entries(SMILE).map(([categoryName, score]) => ({ categoryName, score }));
  assert.equal(classify(scores(list)), "feliz");
});
test("sem rosto: sem_rosto", () => assert.equal(classify(scores(null)), "sem_rosto"));

test("sessão: maioria vence uma piscada de sorriso", () => {
  const s = new Session();
  for (let i = 0; i < 20; i++) s.add(i === 10 ? SMILE : SERIOUS);
  const r = s.result();
  assert.equal(r.label, "neutro");
  assert.ok(r.confidence > 0.9);
});
test("sessão: começa sério e sorri na maior parte: feliz", () => {
  const s = new Session();
  for (let i = 0; i < 24; i++) s.add(i < 8 ? SERIOUS : SMILE);
  assert.equal(s.result().label, "feliz");
});
test("sessão com poucos quadros de rosto: sem_rosto", () => {
  const s = new Session();
  for (let i = 0; i < 20; i++) s.add(i < 5 ? SMILE : null);
  assert.equal(s.result().label, "sem_rosto");
});
test("sessão empatada: prefere neutro", () => {
  const s = new Session();
  for (let i = 0; i < 20; i++) s.add(i % 2 ? SMILE : SAD);
  assert.equal(s.result().label, "neutro");
});

test("painel: satisfação, índice e acerto da câmera", () => {
  const r = summarize([
    { source: "camera", suggested: "feliz", final: "feliz" },
    { source: "camera", suggested: "neutro", final: "feliz" },
    { source: "camera", suggested: "triste", final: "triste" },
    { source: "toque", final: "neutro" },
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.satisfaction, 0.5);
  assert.equal(r.index, 25);           // 50% satisfeitos - 25% insatisfeitos
  assert.equal(r.cameraUses, 3);
  assert.equal(Math.round(r.cameraAccuracy * 100), 67);
});
test("painel vazio não quebra", () => {
  const r = summarize([]);
  assert.equal(r.total, 0); assert.equal(r.cameraAccuracy, null);
});

let fail = 0;
for (const [n, f] of cases) {
  try { f(); console.log("ok  ", n); } catch (e) { fail++; console.log("FAIL", n, "\n     ", e.message.split("\n")[0]); }
}
console.log(`\n${cases.length - fail}/${cases.length} passaram`);
process.exit(fail ? 1 : 0);
