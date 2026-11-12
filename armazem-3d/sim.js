// Simulação de gestos: uma mão sintética (21 pontos, como a do MediaPipe) segue um roteiro.
// Ela passa pelo MESMO caminho da câmera real, então mostra exatamente o que a sua mão faria.

const BOX = { x0: 0.15, x1: 0.85, y0: 0.12, y1: 0.78 }; // mesma área ativa de shared/hand-logic.js

// Mão anatômica: fx/fy = posição desejada do cursor na cena (0..1); g = gesto; s = tamanho (maior = mais perto)
export function synthHand(fx, fy, g = "aponta", s = 0.06) {
  const tip = { x: BOX.x0 + (1 - fx) * (BOX.x1 - BOX.x0), y: BOX.y0 + fy * (BOX.y1 - BOX.y0) };
  const lm = Array.from({ length: 21 }, () => ({ x: tip.x, y: tip.y, z: 0 }));
  const w = { x: tip.x, y: tip.y + 2.4 * s };
  lm[0] = w; lm[9] = { x: tip.x, y: tip.y + 1.4 * s };
  lm[5] = { x: tip.x - 0.15 * s, y: tip.y + 1.35 * s }; lm[13] = { x: tip.x + 0.45 * s, y: tip.y + 1.4 * s }; lm[17] = { x: tip.x + 0.8 * s, y: tip.y + 1.5 * s };
  const folded = (dx) => ({ x: tip.x + dx, y: w.y - 1.0 * s });
  lm[6] = { x: tip.x, y: tip.y + 0.7 * s }; lm[7] = { x: tip.x, y: tip.y + 0.35 * s };
  lm[8] = g === "punho" ? folded(0) : { ...tip };
  [[10, 11, 12, 0.3], [14, 15, 16, 0.6], [18, 19, 20, 0.9]].forEach(([pip, dip, t, dx]) => {
    lm[pip] = { x: tip.x + dx * s, y: tip.y + 0.9 * s };
    lm[t] = g === "aberta" ? { x: tip.x + dx * s, y: tip.y } : folded(dx * s);
    lm[dip] = { x: (lm[pip].x + lm[t].x) / 2, y: (lm[pip].y + lm[t].y) / 2 };
  });
  lm[2] = { x: tip.x - 0.7 * s, y: tip.y + 1.8 * s }; lm[3] = { x: tip.x - 0.9 * s, y: tip.y + 1.5 * s };
  lm[1] = { x: tip.x - 0.4 * s, y: tip.y + 2.1 * s };
  lm[4] = g === "pinca" ? { x: lm[8].x + 0.1 * s, y: lm[8].y } : { x: tip.x - 1.0 * s, y: tip.y + 1.2 * s };
  return lm;
}

// Roteiro: cada passo vai de um estado {fx, fy, g, s} a outro, em ms, com uma legenda
export function buildScript(target) {
  const T = { fx: target.fx, fy: target.fy };
  return [
    { caption: "1/6 ☝️ Indicador: o cursor segue a ponta do dedo", ms: 2600, from: { fx: 0.25, fy: 0.65, g: "aponta" }, to: { fx: 0.7, fy: 0.35, g: "aponta" } },
    { caption: "1/6 ☝️ Indicador: o cursor segue a ponta do dedo", ms: 1600, from: { fx: 0.7, fy: 0.35, g: "aponta" }, to: { ...T, g: "aponta" } },
    { caption: "2/6 Pare sobre a estante: o local aparece junto ao cursor", ms: 1800, from: { ...T, g: "aponta" }, to: { ...T, g: "aponta" } },
    { caption: "3/6 🤏 Pinça rápida = clique: o local é apresentado", ms: 350, from: { ...T, g: "pinca" }, to: { ...T, g: "pinca" } },
    { caption: "3/6 🤏 Pinça rápida = clique: o local é apresentado", ms: 3200, from: { ...T, g: "aponta" }, to: { ...T, g: "aponta" } },
    { caption: "4/6 ✋ Palma aberta: segure um instante e mova para andar", ms: 900, from: { fx: 0.45, fy: 0.5, g: "aberta" }, to: { fx: 0.45, fy: 0.5, g: "aberta" } },
    { caption: "4/6 ✋ Palma aberta: segure um instante e mova para andar", ms: 2600, from: { fx: 0.45, fy: 0.5, g: "aberta" }, to: { fx: 0.6, fy: 0.45, g: "aberta" } },
    { caption: "5/6 ✋ Aproxime a palma da câmera para dar zoom", ms: 2200, from: { fx: 0.6, fy: 0.45, g: "aberta", s: 0.06 }, to: { fx: 0.6, fy: 0.45, g: "aberta", s: 0.085 } },
    { caption: "5/6 ✋ Afaste a palma para sair do zoom", ms: 1600, from: { fx: 0.6, fy: 0.45, g: "aberta", s: 0.085 }, to: { fx: 0.6, fy: 0.45, g: "aberta", s: 0.07 } },
    { caption: "6/6 🤏 Pinça e arraste para girar a vista", ms: 500, from: { fx: 0.4, fy: 0.5, g: "pinca" }, to: { fx: 0.4, fy: 0.5, g: "pinca" } },
    { caption: "6/6 🤏 Pinça e arraste para girar a vista", ms: 2200, from: { fx: 0.4, fy: 0.5, g: "pinca" }, to: { fx: 0.6, fy: 0.5, g: "pinca" } },
    { caption: "✊ Mão fechada: pausa (nada se mexe)", ms: 1600, from: { fx: 0.6, fy: 0.5, g: "punho" }, to: { fx: 0.5, fy: 0.55, g: "punho" } },
  ];
}

// Executa o roteiro: a cada quadro chama onFrame(landmarks, legenda); termina chamando onEnd
export function runScript(script, onFrame, onEnd) {
  let i = 0, t0 = performance.now(), stopped = false;
  const lerp = (a, b, k) => a + (b - a) * k;
  function frame(now) {
    if (stopped) return;
    let step = script[i];
    while (step && now - t0 >= step.ms) { t0 += step.ms; i++; step = script[i]; }
    if (!step) { onEnd(); return; }
    const k = Math.min(1, (now - t0) / step.ms), a = step.from, b = step.to;
    const lm = synthHand(lerp(a.fx, b.fx, k), lerp(a.fy, b.fy, k), b.g, lerp(a.s || 0.06, b.s || 0.06, k));
    onFrame([lm], step.caption, now);
    setTimeout(() => requestAnimationFrame(frame), 33); // ~30 quadros/s, como uma webcam
  }
  requestAnimationFrame(frame);
  return () => { stopped = true; };
}
