// Testes da lógica de queda com esqueletos sintéticos (30 quadros/s).
// Rodar: node detector-queda/tests/fall-logic.test.js
const assert = require("node:assert/strict");
const { FallDetector } = require("../fall-logic.js");

let FPS = 30, DT = 1000 / FPS;
const setFps = (f) => { FPS = f; DT = 1000 / f; };
const T = 0.18; // comprimento do tronco (fração da altura da imagem)

// Gera 33 pontos a partir do centro do quadril, ângulo do tronco e modo das pernas
function pose({ hx, hy, angle = 0, legs = "down", upperOnly = false }) {
  const r = (angle * Math.PI) / 180;
  const ux = Math.sin(r), uy = -Math.cos(r);             // direção quadril -> ombro
  const sh = { x: hx + ux * T, y: hy + uy * T };
  const nose = { x: sh.x + ux * 0.35 * T, y: sh.y + uy * 0.35 * T };
  let knee, ank;
  if (legs === "down") { knee = { x: hx, y: hy + 1.1 * T }; ank = { x: hx, y: hy + 2.2 * T }; }
  else if (legs === "sit") { knee = { x: hx + 1.0 * T, y: hy }; ank = { x: hx + 1.0 * T, y: hy + 1.0 * T }; }
  else { knee = { x: hx - ux * 1.1 * T, y: hy - uy * 1.1 * T }; ank = { x: hx - ux * 2.2 * T, y: hy - uy * 2.2 * T }; } // ao longo do corpo
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const put = (i, p, dx = 0) => (lm[i] = { x: p.x + dx, y: p.y, z: 0, visibility: 0.99 });
  put(0, nose); put(11, sh, -0.02); put(12, sh, 0.02); put(23, { x: hx, y: hy }, -0.015); put(24, { x: hx, y: hy }, 0.015);
  if (!upperOnly) { put(25, knee, -0.01); put(26, knee, 0.01); put(27, ank, -0.01); put(28, ank, 0.01); }
  return lm;
}

const lerp = (a, b, k) => a + (b - a) * k;
// Monta uma sequência: lista de [duração ms, de, para] com interpolação; null = pessoa fora do quadro
function run(segments, opts) {
  const det = new FallDetector(opts);
  const events = [];
  let t = 0;
  for (const [ms, from, to] of segments) {
    const n = Math.max(1, Math.round(ms / DT));
    for (let i = 1; i <= n; i++) {
      t += DT;
      let lm = null;
      if (from) {
        const k = i / n, e = to || from;
        lm = pose({ hx: lerp(from.hx, e.hx, k), hy: lerp(from.hy, e.hy, k), angle: lerp(from.angle || 0, e.angle || 0, k), legs: k < 0.5 ? from.legs || "down" : e.legs || "down", upperOnly: from.upperOnly });
      }
      const out = det.update(lm, t);
      for (const ev of out.events) events.push(ev.type);
    }
  }
  return { events, det };
}

const STAND = { hx: 0.5, hy: 0.5, angle: 0, legs: "down" };
const LYING = { hx: 0.5, hy: 0.85, angle: 85, legs: "line" };
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

