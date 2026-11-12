// Vitrine por Gestos: MediaPipe Hand Landmarker (no navegador) + prateleiras com zoom
const { PointFilter, mapToScreen, PinchDetector, DwellSelector, TargetHistory, AttentionTracker } = window.HandLogic;

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
const view = { scale: 1, tx: 0, ty: 0, min: 0.4, max: 3 };
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
function zoomAt(factor, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) {
  const fit = fitScale();
  const next = Math.min(Math.max(view.scale * factor, fit * 0.9, view.min), Math.max(view.max, fit * 3));
  const k = next / view.scale;
  view.tx = cx - (cx - view.tx) * k;
  view.ty = cy - (cy - view.ty) * k;
  view.scale = next;
  applyView();
}
function fit() { view.scale = fitScale(); view.tx = 0; view.ty = 0; applyView(); }
function pan(dx, dy, animate = false) { view.tx += dx; view.ty += dy; applyView(animate); }

$("#zoom-in").addEventListener("click", () => zoomAt(1.25));
$("#zoom-out").addEventListener("click", () => zoomAt(1 / 1.25));
$("#zoom-fit").addEventListener("click", fit);
viewport.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = viewport.getBoundingClientRect();
  zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
document.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, textarea, .consent-overlay")) return;
  const step = 60;
  const map = { "+": () => zoomAt(1.25), "=": () => zoomAt(1.25), "-": () => zoomAt(1 / 1.25), "0": fit,
    ArrowLeft: () => pan(step, 0, true), ArrowRight: () => pan(-step, 0, true), ArrowUp: () => pan(0, step, true), ArrowDown: () => pan(0, -step, true) };
  if (map[e.key]) { e.preventDefault(); map[e.key](); }
});
// Arrastar com o mouse (ou dedo na tela)
let drag = null;
viewport.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; });
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; viewport.classList.add("dragging"); }
  if (drag.moved) { pan(dx, dy); drag.x = e.clientX; drag.y = e.clientY; }
});
window.addEventListener("pointerup", () => { setTimeout(() => (drag = null), 0); viewport.classList.remove("dragging"); });
window.addEventListener("resize", () => applyView(false));

// ---------- Seleção e legenda ----------
const picked = new Map(); // id -> { count, first }
const dwell = new DwellSelector({ dwellMs: 1200 });
const history = new TargetHistory();
const attention = new AttentionTracker();
let hoverId = null, audio = null;

function tick() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 1046; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.12, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    o.start(); o.stop(audio.currentTime + 0.12);
  } catch { /* sem áudio */ }
}

function select(id, how) {
  if (!id) return;
  const p = picked.get(id) || { count: 0, first: Date.now(), how };
  p.count++; p.how = how;
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
setInterval(() => { if (picked.size) renderLegend(); }, 500); // atualiza o tempo de atenção
$("#clear").addEventListener("click", () => {
  picked.clear(); attention.reset(); dwell.reset();
  store.querySelectorAll(".product.picked").forEach((el) => { el.classList.remove("picked"); delete el.dataset.count; });
  renderLegend();
});

// Produto sob o cursor. Com a mão, o cursor cai fácil nos vãos entre produtos:
// o "ímã" considera o produto mais próximo a até MAGNET_PX da borda dele.
const MAGNET_PX = 40;
function productAt(x, y, magnet = 0) {
  const el = document.elementFromPoint(x, y);
  const card = el && el.closest && el.closest("#viewport .product");
  if (card) return card.dataset.product;
  if (!magnet || !el || !el.closest || !el.closest("#viewport")) return null;
  let best = null, bestD = magnet;
  for (const c of store.querySelectorAll(".product")) {
    const r = c.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = c.dataset.product; }
  }
  return best;
}

// Mesmo caminho para mão e mouse: posição na tela -> produto -> permanência / pinça
function updatePointer(x, y, t, { source, pinch } = {}) {
  cursor.hidden = false;
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  cursor.classList.toggle("hand", source === "hand");
  cursor.classList.toggle("pinched", !!(pinch && pinch.pinched));
  const id = productAt(x, y, source === "hand" ? MAGNET_PX : 0);
  history.push(id, t);
  attention.update(id, t);
  if (id !== hoverId) {
    if (hoverId) store.querySelector(`[data-product="${hoverId}"]`)?.classList.remove("hover");
    if (id) store.querySelector(`[data-product="${id}"]`)?.classList.add("hover");
    hoverId = id;
    $("#pointing").textContent = id ? `${PRODUCTS[id].emoji} ${PRODUCTS[id].name}` : "—";
  }
  const d = dwell.update(id, t);
  cursor.style.setProperty("--p", d.progress);
  if (d.selected) select(d.selected, "permanência");
  // Pinça: usa o produto de ~150 ms antes, porque o dedo se desloca ao fechar a pinça
  if (pinch && pinch.event === "down") {
    const target = history.at(t - 150) || id;
    if (target) { select(target, "pinça"); dwell.consumed(target); }
  }
  // Com zoom, encostar o cursor da mão na borda desloca a prateleira
  if (source === "hand") {
    const r = viewport.getBoundingClientRect(), edge = 0.08, speed = 14;
    const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    const dx = fx < edge ? speed : fx > 1 - edge ? -speed : 0;
    const dy = fy < edge ? speed : fy > 1 - edge ? -speed : 0;
    if (dx || dy) pan(dx, dy);
  }
}
function hidePointer(t) {
  cursor.hidden = true;
  attention.update(null, t);
  dwell.update(null, t);
  if (hoverId) store.querySelector(`[data-product="${hoverId}"]`)?.classList.remove("hover");
  hoverId = null;
  $("#pointing").textContent = "—";
}

