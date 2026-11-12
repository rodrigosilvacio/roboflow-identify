// Vitrine por Gestos v2: MediaPipe Hand Landmarker (no navegador, até 2 mãos) + prateleiras com zoom por gesto
const {
  PointFilter, mapToScreen, PinchDetector, DwellSelector, TargetHistory, AttentionTracker,
  classifyGesture, GestureStabilizer, TwoHandZoom, GrabPan,
} = window.HandLogic;

// Arquivos do MediaPipe servidos pelo próprio site (vendor/ na raiz), com CDN do Google como reserva
const base = new URL("../vendor/mediapipe/", import.meta.url).href;
const MP_SOURCES = window.MP_CONFIG ? [window.MP_CONFIG] : [
  { name: "local", module: `${base}vision_bundle.mjs`, wasm: `${base}wasm`, model: `${base}hand_landmarker.task` },
  {
    name: "cdn",
    module: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs",
    wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    model: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
];

// ---------- Produtos fictícios ----------
const SHELVES = [
  { title: "Hortifrúti", items: [["banana", "🍌", "Banana", 5.99], ["pera", "🍐", "Pera", 8.49], ["maca", "🍎", "Maçã", 7.9], ["uva", "🍇", "Uva", 12.9], ["abacaxi", "🍍", "Abacaxi", 9.5], ["morango", "🍓", "Morango", 11.9]] },
  { title: "Mercearia", items: [["pao", "🍞", "Pão", 6.5], ["cafe", "☕", "Café", 18.9], ["leite", "🥛", "Leite", 5.49], ["queijo", "🧀", "Queijo", 22.9], ["arroz", "🍚", "Arroz", 24.9], ["mel", "🍯", "Mel", 19.9]] },
  { title: "Bebidas e doces", items: [["suco", "🧃", "Suco", 7.99], ["agua", "💧", "Água", 2.99], ["chocolate", "🍫", "Chocolate", 8.9], ["biscoito", "🍪", "Biscoito", 4.79], ["sorvete", "🍦", "Sorvete", 21.9], ["pipoca", "🍿", "Pipoca", 6.9]] },
];
const PRODUCTS = {};
SHELVES.forEach((s) => s.items.forEach(([id, emoji, name, price]) => (PRODUCTS[id] = { id, emoji, name, price })));

const $ = (s) => document.querySelector(s);
const viewport = $("#viewport"), store = $("#store"), cursor = $("#cursor"), video = $("#video");
const handCanvas = $("#hand-canvas"), hctx = handCanvas.getContext("2d");
const zoomDots = [$("#zoom-dot-a"), $("#zoom-dot-b")];
const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

store.innerHTML = SHELVES.map((s) => `
  <section class="shelf">
    <h3 class="shelf-title">${s.title}</h3>
    <div class="shelf-items">
      ${s.items.map(([id, emoji, name, price]) => `
        <div class="product" data-product="${id}" role="button" tabindex="-1" aria-label="${name}">
          <span class="emoji" aria-hidden="true">${emoji}</span>
          <span class="name">${name}</span>
          <span class="price">${brl(price)}</span>
        </div>`).join("")}
    </div>
    <div class="board"></div>
  </section>`).join("");

const setStatus = (msg, kind = "") => { $("#status").textContent = msg; $("#status").dataset.kind = kind; };

// ---------- Zoom e deslocamento ----------
const view = { scale: 1, tx: 0, ty: 0 };
const fitScale = () => Math.min(viewport.clientWidth / store.offsetWidth, viewport.clientHeight / store.offsetHeight);
function clampPan() {
  const sw = store.offsetWidth * view.scale, sh = store.offsetHeight * view.scale;
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  view.tx = sw <= vw ? (vw - sw) / 2 : Math.min(0, Math.max(vw - sw, view.tx));
  view.ty = sh <= vh ? (vh - sh) / 2 : Math.min(0, Math.max(vh - sh, view.ty));
}
function applyView(animate = true) {
  clampPan();
  store.classList.toggle("no-anim", !animate);
  store.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
  $("#zoom-level").textContent = `${Math.round((view.scale / fitScale()) * 100)}%`;
}
// Zoom mantendo fixo o ponto (cx, cy) do viewport
function zoomAt(factor, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2, animate = true) {
  const fit = fitScale();
  const next = Math.min(Math.max(view.scale * factor, fit), fit * 4);
  const k = next / view.scale;
  view.tx = cx - (cx - view.tx) * k;
  view.ty = cy - (cy - view.ty) * k;
  view.scale = next;
  applyView(animate);
}
function fit() { view.scale = fitScale(); view.tx = 0; view.ty = 0; applyView(); }
function pan(dx, dy, animate = false) { view.tx += dx; view.ty += dy; applyView(animate); }
const zoomed = () => view.scale > fitScale() * 1.01;
const ACTIONS = { "zoom-in": () => zoomAt(1.3), "zoom-out": () => zoomAt(1 / 1.3), fit };

$("#zoom-in").addEventListener("click", ACTIONS["zoom-in"]);
$("#zoom-out").addEventListener("click", ACTIONS["zoom-out"]);
$("#zoom-fit").addEventListener("click", fit);
viewport.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = viewport.getBoundingClientRect();
  zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
document.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, select, textarea, .consent-overlay")) return;
  const step = 60;
  const map = { "+": ACTIONS["zoom-in"], "=": ACTIONS["zoom-in"], "-": ACTIONS["zoom-out"], "0": fit,
    ArrowLeft: () => pan(step, 0, true), ArrowRight: () => pan(-step, 0, true), ArrowUp: () => pan(0, step, true), ArrowDown: () => pan(0, -step, true) };
  if (map[e.key]) { e.preventDefault(); map[e.key](); }
});
// Arrastar com o mouse (ou dedo na tela)
let drag = null;
viewport.addEventListener("pointerdown", (e) => { if (!e.target.closest(".hand-btn")) drag = { x: e.clientX, y: e.clientY, moved: false }; });
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; viewport.classList.add("dragging"); }
  if (drag.moved) { pan(dx, dy); drag.x = e.clientX; drag.y = e.clientY; }
});
window.addEventListener("pointerup", () => { setTimeout(() => (drag = null), 0); viewport.classList.remove("dragging"); });
window.addEventListener("resize", () => applyView(false));
document.querySelectorAll(".hand-btn").forEach((b) => b.addEventListener("click", () => ACTIONS[b.dataset.action]()));