test("parado em pé: nada", () => {
  const { events } = run([[5000, STAND]]);
  assert.deepEqual(events, []);
});
test("andando de lado: nada", () => {
  const { events } = run([[3000, STAND, { ...STAND, hx: 0.75 }], [3000, { ...STAND, hx: 0.75 }, { ...STAND, hx: 0.3 }]]);
  assert.deepEqual(events, []);
});
test("sentando numa cadeira em 1,2 s: nada", () => {
  const SIT = { hx: 0.5, hy: 0.65, angle: 10, legs: "sit" };
  const { events } = run([[1000, STAND], [1200, STAND, SIT], [5000, SIT]]);
  assert.deepEqual(events, []);
});
test("abaixando devagar para pegar algo: nada", () => {
  const BEND = { hx: 0.5, hy: 0.55, angle: 65, legs: "down" };
  const { events } = run([[1000, STAND], [1800, STAND, BEND], [2500, BEND], [1500, BEND, STAND], [1000, STAND]]);
  assert.deepEqual(events, []);
});
test("queda e fica no chão: suspeita e depois alarme", () => {
  const { events, det } = run([[1000, STAND], [600, STAND, LYING], [5000, LYING]]);
  assert.deepEqual(events, ["possivel_queda", "queda_confirmada"]);
  assert.equal(det.phase, "alarme");
});
test("queda e levanta em 1,5 s: suspeita e recuperou, sem alarme", () => {
  const { events, det } = run([[1000, STAND], [600, STAND, LYING], [600, LYING], [900, LYING, STAND], [3000, STAND]]);
  assert.deepEqual(events, ["possivel_queda", "recuperou"]);
  assert.equal(det.phase, "normal");
});
test("movimento brusco do tronco: um alerta (com intervalo)", () => {
  const { events } = run([[1000, STAND], [200, STAND, { ...STAND, hx: 0.75 }], [200, { ...STAND, hx: 0.75 }, STAND], [2000, STAND]]);
  assert.deepEqual(events, ["movimento_brusco"]);
});
test("cai para fora do quadro: suspeita e alarme", () => {
  const LOW = { hx: 0.5, hy: 0.85, angle: 60, legs: "line" };
  const { events } = run([[1000, STAND], [400, STAND, LOW], [5000, null]]);
  assert.deepEqual(events, ["possivel_queda", "queda_confirmada"]);
});
test("sai do quadro andando: nada", () => {
  const { events } = run([[1000, STAND], [1500, STAND, { ...STAND, hx: 0.95 }], [5000, null]]);
  assert.deepEqual(events, []);
});
test("alarme some ao reconhecer ('Estou bem')", () => {
  const { det } = run([[1000, STAND], [600, STAND, LYING], [5000, LYING]]);
  det.acknowledge();
  assert.equal(det.phase, "normal");
});
test("deitado muito tempo (opcional): alarme após 30 s", () => {
  const { events } = run([[1000, STAND], [3000, STAND, LYING], [31000, LYING]], { longLieEnabled: true });
  assert.ok(events.includes("queda_confirmada"));
  const off = run([[1000, STAND], [3000, STAND, LYING], [31000, LYING]]);
  assert.deepEqual(off.events, []);
});

test("senta de uma vez (0,5 s), ficando ereto: nada", () => {
  const SIT = { hx: 0.5, hy: 0.65, angle: 10, legs: "sit" };
  const { events } = run([[1000, STAND], [500, STAND, SIT], [5000, SIT]]);
  assert.deepEqual(events, []);
});
test("desmaio lento (3 s até o chão): só com a opção de tempo deitado", () => {
  const slow = [[1000, STAND], [3000, STAND, LYING], [8000, LYING]];
  assert.deepEqual(run(slow).events, []); // limite conhecido: sem descida rápida, não há suspeita
  const withOpt = run([[1000, STAND], [3000, STAND, LYING], [31000, LYING]], { longLieEnabled: true });
  assert.ok(withOpt.events.includes("queda_confirmada"));
});

for (const fps of [5, 10]) {
  test(`queda a ${fps} quadros/s (computador sem GPU): suspeita e alarme`, () => {
    setFps(fps);
    try {
      const { events } = run([[1500, STAND], [600, STAND, LYING], [5000, LYING]]);
      assert.deepEqual(events, ["possivel_queda", "queda_confirmada"]);
    } finally { setFps(30); }
  });
  test(`sentar a ${fps} quadros/s: nada`, () => {
    setFps(fps);
    try {
      const SIT = { hx: 0.5, hy: 0.65, angle: 10, legs: "sit" };
      assert.deepEqual(run([[1500, STAND], [800, STAND, SIT], [4000, SIT]]).events, []);
    } finally { setFps(30); }
  });
}
test("webcam de mesa (sem pernas) em pé é reconhecida como ereta", () => {
  const { det } = run([[2000, { ...STAND, upperOnly: true }]]);
  assert.equal(det.posture, "em_pe");
});
test("tombar de lado (gira o tronco rápido, desce menos): suspeita e alarme", () => {
  const TIP = { hx: 0.62, hy: 0.68, angle: 82, legs: "line" };
  const { events } = run([[1000, STAND], [500, STAND, TIP], [5000, TIP]]);
  assert.deepEqual(events, ["possivel_queda", "queda_confirmada"]);
});

let fail = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log("ok  ", name); }
  catch (e) { fail++; console.log("FAIL", name, "\n     ", e.message.split("\n").slice(0, 4).join("\n      ")); }
}
console.log(`\n${cases.length - fail}/${cases.length} passaram`);
process.exit(fail ? 1 : 0);
