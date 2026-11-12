// Armazém 3D por Gestos: three.js (cena) + MediaPipe Hand Landmarker (mãos, no navegador)
import * as THREE from "three";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { buildWarehouse } from "./scene.js";
import { buildScript, runScript } from "./sim.js";

const {
  PointFilter, mapToScreen, handSize, PinchDetector, GestureStabilizer, classifyGesture,
  TwoHandZoom, PalmNavigator, PinchDrag,
} = window.HandLogic;

const $ = (s) => document.querySelector(s);
const stage = $("#stage"), canvas = $("#scene"), cursor = $("#cursor"), video = $("#video");
const handCanvas = $("#hand-canvas"), hctx = handCanvas.getContext("2d");
const zoomDots = [$("#zoom-dot-a"), $("#zoom-dot-b")];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Sensibilidade (começa em Baixa: movimentos pequenos são ignorados) ----------
const PROFILES = {
  baixa: { pan: 0.7, zoomExp: 1.0, moveDz: 0.006, zoomDz: 0.02, palmHoldMs: 400, maxPan: 0.02, maxZoom: 0.04, cursor: { minCutoff: 0.6, beta: 2 }, orbit: 0.0035 },
  media: { pan: 1.0, zoomExp: 1.4, moveDz: 0.004, zoomDz: 0.012, palmHoldMs: 280, maxPan: 0.03, maxZoom: 0.06, cursor: { minCutoff: 0.8, beta: 3 }, orbit: 0.0045 },
  alta: { pan: 1.5, zoomExp: 2.0, moveDz: 0.002, zoomDz: 0.006, palmHoldMs: 160, maxPan: 0.05, maxZoom: 0.1, cursor: { minCutoff: 1.0, beta: 4 }, orbit: 0.006 },
};
let prof = PROFILES[$("#sens").value] || PROFILES.baixa;

// ---------- Cena 3D ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9edf2);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 600);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a97a6, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(30, 60, 25); scene.add(sun);
const ws = buildWarehouse(scene);
let needsRender = true;
const invalidate = () => { needsRender = true; };

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.minDistance = 8; controls.maxDistance = 170;
controls.maxPolarAngle = 1.42; controls.screenSpacePanning = false;
const HOME = { pos: new THREE.Vector3(0, 62, 72), target: new THREE.Vector3(0, 0, 6) };
function resetView() { flyTo(HOME.target, HOME.pos.clone().sub(HOME.target)); }

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  invalidate();
}
new ResizeObserver(resize).observe(stage);
camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.update();
resize();

// ---------- Navegação ----------
const sph = new THREE.Spherical(), off = new THREE.Vector3();
const bounds = { x: ws.size.width / 2 + 8, zMin: -ws.size.length / 2 - 4, zMax: ws.size.length / 2 + 22 };
let flying = null;
function clampTarget() {
  const t = controls.target, before = t.clone();
  t.x = clamp(t.x, -bounds.x, bounds.x); t.z = clamp(t.z, bounds.zMin, bounds.zMax); t.y = 0;
  camera.position.add(t.clone().sub(before));
}
function orbit(dAz, dPol) {
  off.copy(camera.position).sub(controls.target);
  sph.setFromVector3(off);
  sph.theta -= dAz;
  sph.phi = clamp(sph.phi - dPol, 0.15, controls.maxPolarAngle);
  off.setFromSpherical(sph);
  camera.position.copy(controls.target).add(off);
  controls.update();
}
function dolly(factor) { // > 1 aproxima
  off.copy(camera.position).sub(controls.target);
  off.setLength(clamp(off.length() / factor, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(off);
  controls.update();
}
// Move a vista: a cena acompanha a mão (como arrastar um mapa). fx, fy em fração da tela.
function panFrac(fx, fy) {
  const dist = camera.position.distanceTo(controls.target);
  const hWorld = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), wWorld = hWorld * camera.aspect;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0); right.y = 0; right.normalize();
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const move = right.multiplyScalar(-fx * wWorld).add(fwd.multiplyScalar(fy * hWorld * 1.4));
  camera.position.add(move); controls.target.add(move);
  clampTarget();
  controls.update();
}
// Voo suave até um ponto (usado para apresentar o local clicado)
function flyTo(target, offset, ms = 900) {
  const fromT = controls.target.clone(), fromP = camera.position.clone();
  const toT = target.clone(), toP = target.clone().add(offset);
  if (reduceMotion) ms = 1;
  const t0 = performance.now();
  flying = { done: false };
  const me = flying;
  (function step(now) {
    if (me !== flying) return; // outro voo começou
    const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    controls.target.lerpVectors(fromT, toT, e);
    camera.position.lerpVectors(fromP, toP, e);
    controls.update(); invalidate();
    if (k < 1) requestAnimationFrame(step); else { me.done = true; flying = null; }
  })(t0);
}
$("#zoom-in").addEventListener("click", () => dolly(1.35));
$("#zoom-out").addEventListener("click", () => dolly(1 / 1.35));
$("#reset").addEventListener("click", resetView);