// ---------- Seleção e legenda ----------
const picked = new Map(); // id -> { count, first }
const dwell = new DwellSelector({ dwellMs: 1200 });
const history = new TargetHistory();
const attention = new AttentionTracker();
let hover = null, audio = null;
const actionHover = { id: null, since: 0, lastFire: 0 };

function tick(freq = 1046) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.12, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    o.start(); o.stop(audio.currentTime + 0.12);
  } catch { /* sem áudio */ }
}

function select(id) {
  if (!id) return;
  const p = picked.get(id) || { count: 0, first: Date.now() };
  p.count++;
  picked.set(id, p);
  const el = store.querySelector(`[data-product="${id}"]`);
  el.classList.add("picked"); el.dataset.count = `×${p.count}`;
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  tick();
  renderLegend();
}

const secs = (ms) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
function renderLegend() {
  const list = $("#legend");
  const items = [...picked.entries()].sort((a, b) => a[1].first - b[1].first);
  $("#legend-count").textContent = items.length ? `(${items.length} ${items.length === 1 ? "produto" : "produtos"})` : "";
  list.innerHTML = items.length ? items.map(([id, p]) => {
    const pr = PRODUCTS[id];
    return `<li><span class="e">${pr.emoji}</span><span class="n">${pr.name}<span class="meta">atenção ${secs(attention.get(id))}</span></span><span class="c">×${p.count}</span></li>`;
  }).join("") : `<li class="empty">Aponte para um produto para começar.</li>`;
}
setInterval(() => { if (picked.size) renderLegend(); }, 500);
$("#clear").addEventListener("click", () => {
  picked.clear(); attention.reset(); dwell.reset();
  store.querySelectorAll(".product.picked").forEach((el) => { el.classList.remove("picked"); delete el.dataset.count; });
  renderLegend();
});

