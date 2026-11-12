// Armazém 3D por Gestos: three.js (cena) + MediaPipe Hand Landmarker (mãos, no navegador)
import * as THREE from "three";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { buildWarehouse } from "./scene.js";

const {
  PointFilter, mapToScreen, handSize, PinchDetector, GestureStabilizer, classifyGesture,
  TwoHandZoom, PalmNavigator, PinchDrag,
} = window.HandLogic;

const $ = (s) => document.querySelector(s);
const stage = $("#stage"), canvas = $("#scene"), cursor = $("#cursor"), video = $("#video");
const handCanvas = $("#hand-canvas"), hctx = handCanvas.getContext("2d");
const zoomDots = [$("#zoom-dot-a"), $("#zoom-dot-b")];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
function resetView() { camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.update(); }
resetView();

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  needsRender = true;
}
new ResizeObserver(resize).observe(stage);
resize();

// ---------- Navegação (usada pelas mãos e pelos botões) ----------
const sph = new THREE.Spherical(), off = new THREE.Vector3();
const bounds = { x: ws.size.width / 2 + 8, zMin: -ws.size.length / 2 - 4, zMax: ws.size.length / 2 + 22 };
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
$("#zoom-in").addEventListener("click", () => dolly(1.35));
$("#zoom-out").addEventListener("click", () => dolly(1 / 1.35));
$("#reset").addEventListener("click", resetView);

// ---------- Seleção de módulos ----------
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const selected = new Map(); // id -> { count, data }
let hoverIdx = null, audio = null;
function bayAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(ws.hits, false)[0];
  return hit ? hit.instanceId : null;
}
function setHover(i) { if (i !== hoverIdx) { hoverIdx = i; ws.setHover(i); invalidate(); } }
function tick() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 988; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.12, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    o.start(); o.stop(audio.currentTime + 0.12);
  } catch { /* sem áudio */ }
}
function selectBay(i) {
  if (i == null) return;
  const d = ws.bayData[i];
  ws.setSelected(i); invalidate();
  const s = selected.get(d.id) || { count: 0, data: d, first: Date.now() };
  s.count++; selected.set(d.id, s);
  $("#info").hidden = false;
  $("#info-title").textContent = `Estante ${String(d.estante).padStart(2, "0")} · Módulo ${String(d.modulo).padStart(2, "0")}`;
  $("#info-levels").textContent = d.niveis;
  $("#info-occ").textContent = `${d.ocupados} de ${d.posicoes} paletes (${Math.round((d.ocupados / d.posicoes) * 100)}%)`;
  $("#info-bar").style.width = `${(d.ocupados / d.posicoes) * 100}%`;
  const items = [...selected.values()].sort((a, b) => a.first - b.first);
  $("#sel-count").textContent = `(${items.length})`;
  $("#sel-list").innerHTML = items.map((x) => `<li><span>${x.data.id}</span><span>${Math.round((x.data.ocupados / x.data.posicoes) * 100)}% ocupado</span></li>`).join("");
  tick();
}

// Mouse: OrbitControls cuida de girar/mover/zoom; clique sem arrastar seleciona
let down = null;
canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; $("#hint").hidden = true; });
canvas.addEventListener("pointerup", (e) => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && performance.now() - down.t < 500) selectBay(bayAt(e.clientX, e.clientY));
  down = null;
});
canvas.addEventListener("pointermove", (e) => { if (!handActive) setHover(bayAt(e.clientX, e.clientY)); });