// ---------- Onde está o cursor (estante, nível, rua, área) ----------
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
function locateAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(ws.hits, false)[0];
  if (hit) return ws.locate(hit.point, hit.instanceId, hit.face && hit.face.normal);
  const g = raycaster.intersectObject(ws.floor, false)[0];
  return g ? ws.locate(g.point) : null;
}

// Etiqueta junto ao cursor e destaque da estante sob ele
const tip = $("#tip");
let hoverKey = null;
let hoverPausedUntil = 0; // logo após um clique, a etiqueta some para não confundir com o local apresentado
function showHover(loc, x, y) {
  if (performance.now() < hoverPausedUntil) loc = null;
  const key = loc ? loc.code : null;
  if (key !== hoverKey) {
    hoverKey = key;
    ws.setHover(loc && loc.kind === "modulo" ? loc.bayIndex : null);
    invalidate();
    tip.textContent = loc ? (loc.short || loc.title) : "";
  }
  tip.hidden = !loc;
  if (loc) {
    const r = stage.getBoundingClientRect();
    tip.style.transform = `translate(${clamp(x - r.left + 24, 4, r.width - 220)}px, ${clamp(y - r.top - 14, 4, r.height - 30)}px)`;
  }
}
function hideHover() { showHover(null); }

// ---------- Apresentar o local clicado ----------
const visited = new Map(); // código -> { loc, count, first }
let audio = null;
function tick(freq = 988) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.12, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    o.start(); o.stop(audio.currentTime + 0.12);
  } catch { /* sem áudio */ }
}
function ripple(x, y) {
  const el = $("#ripple"), r = stage.getBoundingClientRect();
  el.style.left = `${x - r.left}px`; el.style.top = `${y - r.top}px`;
  el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
}
function present(loc, x, y) {
  if (!loc) return;
  if (x != null) ripple(x, y);
  tick();
  ws.setSelected(loc.kind === "modulo" ? loc.bayIndex : null);
  ws.setLevel(loc);
  ws.setPin(loc.pinAt, loc.code);
  invalidate();
  // cartão do local
  $("#loc-title").textContent = loc.title;
  $("#loc-code").textContent = loc.code;
  $("#loc-lines").innerHTML = loc.lines.map((l) => `<li>${l}</li>`).join("");
  $("#loc-card").hidden = false;
  $("#mode").textContent = `📍 ${loc.title}`;
  // voa até o local, de cima e de longe o bastante para ver o entorno e o alfinete
  hoverPausedUntil = performance.now() + 2000; showHover(null);
  const dir = camera.position.clone().sub(controls.target).setY(0).normalize();
  const flat = Math.abs(dir.x) + Math.abs(dir.z) < 0.01 ? new THREE.Vector3(0, 0, 1) : dir;
  const offset = flat.multiplyScalar(30).add(new THREE.Vector3(0, 30, 0));
  flyTo(new THREE.Vector3(loc.pos.x, 2, loc.pos.z), offset);
  // histórico
  const v = visited.get(loc.code) || { loc, count: 0, first: Date.now() };
  v.count++; visited.set(loc.code, v);
  const items = [...visited.values()].sort((a, b) => b.first - a.first);
  $("#sel-count").textContent = `(${items.length})`;
  $("#sel-list").innerHTML = items.map((i) => `<li><span>${i.loc.code}</span><span>${i.loc.short || i.loc.title}</span></li>`).join("");
  window.__arm.last = loc;
}
$("#loc-close").addEventListener("click", () => { $("#loc-card").hidden = true; ws.setPin(null); ws.setSelected(null); ws.setLevel(null); invalidate(); });
$("#loc-home").addEventListener("click", resetView);