// Mouse (sem câmera): mesma experiência para testar e demonstrar
viewport.addEventListener("mousemove", (e) => { if (!running) updatePointer(e.clientX, e.clientY, performance.now(), { source: "mouse" }); });
viewport.addEventListener("mouseleave", () => { if (!running) hidePointer(performance.now()); });
viewport.addEventListener("click", (e) => {
  if (drag && drag.moved) return; // foi arrasto, não clique
  const id = productAt(e.clientX, e.clientY);
  if (id) { select(id, "clique"); dwell.consumed(id); }
});

// ---------- Câmera e MediaPipe ----------
let landmarker = null, stream = null, running = false, lostAt = 0;
const pointFilter = new PointFilter();
const pinch = new PinchDetector();
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

async function loadFrom(src) {
  const { FilesetResolver, HandLandmarker } = await import(src.module);
  const fileset = await FilesetResolver.forVisionTasks(src.wasm);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: src.model, delegate },
    runningMode: "VIDEO", numHands: 1,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { return await HandLandmarker.createFromOptions(fileset, opts("GPU")); }
  catch { return await HandLandmarker.createFromOptions(fileset, opts("CPU")); }
}
async function loadModel() {
  if (landmarker || window.__handOverride) return;
  let lastError;
  for (const src of MP_SOURCES) {
    try { landmarker = await loadFrom(src); window.__mpSource = src.name; return; }
    catch (e) { lastError = e; console.warn(`MediaPipe (${src.name}) falhou`, e); }
  }
  throw lastError;
}

function drawHand(lm, pinched) {
  handCanvas.width = handCanvas.clientWidth; handCanvas.height = handCanvas.clientHeight;
  hctx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  if (!lm) return;
  const vw = video.videoWidth || 4, vh = video.videoHeight || 3, cw = handCanvas.width, ch = handCanvas.height;
  const s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  const P = (p) => [p.x * vw * s + ox, p.y * vh * s + oy];
  hctx.lineWidth = 2; hctx.strokeStyle = "rgba(124,92,255,.95)";
  for (const [a, b] of BONES) { const [x1, y1] = P(lm[a]), [x2, y2] = P(lm[b]); hctx.beginPath(); hctx.moveTo(x1, y1); hctx.lineTo(x2, y2); hctx.stroke(); }
  for (const i of [4, 8]) { const [x, y] = P(lm[i]); hctx.fillStyle = pinched ? "#3fb950" : "#fff"; hctx.beginPath(); hctx.arc(x, y, 4, 0, Math.PI * 2); hctx.fill(); }
}

let lastVideoTime = -1;
function loop() {
  if (!running) return;
  const now = performance.now();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    let lm = null;
    try {
      const res = window.__handOverride ? window.__handOverride(now) : landmarker.detectForVideo(video, now);
      lm = res?.landmarks?.[0] || null;
    } catch (e) { console.warn(e); }
    const pz = pinch.update(lm);
    drawHand(lm, pz.pinched);
    if (lm) {
      lostAt = 0;
      const m = mapToScreen(lm[8]);                 // ponta do indicador, área ativa, espelhado
      const f = pointFilter.filter(m, now);
      const r = viewport.getBoundingClientRect();
      updatePointer(r.left + f.x * r.width, r.top + f.y * r.height, now, { source: "hand", pinch: pz });
    } else {
      if (!lostAt) lostAt = now;
      if (now - lostAt > 300) { pointFilter.reset(); hidePointer(now); }
    }
  }
  requestAnimationFrame(loop);
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
  running = true;
  $("#start").hidden = true; $("#stop").hidden = false;
  setStatus("Mostre a mão para a câmera e aponte com o indicador.", "ok");
  requestAnimationFrame(loop);
}
function stop() {
  running = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; video.srcObject = null;
  $("#cam").hidden = true; $("#start").hidden = false; $("#stop").hidden = true;
  hidePointer(performance.now());
  setStatus("Sem câmera: use o mouse para testar.");
}
$("#start").addEventListener("click", start);
$("#stop").addEventListener("click", stop);

// Visão inicial: prateleira inteira na tela
requestAnimationFrame(() => fit());
window.__vitrine = { view, picked, zoomAt, fit };