// Laço de desenho: só redesenha quando algo muda (deixa o processador livre para reconhecer as mãos)
controls.addEventListener("change", invalidate);
function render() {
  controls.update(); // com amortecimento, dispara "change" enquanto a vista ainda desliza
  if (needsRender) { needsRender = false; renderer.render(scene, camera); }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// ---------- Mãos (MediaPipe) ----------
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
let landmarker = null, stream = null, running = false, handActive = false, lostAt = 0;
let delegateUsed = "-", gpuErrors = 0, runningSince = 0, autoChecked = false, startFrames = 0, firstFrameAt = 0;
const perHand = {};
const handState = (k) => (perHand[k] ||= {
  filter: new PointFilter(), pinch: new PinchDetector(), gesture: new GestureStabilizer(),
  pinchPt: new PointFilter(), palm: new PalmNavigator(), drag: new PinchDrag(),
});
const twoZoom = new TwoHandZoom();
const stats = { frames: 0, withHand: 0, fps: 0, t0: performance.now(), recent: [] };
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const LABEL = { aponta: "☝️ Indicador: cursor", pinca: "🤏 Pinça", aberta: "✋ Palma: movendo a vista", punho: "✊ Pausa", zoom: "🙌 Zoom com as duas mãos" };

const preferredDelegate = () => (new URLSearchParams(location.search).get("processador") || $("#delegate").value || "auto").toLowerCase();
async function loadFrom(src, pref) {
  const { FilesetResolver, HandLandmarker } = await import(src.module);
  const fileset = await FilesetResolver.forVisionTasks(src.wasm);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: src.model, delegate }, runningMode: "VIDEO", numHands: 2,
    minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.4,
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

function drawHands(hands) {
  handCanvas.width = handCanvas.clientWidth; handCanvas.height = handCanvas.clientHeight;
  hctx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  const vw = video.videoWidth || 4, vh = video.videoHeight || 3, cw = handCanvas.width, ch = handCanvas.height;
  const s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  const P = (p) => [p.x * vw * s + ox, p.y * vh * s + oy];
  for (const h of hands) {
    hctx.lineWidth = 3; hctx.strokeStyle = "#2f9bff";
    for (const [a, b] of BONES) { const [x1, y1] = P(h.lm[a]), [x2, y2] = P(h.lm[b]); hctx.beginPath(); hctx.moveTo(x1, y1); hctx.lineTo(x2, y2); hctx.stroke(); }
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
    $("#diag").textContent = `Modelo: ${window.__mpSource || "simulado"} · Processador: ${delegateUsed} · ${stats.fps} quadros/s · mão em ${pct}% dos quadros`;
  }
}

const toScreen = (p) => { const m = mapToScreen(p), r = canvas.getBoundingClientRect(); return { x: r.left + m.x * r.width, y: r.top + m.y * r.height }; };
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function showCursor(p, mode) { cursor.hidden = false; cursor.dataset.mode = mode; cursor.style.transform = `translate(${p.x}px, ${p.y}px)`; }

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
    const hands = (res?.landmarks || []).map((lm, i) => {
      const key = res.handedness?.[i]?.[0]?.categoryName || `mao${i}`, st = handState(key);
      const pz = st.pinch.update(lm);
      return { key, lm, st, pz, gesture: st.gesture.update(classifyGesture(lm, pz.pinched), now) };
    });
    updateDiag(now, hands.length);
    if (stats.frames - startFrames === 1) firstFrameAt = now;
    // GPU lenta em algumas placas: no modo automático, mede com quadros reais e troca para a CPU
    // mede desde o início (mesmo com menos de 1 quadro/s); os primeiros quadros da GPU costumam demorar a "aquecer"
    if (!autoChecked && delegateUsed === "GPU" && preferredDelegate() === "auto" && now - runningSince > 3000 && stats.frames - startFrames >= 3) {
      autoChecked = true;
      const fpsNow = Math.round(((stats.frames - startFrames - 1) * 1000) / (now - firstFrameAt));
      if (fpsNow < 10) { running = false; switchToCPU(`GPU lenta (${fpsNow} quadros/s)`).then(() => { running = true; requestAnimationFrame(loop); }); return; }
    }
    handleHands(hands, now);
    drawHands(hands);
  }
  requestAnimationFrame(loop);
}

function resetHandNav(except) { Object.values(perHand).forEach((s) => { if (s !== except) { s.palm.reset(); s.drag.reset(); } }); }