// ---------- Mouse ----------
let down = null;
canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; $("#hint").hidden = true; });
canvas.addEventListener("pointerup", (e) => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && performance.now() - down.t < 500) present(locateAt(e.clientX, e.clientY), e.clientX, e.clientY);
  down = null;
});
canvas.addEventListener("pointermove", (e) => { if (!handActive) showHover(locateAt(e.clientX, e.clientY), e.clientX, e.clientY); });
canvas.addEventListener("pointerleave", () => { if (!handActive) hideHover(); });

// Laço de desenho: só redesenha quando algo muda (deixa o processador livre para reconhecer as mãos)
controls.addEventListener("change", invalidate);
(function render() {
  controls.update();
  if (needsRender) { needsRender = false; renderer.render(scene, camera); }
  requestAnimationFrame(render);
})();

// ---------- Mãos (câmera real ou simulação) ----------
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
const setStatus = (msg, kind = "") => { $("#status").textContent = msg; $("#status").dataset.kind = kind; };
const setMode = (text, kind = "") => { const m = $("#mode"); m.textContent = text; m.dataset.kind = kind; m.hidden = !text; };
let landmarker = null, stream = null, running = false, handActive = false, lostAt = 0, simStop = null, simCaption = "";
let delegateUsed = "-", gpuErrors = 0, runningSince = 0, autoChecked = false, startFrames = 0, firstFrameAt = 0;
let perHand = {};
const newHandState = () => ({
  filter: new PointFilter(prof.cursor), pinch: new PinchDetector(), gesture: new GestureStabilizer(),
  pinchPt: new PointFilter(), palm: new PalmNavigator({ smoothing: 0.6, moveDeadzone: prof.moveDz, zoomDeadzone: prof.zoomDz }),
  drag: new PinchDrag(), palmSince: null,
});
const handState = (k) => (perHand[k] ||= newHandState());
const twoZoom = new TwoHandZoom();
const stats = { frames: 0, withHand: 0, fps: 0, t0: performance.now(), recent: [] };
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const LABEL = { aponta: "☝️ Indicador", pinca: "🤏 Pinça", aberta: "✋ Palma", punho: "✊ Pausa", zoom: "🙌 Zoom" };

$("#sens").addEventListener("change", () => { prof = PROFILES[$("#sens").value]; perHand = {}; });