// O que está sob o cursor: botão de zoom da prateleira ou produto (com "ímã" para a mão)
const MAGNET_PX = 40;
function targetAt(x, y, magnet = 0) {
  const el = document.elementFromPoint(x, y);
  if (!el || !el.closest) return null;
  const btn = el.closest("#viewport .hand-btn");
  if (btn) return { kind: "action", id: btn.dataset.action, el: btn };
  const card = el.closest("#viewport .product");
  if (card) return { kind: "product", id: card.dataset.product, el: card };
  if (!magnet || !el.closest("#viewport")) return null;
  let best = null, bestD = magnet;
  for (const c of store.querySelectorAll(".product")) {
    const r = c.getBoundingClientRect();
    const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (d < bestD) { bestD = d; best = c; }
  }
  return best ? { kind: "product", id: best.dataset.product, el: best } : null;
}

function setHover(target) {
  const key = target ? `${target.kind}:${target.id}` : null;
  if (key === (hover && hover.key)) return;
  if (hover) hover.el.classList.remove("hover");
  hover = target ? { ...target, key } : null;
  if (hover) hover.el.classList.add("hover");
  $("#pointing").textContent = !target ? "—"
    : target.kind === "product" ? `${PRODUCTS[target.id].emoji} ${PRODUCTS[target.id].name}`
    : { "zoom-in": "🔍 Aproximar", "zoom-out": "🔍 Afastar", fit: "⤢ Ver tudo" }[target.id];
}

function showCursor(x, y, mode) {
  cursor.hidden = false;
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  cursor.dataset.mode = mode; // aponta | pinca | punho | mouse
}

// Cursor normal (apontar, pinça ou mouse): permanência, pinça e botões de zoom
function pointAt(x, y, t, { source, pinchDown = false, mode = "aponta" } = {}) {
  showCursor(x, y, mode);
  const target = targetAt(x, y, source === "hand" ? MAGNET_PX : 0);
  setHover(target);
  const productId = target && target.kind === "product" ? target.id : null;
  history.push(productId, t);
  attention.update(productId, t);
  const d = dwell.update(productId, t);
  let progress = d.progress;
  if (d.selected) select(d.selected);

  // Botões de zoom dentro da prateleira: parar 0,6 s aciona e repete enquanto o cursor estiver em cima
  if (target && target.kind === "action") {
    if (actionHover.id !== target.id) Object.assign(actionHover, { id: target.id, since: t, lastFire: 0 });
    const held = t - actionHover.since;
    progress = Math.min(1, held / 600);
    if (held >= 600 && t - actionHover.lastFire >= 500) { actionHover.lastFire = t; ACTIONS[target.id](); tick(784); }
  } else actionHover.id = null;
  cursor.style.setProperty("--p", progress);

  if (pinchDown) {
    if (target && target.kind === "action") { ACTIONS[target.id](); tick(784); }
    else {
      const id = history.at(t - 150) || productId; // o dedo se desloca ao fechar a pinça
      if (id) { select(id); dwell.consumed(id); }
    }
  }
  // Com zoom, apontar para a borda da prateleira desloca a vista
  if (source === "hand" && zoomed()) {
    const r = viewport.getBoundingClientRect(), edge = 0.06, speed = 10;
    const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    const dx = fx < edge ? speed : fx > 1 - edge ? -speed : 0;
    const dy = fy < edge ? speed : fy > 1 - edge ? -speed : 0;
    if (dx || dy) pan(dx, dy);
  }
}
function idlePointer(t) {
  attention.update(null, t);
  dwell.update(null, t);
  actionHover.id = null;
  cursor.style.setProperty("--p", 0);
  setHover(null);
}
function hidePointer(t) { cursor.hidden = true; idlePointer(t); }

