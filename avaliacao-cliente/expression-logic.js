/*
 * Classificação de expressão facial a partir dos "blendshapes" do MediaPipe Face Landmarker
 * (52 medidas de 0 a 1, como mouthSmileLeft, mouthFrownRight, browInnerUp).
 *
 * Três rótulos, pensados para avaliação de atendimento:
 *   feliz   -> "Satisfeito"   (sorriso)
 *   neutro  -> "Neutro"       (sério; NÃO significa insatisfeito)
 *   triste  -> "Insatisfeito" (cantos da boca para baixo, sobrancelha interna levantada)
 *
 * A câmera só SUGERE. O cliente confirma ou corrige, e o painel mede o quanto a câmera acerta.
 * Funciona no navegador (window.ExpressionLogic) e no Node (module.exports) para testes.
 */
(function (root) {
  const DEFAULTS = {
    smileMin: 0.45,   // sorriso médio para "feliz"
    sadMin: 0.35,     // índice de tristeza para "triste"
    sadMaxSmile: 0.25,// com sorriso acima disso, não é tristeza
    minFrames: 8,     // quadros com rosto necessários numa sessão
  };

  const avg = (a, b) => ((a || 0) + (b || 0)) / 2;
  const clamp = (v) => Math.max(0, Math.min(1, v));

  // Aceita a lista de categorias do MediaPipe ou um objeto { nome: valor }
  function toMap(blendshapes) {
    if (!blendshapes) return null;
    if (Array.isArray(blendshapes)) {
      const m = {};
      for (const c of blendshapes) m[c.categoryName] = c.score;
      return m;
    }
    return blendshapes;
  }

  function scores(blendshapes) {
    const b = toMap(blendshapes);
    if (!b) return null;
    const smile = avg(b.mouthSmileLeft, b.mouthSmileRight);
    const frown = avg(b.mouthFrownLeft, b.mouthFrownRight);
    const press = avg(b.mouthPressLeft, b.mouthPressRight);
    const browInnerUp = b.browInnerUp || 0;
    // Tristeza: boca para baixo pesa mais; sobrancelha interna levantada e lábios apertados ajudam.
    // O sorriso "desconta", porque sorrir e franzir ao mesmo tempo é raro.
    // A sobrancelha só pesa junto com sinais na boca: sozinha ela indica surpresa, não tristeza.
    const mouthCue = Math.min(1, (frown + press) / 0.15);
    const sad = clamp(frown * 2.0 + Math.max(0, browInnerUp - 0.15) * 1.2 * mouthCue + press * 0.4 - smile * 0.8);
    return { smile, sad, frown, browInnerUp, press };
  }

  function classify(s, opt = DEFAULTS) {
    if (!s) return "sem_rosto";
    if (s.smile >= opt.smileMin) return "feliz";
    if (s.sad >= opt.sadMin && s.smile < opt.sadMaxSmile) return "triste";
    return "neutro";
  }

  // Uma sessão de ~3 s: junta vários quadros e decide por maioria (mais estável que um quadro só)
  class Session {
    constructor(options = {}) {
      this.opt = { ...DEFAULTS, ...options };
      this.frames = [];
      this.missing = 0;
    }
    add(blendshapes) {
      const s = scores(blendshapes);
      if (!s) { this.missing++; return null; }
      const label = classify(s, this.opt);
      this.frames.push({ ...s, label });
      return { ...s, label };
    }
    result() {
      const n = this.frames.length;
      if (n < this.opt.minFrames) return { label: "sem_rosto", confidence: 0, frames: n };
      const votes = { feliz: 0, neutro: 0, triste: 0 };
      for (const f of this.frames) votes[f.label]++;
      // Empate no topo: fica "neutro" (a leitura mais conservadora)
      const top = Math.max(votes.feliz, votes.neutro, votes.triste);
      const leaders = Object.keys(votes).filter((k) => votes[k] === top);
      const label = leaders.length === 1 ? leaders[0] : "neutro";
      const mean = (k) => this.frames.reduce((a, f) => a + f[k], 0) / n;
      return { label, confidence: votes[label] / n, frames: n, votes, smile: mean("smile"), sad: mean("sad") };
    }
  }

  const LABELS = {
    feliz: { nome: "Satisfeito", emoji: "😊" },
    neutro: { nome: "Neutro", emoji: "😐" },
    triste: { nome: "Insatisfeito", emoji: "☹️" },
  };

  // Indicadores do painel do gestor
  function summarize(records) {
    const total = records.length;
    const count = { feliz: 0, neutro: 0, triste: 0 };
    let camera = 0, cameraHits = 0;
    for (const r of records) {
      if (count[r.final] !== undefined) count[r.final]++;
      if (r.source === "camera" && r.suggested) { camera++; if (r.suggested === r.final) cameraHits++; }
    }
    const pct = (v) => (total ? v / total : 0);
    return {
      total, count,
      satisfaction: pct(count.feliz),
      // Índice no estilo NPS: % satisfeitos menos % insatisfeitos (de -100 a +100)
      index: total ? Math.round((pct(count.feliz) - pct(count.triste)) * 100) : 0,
      cameraUses: camera,
      cameraAccuracy: camera ? cameraHits / camera : null,
    };
  }

  const api = { scores, classify, Session, summarize, LABELS, DEFAULTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ExpressionLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