const preferredDelegate = () => (new URLSearchParams(location.search).get("processador") || $("#delegate").value || "auto").toLowerCase();
async function loadFrom(src, pref) {
  const { FilesetResolver, HandLandmarker } = await import(src.module);
  const fileset = await FilesetResolver.forVisionTasks(src.wasm);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: src.model, delegate }, runningMode: "VIDEO", numHands: 2,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  const order = pref === "cpu" ? ["CPU"] : ["GPU", "CPU"];
  let lastError;
  for (const d of order) {
    try { const l = await HandLandmarker.createFromOptions(fileset, opts(d)); delegateUsed = d; return l; }
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
async function switchToCPU(reason) {
  const old = landmarker; landmarker = null;
  try { old && old.close(); } catch { /* ignora */ }
  setStatus(`${reason}: trocando para a CPU...`);
  await loadModel("cpu");
  setStatus("Câmera ligada. Mostre a mão para começar.", "ok");
}

function drawHands(hands, withVideo = true) {
  handCanvas.width = handCanvas.clientWidth; handCanvas.height = handCanvas.clientHeight;
  hctx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  if (!withVideo) { hctx.fillStyle = "#0b0e13"; hctx.fillRect(0, 0, handCanvas.width, handCanvas.height); }
  const vw = withVideo ? video.videoWidth || 4 : 4, vh = withVideo ? video.videoHeight || 3 : 3, cw = handCanvas.width, ch = handCanvas.height;
  const s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  const P = (p) => [p.x * vw * s + ox, p.y * vh * s + oy];
  for (const h of hands) {
    hctx.lineWidth = 3; hctx.strokeStyle = "#2f9bff";
    for (const [a, b] of BONES) { const [x1, y1] = P(h.lm[a]), [x2, y2] = P(h.lm[b]); hctx.beginPath(); hctx.moveTo(x1, y1); hctx.lineTo(x2, y2); hctx.stroke(); }
    hctx.fillStyle = "#fff";
    for (const i of [4, 8]) { const [x, y] = P(h.lm[i]); hctx.beginPath(); hctx.arc(x, y, 4, 0, Math.PI * 2); hctx.fill(); }
  }
}
function updateDiag(now, n) {
  stats.frames++; if (n) stats.withHand++;
  stats.recent.push({ t: now, n });
  while (stats.recent.length && now - stats.recent[0].t > 2000) stats.recent.shift();
  if (now - stats.t0 >= 1000) {
    stats.t0 = now;
    const span = now - stats.recent[0].t;
    stats.fps = stats.recent.length > 1 && span > 0 ? Math.round(((stats.recent.length - 1) * 1000) / span) : 0;
    const pct = Math.round((stats.recent.filter((r) => r.n).length / stats.recent.length) * 100);
    $("#diag").textContent = `Modelo: ${simStop ? "simulação" : window.__mpSource || "simulado"} · Processador: ${simStop ? "-" : delegateUsed} · ${stats.fps} quadros/s · mão em ${pct}% dos quadros`;
  }
}

const toScreen = (p) => { const m = mapToScreen(p), r = canvas.getBoundingClientRect(); return { x: r.left + m.x * r.width, y: r.top + m.y * r.height }; };
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function showCursor(p, mode, progress = 0) {
  cursor.hidden = false; cursor.dataset.mode = mode;
  cursor.style.setProperty("--p", progress);
  cursor.style.transform = `translate(${p.x}px, ${p.y}px)`;
}
const label = (t) => (simCaption ? `${simCaption}` : t);

// Processa um quadro de mãos (vindo da câmera ou da simulação)
function processFrame(res, now) {
  const hands = (res?.landmarks || []).map((lm, i) => {
    const key = res.handedness?.[i]?.[0]?.categoryName || `mao${i}`, st = handState(key);
    const pz = st.pinch.update(lm);
    return { key, lm, st, pz, gesture: st.gesture.update(classifyGesture(lm, pz.pinched), now) };
  });
  updateDiag(now, hands.length);
  handleHands(hands, now);
  drawHands(hands, !simStop);
}

let lastVideoTime = -1;
function loop() {
  if (!running) return;
  const now = performance.now();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime && (landmarker || window.__handOverride)) {
    lastVideoTime = video.currentTime;
    let res = null;
    try { res = window.__handOverride ? window.__handOverride(now) : landmarker.detectForVideo(video, now); gpuErrors = 0; }
    catch (e) {
      console.warn(e);
      if (delegateUsed === "GPU" && ++gpuErrors >= 3) { running = false; switchToCPU("Erro na GPU").then(() => { running = true; requestAnimationFrame(loop); }); return; }
    }
    if (stats.frames - startFrames === 0) firstFrameAt = now;
    if (!autoChecked && delegateUsed === "GPU" && preferredDelegate() === "auto" && now - runningSince > 3000 && stats.frames - startFrames >= 3) {
      autoChecked = true;
      const fpsNow = Math.round(((stats.frames - startFrames - 1) * 1000) / (now - firstFrameAt));
      if (fpsNow < 10) { running = false; switchToCPU(`GPU lenta (${fpsNow} quadros/s)`).then(() => { running = true; requestAnimationFrame(loop); }); return; }
    }
    processFrame(res, now);
  }
  requestAnimationFrame(loop);
}

function resetNav(except) { Object.values(perHand).forEach((s) => { if (s !== except) { s.palm.reset(); s.drag.reset(); s.palmSince = null; } }); }