// Mouse (sem câmera): mesma experiência para testar e demonstrar
viewport.addEventListener("mousemove", (e) => { if (!running) pointAt(e.clientX, e.clientY, performance.now(), { source: "mouse", mode: "mouse" }); });
viewport.addEventListener("mouseleave", () => { if (!running) hidePointer(performance.now()); });
viewport.addEventListener("click", (e) => {
  if ((drag && drag.moved) || e.target.closest(".hand-btn")) return;
  const t = targetAt(e.clientX, e.clientY);
  if (t && t.kind === "product") { select(t.id); dwell.consumed(t.id); }
});

// ---------- Câmera e MediaPipe ----------
let landmarker = null, stream = null, running = false, lostAt = 0, delegateUsed = "-", gpuErrors = 0, runningSince = 0, autoChecked = false;
const perHand = {}; // por mão (Left/Right): filtro do cursor, pinça e estabilizador de gesto
const handState = (key) => (perHand[key] ||= { filter: new PointFilter(), pinch: new PinchDetector(), gesture: new GestureStabilizer(), pinchPt: new PointFilter() });
const twoZoom = new TwoHandZoom(), grab = new GrabPan();
const stats = { frames: 0, withHand: 0, fps: 0, t0: performance.now(), recent: [] };
window.__stats = stats;
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const GESTURE_LABEL = { aponta: "☝️ Apontando", pinca: "🤏 Pinça", punho: "✊ Arrastando", aberta: "✋ Mão aberta", zoom: "🙌 Zoom com as duas mãos" };
const GESTURE_COLOR = { aponta: "#7c5cff", pinca: "#3fb950", punho: "#d29922", aberta: "#58a6ff", zoom: "#f778ba" };

function preferredDelegate() {
  const q = new URLSearchParams(location.search).get("processador");
  const sel = $("#delegate").value;
  return (q || sel || "auto").toLowerCase();
}
async function loadFrom(src, pref) {
  const { FilesetResolver, HandLandmarker } = await import(src.module);
  const fileset = await FilesetResolver.forVisionTasks(src.wasm);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: src.model, delegate },
    runningMode: "VIDEO", numHands: 2,
    minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.4,
  });
  const order = pref === "cpu" ? ["CPU"] : pref === "gpu" ? ["GPU", "CPU"] : ["GPU", "CPU"];
  let lastError;
  for (const d of order) {
    try { const lmk = await HandLandmarker.createFromOptions(fileset, opts(d)); delegateUsed = d; return lmk; }
    catch (e) { lastError = e; }
  }
  throw lastError;
}
async function loadModel(pref = preferredDelegate()) {
  if (window.__handOverride) { delegateUsed = "simulado"; return; }
  let lastError;
  for (const src of MP_SOURCES) {
    try { landmarker = await loadFrom(src, pref); window.__mpSource = src.name; return; }
    catch (e) { lastError = e; console.warn(`MediaPipe (${src.name}) falhou`, e); }
  }
  throw lastError;
}
// Se a GPU der erro durante o uso, troca sozinha para CPU
async function fallbackToCPU(reason) {
  if (delegateUsed === "CPU") return;
  console.warn("Trocando para CPU:", reason);
  const old = landmarker; landmarker = null;
  try { old && old.close(); } catch { /* ignora */ }
  setStatus(`${reason}: trocando para a CPU...`, "");
  await loadModel("cpu");
  setStatus("Mostre a mão para a câmera e aponte com o indicador.", "ok");
}

function videoToCanvas() {
  const vw = video.videoWidth || 4, vh = video.videoHeight || 3, cw = handCanvas.width, ch = handCanvas.height;
  const s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  return (p) => [p.x * vw * s + ox, p.y * vh * s + oy];
}
function drawHands(hands) {
  handCanvas.width = handCanvas.clientWidth; handCanvas.height = handCanvas.clientHeight;
  hctx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  const P = videoToCanvas();
  for (const h of hands) {
    hctx.lineWidth = 3; hctx.strokeStyle = GESTURE_COLOR[h.gesture] || "#7c5cff";
    for (const [a, b] of BONES) { const [x1, y1] = P(h.lm[a]), [x2, y2] = P(h.lm[b]); hctx.beginPath(); hctx.moveTo(x1, y1); hctx.lineTo(x2, y2); hctx.stroke(); }
    hctx.fillStyle = "#fff";
    for (const i of [4, 8]) { const [x, y] = P(h.lm[i]); hctx.beginPath(); hctx.arc(x, y, 4, 0, Math.PI * 2); hctx.fill(); }
  }
}