function handleHands(hands, now) {
  zoomDots.forEach((d) => (d.hidden = true));
  if (!hands.length) {
    $("#gesture").textContent = "Procurando a mão...";
    twoZoom.reset(); resetHandNav();
    if (!lostAt) lostAt = now;
    if (now - lostAt > 300) { cursor.hidden = true; setHover(null); handActive = false; }
    return;
  }
  lostAt = 0; handActive = true;

  // 🙌 Duas mãos em pinça: zoom (afastar aproxima)
  if (hands.length === 2 && hands.every((h) => h.gesture === "pinca")) {
    const pts = hands.map((h) => h.st.pinchPt.filter(toScreen(mid(h.lm[4], h.lm[8])), now));
    const z = twoZoom.update(pts[0], pts[1]);
    if (z.factor && Math.abs(z.factor - 1) > 0.002) dolly(Math.pow(z.factor, 1.6));
    pts.forEach((p, i) => { zoomDots[i].hidden = false; zoomDots[i].style.transform = `translate(${p.x}px, ${p.y}px)`; });
    $("#gesture").textContent = LABEL.zoom;
    cursor.hidden = true; resetHandNav();
    return;
  }
  twoZoom.reset();

  const main = hands.find((h) => h.gesture === "pinca" || h.gesture === "aponta") || hands.find((h) => h.gesture === "aberta") || hands[0];
  const st = main.st;
  $("#gesture").textContent = LABEL[main.gesture] || "✋ Mão detectada";
  resetHandNav(st);

  // ✊ Pausa
  if (main.gesture === "punho") { st.palm.reset(); st.drag.reset(); showCursor(toScreen(main.lm[9]), "pausa"); return; }

  // ✋ Palma em movimento: move a vista; aproximar/afastar a palma da câmera dá zoom
  if (main.gesture === "aberta") {
    st.drag.reset();
    const pal = mapToScreen(main.lm[9]);
    const r = st.palm.update(pal, handSize(main.lm));
    if (r.dx || r.dy) panFrac(r.dx * 1.6, r.dy * 1.6);
    if (r.zoom !== 1) dolly(Math.pow(r.zoom, 2.2));
    showCursor(toScreen(main.lm[9]), "palma");
    setHover(null);
    return;
  }
  st.palm.reset();

  // ☝️ Indicador = cursor; 🤏 pinça = clicar (sem mexer) e arrastar (gira a vista)
  const p = st.filter.filter(toScreen(main.lm[8]), now);
  showCursor(p, main.pz.pinched ? "pinca" : "aponta");
  const d = st.drag.update(main.pz.pinched, p, now);
  if (d.phase === "drag") orbit(d.dx * 0.006, d.dy * 0.004);
  else setHover(bayAt(p.x, p.y));
  // Com duas mãos na imagem, a pinça de uma só não clica (evita clique ao começar o zoom)
  if (d.phase === "up" && d.click && hands.length === 1) selectBay(bayAt(d.at.x, d.at.y));
}

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) return setStatus("Este navegador não permite acesso à câmera.", "error");
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); }
  catch (e) { return setStatus(e.name === "NotAllowedError" ? "Permissão da câmera negada. Use o mouse para navegar." : `Câmera indisponível: ${e.message}`, "error"); }
  video.srcObject = stream; await video.play();
  $("#start").disabled = true; $("#stop").disabled = false;
  setStatus("Carregando o reconhecimento de mãos...");
  try { await loadModel(); }
  catch (e) { stop(); return setStatus(`Não foi possível carregar o modelo de mãos: ${e.message}`, "error"); }
  running = true; runningSince = performance.now(); autoChecked = false; startFrames = stats.frames;
  $("#conn").textContent = "Conectado"; $("#conn").dataset.on = "true"; $("#hint").hidden = true;
  setStatus("Câmera ligada. Mostre a mão para começar.", "ok");
  requestAnimationFrame(loop);
}
function stop() {
  running = false; handActive = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; video.srcObject = null;
  hctx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  cursor.hidden = true; zoomDots.forEach((d) => (d.hidden = true)); setHover(null);
  $("#start").disabled = false; $("#stop").disabled = true;
  $("#conn").textContent = "Desligado"; $("#conn").dataset.on = "false";
  $("#gesture").textContent = "Câmera desligada";
  setStatus("Câmera desligada. Use o mouse ou ligue a câmera.");
}
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

window.__arm = { camera, controls, nav: { orbit, dolly, panFrac, resetView }, selected, stats, ws };