function handleHands(hands, now) {
  zoomDots.forEach((d) => (d.hidden = true));
  if (!hands.length) {
    $("#gesture").textContent = "Procurando a mão...";
    twoZoom.reset(); resetNav();
    if (!lostAt) lostAt = now;
    if (now - lostAt > 300) { cursor.hidden = true; hideHover(); handActive = false; setMode(label("Mostre a mão para a câmera"), "idle"); }
    return;
  }
  lostAt = 0; handActive = true;
  if (flying) { cursor.hidden = true; return; } // durante o voo até o local, os gestos esperam

  // 🙌 Duas mãos em pinça: zoom
  if (hands.length === 2 && hands.every((h) => h.gesture === "pinca")) {
    const pts = hands.map((h) => h.st.pinchPt.filter(toScreen(mid(h.lm[4], h.lm[8])), now));
    const z = twoZoom.update(pts[0], pts[1]);
    if (z.factor && Math.abs(z.factor - 1) > 0.004) dolly(clamp(Math.pow(z.factor, 1.4), 1 - prof.maxZoom * 2, 1 + prof.maxZoom * 2));
    pts.forEach((p, i) => { zoomDots[i].hidden = false; zoomDots[i].style.transform = `translate(${p.x}px, ${p.y}px)`; });
    $("#gesture").textContent = LABEL.zoom; setMode(label("🙌 Zoom: afaste as mãos para aproximar, junte para afastar"), "zoom");
    cursor.hidden = true; hideHover(); resetNav();
    return;
  }
  twoZoom.reset();

  const main = hands.find((h) => h.gesture === "pinca" || h.gesture === "aponta") || hands.find((h) => h.gesture === "aberta") || hands[0];
  const st = main.st;
  $("#gesture").textContent = LABEL[main.gesture] || "✋ Mão detectada";
  resetNav(st);

  // ✊ Pausa
  if (main.gesture === "punho") {
    st.palm.reset(); st.drag.reset(); st.palmSince = null;
    showCursor(toScreen(main.lm[9]), "pausa"); hideHover();
    setMode(label("✊ Pausado: abra a mão ou aponte para continuar"), "pause");
    return;
  }

  // ✋ Palma: precisa ficar aberta um instante antes de mover (evita mexer a vista sem querer)
  if (main.gesture === "aberta") {
    st.drag.reset();
    if (st.palmSince == null) { st.palmSince = now; st.palm.reset(); }
    const held = now - st.palmSince, ready = held >= prof.palmHoldMs;
    const p = toScreen(main.lm[9]);
    showCursor(p, ready ? "palma" : "palma-espera", Math.min(1, held / prof.palmHoldMs));
    hideHover();
    if (!ready) { setMode(label("✋ Segure a palma aberta para mover a vista..."), "palm"); return; }
    const r = st.palm.update(mapToScreen(main.lm[9]), handSize(main.lm));
    const dx = clamp(r.dx * prof.pan, -prof.maxPan, prof.maxPan), dy = clamp(r.dy * prof.pan, -prof.maxPan, prof.maxPan);
    if (dx || dy) panFrac(dx, dy);
    if (r.zoom !== 1) dolly(clamp(Math.pow(r.zoom, prof.zoomExp), 1 - prof.maxZoom, 1 + prof.maxZoom));
    setMode(label(r.zoom > 1 ? "✋ Aproximando (zoom)" : r.zoom < 1 ? "✋ Afastando" : "✋ Movendo a vista · aproxime a palma para dar zoom"), "palm");
    return;
  }
  st.palm.reset(); st.palmSince = null;

  // ☝️ Indicador = cursor; 🤏 pinça = clicar (rápida, sem mexer) ou arrastar (gira a vista)
  const p = st.filter.filter(toScreen(main.lm[8]), now);
  const d = st.drag.update(main.pz.pinched, p, now);
  if (d.phase === "drag") {
    orbit(d.dx * prof.orbit, d.dy * prof.orbit * 0.7);
    showCursor(p, "pinca"); hideHover();
    setMode(label("🤏 Girando a vista"), "drag");
    return;
  }
  const loc = locateAt(p.x, p.y);
  showHover(loc, p.x, p.y);
  showCursor(p, main.pz.pinched ? "pinca" : "aponta");
  if (main.pz.pinched) setMode(label("🤏 Pinça: solte rápido para clicar ou mova para girar"), "pinch");
  else setMode(label(loc ? `☝️ Apontando: ${tip.textContent}` : "☝️ Apontando"), "point");
  // Com duas mãos na imagem, a pinça de uma só não clica (evita clique ao começar o zoom)
  if (d.phase === "up" && d.click && hands.length === 1) present(locateAt(d.at.x, d.at.y), d.at.x, d.at.y);
}