function toScreen(p) {
  const m = mapToScreen(p);
  const r = viewport.getBoundingClientRect();
  return { x: r.left + m.x * r.width, y: r.top + m.y * r.height };
}
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function updateDiag(now, n) {
  stats.frames++; if (n) stats.withHand++;
  stats.recent.push({ t: now, n });
  while (stats.recent.length && now - stats.recent[0].t > 2000) stats.recent.shift();
  if (now - stats.t0 >= 1000) {
    // quadros/s = intervalos entre quadros na janela de 2 s (com um quadro só, ainda não dá para medir)
    const span = now - stats.recent[0].t;
    stats.fps = stats.recent.length > 1 && span > 0 ? Math.round(((stats.recent.length - 1) * 1000) / span) : 0;
    stats.t0 = now;
    const pct = stats.recent.length ? Math.round((stats.recent.filter((r) => r.n).length / stats.recent.length) * 100) : 0;
    $("#diag").textContent = `Modelo: ${window.__mpSource || "simulado"} · Processador: ${delegateUsed} · ${stats.fps} quadros/s · mão vista em ${pct}% dos quadros`;
  }
}

let lastVideoTime = -1;
function loop() {
  if (!running) return;
  const now = performance.now();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime && (landmarker || window.__handOverride)) {
    lastVideoTime = video.currentTime;
    let res = null;
    try {
      res = window.__handOverride ? window.__handOverride(now) : landmarker.detectForVideo(video, now);
      gpuErrors = 0;
    } catch (e) {
      console.warn(e);
      if (delegateUsed === "GPU" && ++gpuErrors >= 3) { running = false; fallbackToCPU(e.message).then(() => { running = true; requestAnimationFrame(loop); }); return; }
    }
    const lms = res?.landmarks || [];
    const hands = lms.map((lm, i) => {
      const key = res.handedness?.[i]?.[0]?.categoryName || `mao${i}`;
      const st = handState(key);
      const pz = st.pinch.update(lm);
      const gesture = st.gesture.update(classifyGesture(lm, pz.pinched), now);
      return { key, lm, st, pz, gesture };
    });
    updateDiag(now, hands.length);
    // Modo automático: se a GPU estiver lenta (algumas placas travam ao devolver o resultado), troca para a CPU
    // (só decide com pelo menos 1,5 s de quadros reais: a primeira análise na GPU costuma demorar para "aquecer")
    const measured = stats.recent.length > 1 && now - stats.recent[0].t >= 1500;
    if (!autoChecked && delegateUsed === "GPU" && preferredDelegate() === "auto" && measured && now - runningSince > 2500) {
      autoChecked = true;
      const fpsNow = Math.round(((stats.recent.length - 1) * 1000) / (now - stats.recent[0].t));
      if (fpsNow < 10) { running = false; fallbackToCPU(`GPU lenta (${fpsNow} quadros/s)`).then(() => { running = true; requestAnimationFrame(loop); }); return; }
    }
    handleHands(hands, now);
    drawHands(hands);
  }
  requestAnimationFrame(loop);
}

