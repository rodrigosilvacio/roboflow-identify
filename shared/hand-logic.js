/*
 * Lógica da Vitrine por Gestos (sem dependência do navegador, testável no Node).
 *
 * Entrada por quadro: 21 pontos da mão do MediaPipe Hand Landmarker (x, y normalizados 0..1).
 *   0 = punho, 4 = ponta do polegar, 8 = ponta do indicador, 9 = base do dedo médio.
 *
 * Peças:
 *  - OneEuroFilter: suaviza o cursor (firme parado, ágil em movimento rápido).
 *  - mapToScreen: só o centro da câmera (área ativa) vira a tela inteira, e espelhado.
 *  - PinchDetector: pinça polegar + indicador com histerese (não "pisca").
 *  - DwellSelector: seleciona ao parar sobre o produto por um tempo (com tolerância a tremor).
 *  - TargetHistory: lembra o que estava sob o cursor há pouco (a pinça desloca o dedo).
 *  - AttentionTracker: soma o tempo de atenção por produto.
 */
(function (root) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // ---------- Filtro One Euro (Casiez et al., 2012) ----------
  class LowPass {
    constructor() { this.y = null; }
    filter(x, a) { this.y = this.y === null ? x : a * x + (1 - a) * this.y; return this.y; }
  }
  const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };
  class OneEuroFilter {
    // Calibrado para coordenadas de 0 a 1: tremor parado cai ~9x, e o atraso em movimento rápido fica em ~4% da tela
    constructor({ minCutoff = 1.0, beta = 4, dCutoff = 1.0 } = {}) {
      Object.assign(this, { minCutoff, beta, dCutoff });
      this.x = new LowPass(); this.dx = new LowPass(); this.lastT = null; this.lastX = null;
    }
    reset() { this.x = new LowPass(); this.dx = new LowPass(); this.lastT = null; this.lastX = null; }
    filter(value, tMs) {
      if (this.lastT === null) { this.lastT = tMs; this.lastX = value; this.dx.filter(0, 1); return this.x.filter(value, 1); }
      const dt = Math.max(1e-3, (tMs - this.lastT) / 1000);
      const d = (value - this.lastX) / dt;
      const ed = this.dx.filter(d, alpha(this.dCutoff, dt));
      const cutoff = this.minCutoff + this.beta * Math.abs(ed);
      this.lastT = tMs; this.lastX = value;
      return this.x.filter(value, alpha(cutoff, dt));
    }
  }
  class PointFilter {
    constructor(opts) { this.fx = new OneEuroFilter(opts); this.fy = new OneEuroFilter(opts); }
    reset() { this.fx.reset(); this.fy.reset(); }
    filter(p, t) { return { x: this.fx.filter(p.x, t), y: this.fy.filter(p.y, t) }; }
  }

  // ---------- Área ativa: centro da câmera -> tela inteira ----------
  const DEFAULT_BOX = { x0: 0.15, x1: 0.85, y0: 0.12, y1: 0.78 };
  function mapToScreen(p, box = DEFAULT_BOX, mirror = true) {
    const x = clamp01((p.x - box.x0) / (box.x1 - box.x0));
    const y = clamp01((p.y - box.y0) / (box.y1 - box.y0));
    return { x: mirror ? 1 - x : x, y };
  }

  // ---------- Pinça com histerese ----------
  const handSize = (lm) => dist(lm[0], lm[9]) || 1e-6; // punho até a base do dedo médio
  class PinchDetector {
    constructor({ down = 0.28, up = 0.42 } = {}) { this.down = down; this.up = up; this.pinched = false; }
    reset() { this.pinched = false; }
    update(lm) {
      if (!lm) { const was = this.pinched; this.pinched = false; return { pinched: false, event: was ? "up" : null, ratio: null }; }
      const ratio = dist(lm[4], lm[8]) / handSize(lm);
      let event = null;
      if (!this.pinched && ratio < this.down) { this.pinched = true; event = "down"; }
      else if (this.pinched && ratio > this.up) { this.pinched = false; event = "up"; }
      return { pinched: this.pinched, event, ratio };
    }
  }

  // ---------- Seleção por permanência ----------
  class DwellSelector {
    constructor({ dwellMs = 1200, graceMs = 180 } = {}) {
      Object.assign(this, { dwellMs, graceMs });
      this.reset();
    }
    reset() { this.target = null; this.since = 0; this.lastSeen = 0; this.done = null; }
    // Depois de selecionar, o mesmo produto só pode ser selecionado de novo após sair dele.
    consumed(id) { this.done = id; }
    update(id, t) {
      // Tolerância: perder o alvo por poucos milissegundos (tremor) não zera o progresso
      if (id === null && this.target !== null && t - this.lastSeen <= this.graceMs) id = this.target;
      if (id !== this.target) {
        if (this.done !== null && id !== this.done) this.done = null; // saiu do produto já selecionado
        this.target = id; this.since = t;
      }
      if (id !== null) this.lastSeen = t;
      if (id === null || id === this.done) return { target: id, progress: 0, selected: null };
      const progress = Math.min(1, (t - this.since) / this.dwellMs);
      if (progress >= 1) { this.done = id; return { target: id, progress: 1, selected: id }; }
      return { target: id, progress, selected: null };
    }
  }

  // ---------- O que estava sob o cursor há pouco ----------
  class TargetHistory {
    constructor(keepMs = 600) { this.keepMs = keepMs; this.items = []; }
    push(id, t) { this.items.push({ id, t }); while (this.items.length && t - this.items[0].t > this.keepMs) this.items.shift(); }
    at(t) { // alvo no instante t (o mais recente antes dele)
      let found = null;
      for (const it of this.items) { if (it.t <= t) found = it.id; else break; }
      return found;
    }
  }

  // ---------- Tempo de atenção por produto ----------
  class AttentionTracker {
    constructor({ maxStepMs = 250 } = {}) { this.maxStepMs = maxStepMs; this.ms = {}; this.lastT = null; }
    update(id, t) {
      if (this.lastT !== null && id) this.ms[id] = (this.ms[id] || 0) + Math.min(t - this.lastT, this.maxStepMs);
      this.lastT = t;
    }
    get(id) { return this.ms[id] || 0; }
    reset() { this.ms = {}; this.lastT = null; }
  }

  // ---------- Gestos pelos dedos esticados ----------
  // Dedo esticado: a ponta está bem mais longe do punho que a articulação do meio (PIP).
  const FINGERS = { index: [8, 6], middle: [12, 10], ring: [16, 14], pinky: [20, 18] };
  function fingerStates(lm) {
    const out = {};
    for (const [name, [tip, pip]] of Object.entries(FINGERS)) out[name] = dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.12;
    return out;
  }
  // aponta (☝️), pinca (🤏), punho (✊) ou aberta (✋)
  function classifyGesture(lm, pinched = false) {
    if (!lm) return null;
    if (pinched) return "pinca";
    const f = fingerStates(lm);
    const others = [f.middle, f.ring, f.pinky].filter(Boolean).length;
    if (!f.index && others === 0) return "punho";
    if (f.index && others <= 1) return "aponta";
    if (f.index && others >= 2) return "aberta";
    return "punho"; // indicador dobrado com outros dedos esticados: trata como mão fechada
  }
  // Evita "piscar" entre gestos: só troca depois de estável por alguns milissegundos
  class GestureStabilizer {
    constructor(holdMs = 120) { this.holdMs = holdMs; this.current = null; this.candidate = null; this.since = 0; }
    reset() { this.current = null; this.candidate = null; }
    update(g, t) {
      if (g === this.current) { this.candidate = null; return this.current; }
      if (g !== this.candidate) { this.candidate = g; this.since = t; }
      // a pinça e a perda da mão valem na hora (seleção precisa ser imediata)
      if (g === "pinca" || g === null || t - this.since >= this.holdMs) { this.current = g; this.candidate = null; }
      return this.current;
    }
  }

  // ---------- Zoom com as duas mãos em pinça ----------
  // Pontos de pinça já em coordenadas de tela. Retorna fator de zoom e deslocamento desde o quadro anterior.
  class TwoHandZoom {
    constructor() { this.prev = null; }
    reset() { this.prev = null; }
    update(a, b) {
      if (!a || !b) { this.prev = null; return { active: false }; }
      const d = Math.max(1e-6, Math.hypot(a.x - b.x, a.y - b.y));
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!this.prev) { this.prev = { d, c }; return { active: true, factor: 1, center: c, pan: { x: 0, y: 0 } }; }
      const out = { active: true, factor: d / this.prev.d, center: c, pan: { x: c.x - this.prev.c.x, y: c.y - this.prev.c.y } };
      this.prev = { d, c };
      return out;
    }
  }

  // ---------- Arrastar com a mão fechada ----------
  class GrabPan {
    constructor() { this.prev = null; }
    reset() { this.prev = null; }
    update(p) { // p: posição da mão na tela, ou null quando solta
      if (!p) { this.prev = null; return { x: 0, y: 0 }; }
      const d = this.prev ? { x: p.x - this.prev.x, y: p.y - this.prev.y } : { x: 0, y: 0 };
      this.prev = p;
      return d;
    }
  }

  // ---------- Palma em movimento: desloca a vista; aproximar/afastar a palma dá zoom ----------
  // p: centro da palma em coordenadas de tela (0..1); size: tamanho da mão (punho até a base do médio).
  // Mão perto da câmera parece maior: o aumento do tamanho vira zoom de aproximação.
  class PalmNavigator {
    constructor({ smoothing = 0.5, moveDeadzone = 0.002, zoomDeadzone = 0.006 } = {}) {
      Object.assign(this, { smoothing, moveDeadzone, zoomDeadzone });
      this.reset();
    }
    reset() { this.prev = null; this.f = null; }
    update(p, size) {
      if (!p || !size) { this.reset(); return { dx: 0, dy: 0, zoom: 1 }; }
      const a = this.f ? this.smoothing : 0;
      this.f = this.f
        ? { x: this.f.x * a + p.x * (1 - a), y: this.f.y * a + p.y * (1 - a), s: this.f.s * a + size * (1 - a) }
        : { x: p.x, y: p.y, s: size };
      if (!this.prev) { this.prev = { ...this.f }; return { dx: 0, dy: 0, zoom: 1 }; }
      let dx = this.f.x - this.prev.x, dy = this.f.y - this.prev.y;
      if (Math.hypot(dx, dy) < this.moveDeadzone) { dx = 0; dy = 0; }
      let zoom = this.f.s / this.prev.s;
      if (Math.abs(Math.log(zoom)) < this.zoomDeadzone) zoom = 1;
      this.prev = { ...this.f };
      return { dx, dy, zoom };
    }
  }

  // ---------- Pinça: clicar e arrastar ----------
  // Pinça curta, sem mexer, é um clique. Pinça com movimento é arrasto (devolve o deslocamento por quadro).
  class PinchDrag {
    constructor({ clickTolerance = 14, maxClickMs = 600 } = {}) { Object.assign(this, { clickTolerance, maxClickMs }); this.state = null; }
    reset() { this.state = null; }
    update(pinched, p, t) { // p em pixels de tela
      if (pinched && !this.state) { this.state = { start: p, last: p, t0: t, moved: 0, dragging: false }; return { phase: "down", dx: 0, dy: 0 }; }
      if (pinched && this.state) {
        const dx = p.x - this.state.last.x, dy = p.y - this.state.last.y;
        this.state.moved = Math.max(this.state.moved, Math.hypot(p.x - this.state.start.x, p.y - this.state.start.y));
        this.state.last = p;
        if (!this.state.dragging && this.state.moved > this.clickTolerance) this.state.dragging = true;
        return { phase: this.state.dragging ? "drag" : "hold", dx: this.state.dragging ? dx : 0, dy: this.state.dragging ? dy : 0 };
      }
      if (!pinched && this.state) {
        const s = this.state; this.state = null;
        const click = !s.dragging && t - s.t0 <= this.maxClickMs;
        return { phase: "up", click, at: s.start, dx: 0, dy: 0 };
      }
      return { phase: "idle", dx: 0, dy: 0 };
    }
  }

  const api = { OneEuroFilter, PointFilter, mapToScreen, DEFAULT_BOX, handSize, PinchDetector, DwellSelector, TargetHistory, AttentionTracker, fingerStates, classifyGesture, GestureStabilizer, TwoHandZoom, GrabPan, PalmNavigator, PinchDrag };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HandLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