async function start() {
  stopSim();
  if (!navigator.mediaDevices?.getUserMedia) return setStatus("Este navegador não permite acesso à câmera.", "error");
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); }
  catch (e) { return setStatus(e.name === "NotAllowedError" ? "Permissão da câmera negada. Use o mouse ou a simulação." : `Câmera indisponível: ${e.message}`, "error"); }
  video.srcObject = stream; await video.play();
  $("#start").disabled = true; $("#stop").disabled = false;
  setStatus("Carregando o reconhecimento de mãos...");
  try { await loadModel(); }
  catch (e) { stop(); return setStatus(`Não foi possível carregar o modelo de mãos: ${e.message}`, "error"); }
  perHand = {};
  running = true; runningSince = performance.now(); autoChecked = false; startFrames = stats.frames;
  $("#conn").textContent = "Conectado"; $("#conn").dataset.on = "true"; $("#hint").hidden = true;
  setStatus("Câmera ligada. Mostre a mão para começar.", "ok");
  setMode("Mostre a mão para a câmera", "idle");
  requestAnimationFrame(loop);
}
function stop() {
  running = false; handActive = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; video.srcObject = null;
  hctx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  cursor.hidden = true; zoomDots.forEach((d) => (d.hidden = true)); hideHover();
  $("#start").disabled = false; $("#stop").disabled = true;
  $("#conn").textContent = "Desligado"; $("#conn").dataset.on = "false";
  $("#gesture").textContent = "Câmera desligada";
  setMode("", "");
  setStatus("Câmera desligada. Use o mouse, ligue a câmera ou veja a simulação.");
}

// ---------- Simulação de gestos ----------
function screenFracOf(world) {
  const v = world.clone().project(camera);
  return { fx: clamp((v.x + 1) / 2, 0.05, 0.95), fy: clamp((1 - v.y) / 2, 0.05, 0.95) };
}
function stopSim() {
  if (!simStop) return;
  simStop(); simStop = null; simCaption = "";
  handActive = false; cursor.hidden = true; hideHover(); zoomDots.forEach((d) => (d.hidden = true));
  $("#sim").textContent = "▶ Simular gestos"; $("#sim").setAttribute("aria-pressed", "false");
  $("#gesture").textContent = "Câmera desligada";
  setMode("", "");
}
function startSim() {
  if (running) stop();
  camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.update(); invalidate();
  $("#loc-card").hidden = true; ws.setPin(null); ws.setSelected(null); ws.setLevel(null);
  perHand = {};
  // alvo do clique: estante 05, módulo 09 (o ponto é calculado na tela atual)
  const d = ws.bayData.find((b) => b.estante === 5 && b.modulo === 9);
  const target = screenFracOf(new THREE.Vector3(d.center.x, 6 * 1.7, d.center.z)); // topo do módulo, visto de cima
  $("#sim").textContent = "■ Parar simulação"; $("#sim").setAttribute("aria-pressed", "true");
  $("#hint").hidden = true;
  simStop = runScript(buildScript(target), (lms, caption, now) => {
    simCaption = `Simulação ${caption}`;
    processFrame({ landmarks: lms, handedness: [[{ categoryName: "Right" }]] }, now);
  }, () => {
    simStop = null; simCaption = "";
    $("#sim").textContent = "▶ Simular gestos"; $("#sim").setAttribute("aria-pressed", "false");
    cursor.hidden = true; hideHover(); handActive = false;
    setMode("Fim da simulação. Ligue a câmera para testar com a sua mão.", "idle");
    window.__arm.simDone = true;
  });
}
$("#sim").addEventListener("click", () => (simStop ? stopSim() : startSim()));

$("#start").addEventListener("click", start);
$("#stop").addEventListener("click", stop);
$("#delegate").addEventListener("change", async () => {
  if (!running) return;
  running = false;
  try { landmarker && landmarker.close(); } catch { /* ignora */ }
  landmarker = null;
  try { await loadModel(); running = true; autoChecked = true; requestAnimationFrame(loop); setStatus("Câmera ligada. Mostre a mão para começar.", "ok"); }
  catch (e) { setStatus(`Falha ao recarregar: ${e.message}`, "error"); }
});

window.__arm = { camera, controls, nav: { orbit, dolly, panFrac, resetView, flyTo }, visited, stats, ws, locateAt, present, startSim, stopSim, last: null, simDone: false };