function handleHands(hands, now) {
  const hideZoomDots = () => zoomDots.forEach((d) => (d.hidden = true));
  if (!hands.length) {
    $("#gesture").textContent = "Procurando a mão...";
    hideZoomDots(); twoZoom.reset(); grab.reset();
    if (!lostAt) lostAt = now;
    if (now - lostAt > 300) { Object.values(perHand).forEach((s) => s.filter.reset()); hidePointer(now); }
    return;
  }
  lostAt = 0;

  // 🙌 Duas mãos em pinça: zoom (afastar = aproximar a prateleira) e mover juntas = deslocar
  if (hands.length === 2 && hands.every((h) => h.gesture === "pinca")) {
    const pts = hands.map((h) => { const s = toScreen(mid(h.lm[4], h.lm[8])); return h.st.pinchPt.filter(s, now); });
    const z = twoZoom.update(pts[0], pts[1]);
    const r = viewport.getBoundingClientRect();
    if (z.factor && Math.abs(z.factor - 1) > 0.002) zoomAt(z.factor, z.center.x - r.left, z.center.y - r.top, false);
    if (z.pan) pan(z.pan.x, z.pan.y);
    pts.forEach((p, i) => { zoomDots[i].hidden = false; zoomDots[i].style.transform = `translate(${p.x}px, ${p.y}px)`; });
    $("#gesture").textContent = GESTURE_LABEL.zoom;
    cursor.hidden = true; idlePointer(now); grab.reset();
    return;
  }
  twoZoom.reset(); hideZoomDots();
  hands.forEach((h) => { if (h.gesture !== "pinca") h.st.pinchPt.reset(); });

  // Mão principal: a que está apontando ou em pinça; se não houver, a primeira
  const main = hands.find((h) => h.gesture === "aponta" || h.gesture === "pinca") || hands[0];
  $("#gesture").textContent = GESTURE_LABEL[main.gesture] || "✋ Mão detectada";

  // ✊ Mão fechada: agarra e arrasta a prateleira
  if (main.gesture === "punho") {
    const p = toScreen(main.lm[9]);
    const d = grab.update(p);
    if (zoomed()) pan(d.x * 1.5, d.y * 1.5); // a prateleira acompanha a mão, como arrastar um mapa
    showCursor(p.x, p.y, "punho");
    idlePointer(now);
    return;
  }
  grab.reset();

  // ☝️ Apontar ou 🤏 pinça: cursor na ponta do indicador
  const s = main.st.filter.filter(toScreen(main.lm[8]), now);
  // Com duas mãos visíveis, a pinça de uma só não seleciona (evita selecionar ao começar o zoom)
  const pinchDown = main.pz.event === "down" && hands.length === 1;
  pointAt(s.x, s.y, now, { source: "hand", pinchDown, mode: main.gesture === "pinca" ? "pinca" : "aponta" });
}

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) return setStatus("Este navegador não permite acesso à câmera.", "error");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  } catch (e) {
    return setStatus(e.name === "NotAllowedError" ? "Permissão da câmera negada. Use o mouse para testar." : `Câmera indisponível: ${e.message}`, "error");
  }
  video.srcObject = stream;
  await video.play();
  $("#cam").hidden = false;
  setStatus("Carregando o modelo de mãos...");
  try { await loadModel(); }
  catch (e) { stop(); return setStatus(`Não foi possível carregar o modelo de mãos: ${e.message}`, "error"); }
  running = true; runningSince = performance.now(); autoChecked = false;
  $("#start").hidden = true; $("#stop").hidden = false;
  setStatus("Mostre a mão para a câmera e aponte com o indicador.", "ok");
  requestAnimationFrame(loop);
}
function stop() {
  running = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; video.srcObject = null;
  $("#cam").hidden = true; $("#start").hidden = false; $("#stop").hidden = true;
  zoomDots.forEach((d) => (d.hidden = true));
  hidePointer(performance.now());
  setStatus("Sem câmera: use o mouse para testar.");
}
$("#start").addEventListener("click", start);
$("#stop").addEventListener("click", stop);
$("#delegate").addEventListener("change", async () => {
  if (!running && !landmarker) return;
  running = false;
  try { landmarker && landmarker.close(); } catch { /* ignora */ }
  landmarker = null;
  setStatus("Recarregando o modelo...");
  try { await loadModel(); setStatus("Mostre a mão para a câmera e aponte com o indicador.", "ok"); running = true; requestAnimationFrame(loop); }
  catch (e) { setStatus(`Falha ao recarregar: ${e.message}`, "error"); }
});

// Visão inicial: prateleira inteira na tela
requestAnimationFrame(() => fit());
window.__vitrine = { view, picked, zoomAt, fit, stats };
