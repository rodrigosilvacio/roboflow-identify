// Detector de Queda: câmera + MediaPipe Pose (no navegador) + lógica de queda (fall-logic.js)
const MP = window.MP_CONFIG || {
  module: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs",
  wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  model: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};

const $ = (s) => document.querySelector(s);
const video = $("#video");
const overlay = $("#overlay");
const ctx = overlay.getContext("2d");
const snap = document.createElement("canvas");

const detector = new window.FallDetector({ confirmMs: 4000 });
let landmarker = null, stream = null, running = false, wakeLock = null;
let lastVideoTime = -1, frames = 0, fpsT = performance.now();
let audio = null, siren = null;

const SENS_LABEL = { 1: "Muito baixa", 2: "Baixa", 3: "Média", 4: "Alta", 5: "Muito alta" };
const POSTURE = { em_pe: "Em pé", abaixado: "Abaixada / sentada", deitado: "Deitada", ausente: "Fora da imagem" };
const PHASE = { normal: "Normal", suspeita: "Possível queda", alarme: "QUEDA" };
const COLOR = { normal: "#3fb950", suspeita: "#d29922", alarme: "#f85149" };
// Ligações do esqueleto (índices do MediaPipe Pose)
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

const setStatus = (msg, kind = "") => { $("#status").textContent = msg; $("#status").dataset.kind = kind; };

// ---------- Som ----------
function ensureAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
  return audio;
}
function beeps(n, freq, len = 0.12, gap = 0.18) {
  if (!$("#sound").checked) return;
  try {
    const ac = ensureAudio();
    for (let i = 0; i < n; i++) {
      const t = ac.currentTime + i * gap;
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = freq; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      o.start(t); o.stop(t + len);
    }
  } catch { /* sem áudio */ }
}
function startSiren() {
  if (siren || !$("#sound").checked) return;
  try {
    const ac = ensureAudio();
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lfoGain = ac.createGain(), g = ac.createGain();
    o.type = "sawtooth"; o.frequency.value = 900;
    lfo.frequency.value = 1.6; lfoGain.gain.value = 350;  // sirene sobe e desce
    lfo.connect(lfoGain); lfoGain.connect(o.frequency);
    g.gain.value = 0.18; o.connect(g); g.connect(ac.destination);
    o.start(); lfo.start();
    siren = { o, lfo };
  } catch { /* sem áudio */ }
}
function stopSiren() {
  if (!siren) return;
  try { siren.o.stop(); siren.lfo.stop(); } catch { /* já parado */ }
  siren = null;
}

// ---------- Banner e registro ----------
function banner(level, title, text, withAck = false) {
  const b = $("#banner");
  b.dataset.level = level;
  $("#banner-title").textContent = title;
  $("#banner-text").textContent = text;
  $("#ack").hidden = !withAck;
  b.hidden = false;
  clearTimeout(banner.t);
  if (!withAck) banner.t = setTimeout(() => (b.hidden = true), level === "info" ? 4000 : 6000);
}
function logEvent(level, title, detail) {
  const time = new Date().toLocaleTimeString("pt-BR");
  let img = "";
  if (video.videoWidth) {
    snap.width = 192; snap.height = Math.round((192 * video.videoHeight) / video.videoWidth);
    snap.getContext("2d").drawImage(video, 0, 0, snap.width, snap.height);
    img = `<img alt="Quadro da ocorrência" src="${snap.toDataURL("image/jpeg", 0.7)}">`;
  }
  const log = $("#log");
  log.querySelector(".empty")?.remove();
  const li = document.createElement("li");
  li.dataset.level = level;
  li.innerHTML = `${img}<div><b>${time} · ${title}</b><span>${detail}</span></div>`;
  log.prepend(li);
  while (log.children.length > 12) log.lastChild.remove();
}
function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
}

function handleEvent(ev) {
  const secs = Math.round(detector.opt.confirmMs / 1000);
  switch (ev.type) {
    case "possivel_queda":
      beeps(2, 1100);
      banner("warn", "⚠️ Possível queda", ev.reason === "saiu_do_quadro"
        ? `A pessoa desceu rápido e saiu da imagem. Confirmando em ${secs} s...`
        : `Confirmando em ${secs} s. Se a pessoa levantar, o alerta é cancelado.`);
      logEvent("warn", "Possível queda", ev.reason === "saiu_do_quadro" ? "saiu da imagem após descida rápida" : "descida rápida e corpo deitado");
      break;
    case "queda_confirmada":
      startSiren();
      banner("alarm", "🚨 QUEDA DETECTADA", ev.reason === "deitado_muito_tempo"
        ? "A pessoa está deitada há mais de 30 s." : "A pessoa continua no chão.", true);
      logEvent("alarm", "Queda confirmada", ev.reason === "deitado_muito_tempo" ? "deitada há mais de 30 s" : "continua no chão");
      notify("Queda detectada", "A pessoa continua no chão.");
      break;
    case "recuperou":
      banner("info", "✅ Levantou", "A suspeita de queda foi cancelada.");
      logEvent("info", "Levantou", "suspeita cancelada (vale verificar se está bem)");
      break;
    case "movimento_brusco":
      beeps(3, 760, 0.08, 0.12);
      banner("warn", "⚡ Movimento brusco", `Velocidade do tronco: ${ev.speed.toFixed(1).replace(".", ",")} troncos/s`);
      logEvent("warn", "Movimento brusco", `${ev.speed.toFixed(1).replace(".", ",")} troncos/s`);
      break;
  }
}

// ---------- Desenho ----------
function draw(lm, phase) {
  overlay.width = video.clientWidth; overlay.height = video.clientHeight;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!lm) return;
  // video usa object-fit: cover: calcula a área visível para alinhar os pontos
  const vw = video.videoWidth, vh = video.videoHeight, cw = overlay.width, ch = overlay.height;
  const scale = Math.max(cw / vw, ch / vh), ox = (cw - vw * scale) / 2, oy = (ch - vh * scale) / 2;
  const px = (p) => [p.x * vw * scale + ox, p.y * vh * scale + oy];
  const color = COLOR[phase];
  ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.lineCap = "round";
  for (const [a, b] of BONES) {
    if ((lm[a].visibility ?? 1) < 0.5 || (lm[b].visibility ?? 1) < 0.5) continue;
    const [x1, y1] = px(lm[a]), [x2, y2] = px(lm[b]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  for (const i of [0, 11, 12, 23, 24, 25, 26, 27, 28]) {
    if ((lm[i].visibility ?? 1) < 0.5) continue;
    const [x, y] = px(lm[i]); ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  }
}

function updatePanel(out) {
  $("#posture").textContent = POSTURE[out.posture] || "—";
  const m = out.metrics;
  $("#angle").textContent = m ? `${Math.round(m.angle)}°` : "—";
  $("#speed").textContent = m ? `${m.centerSpeed.toFixed(1).replace(".", ",")} t/s` : "—";
  const badge = $("#phase-badge");
  badge.hidden = false; badge.dataset.phase = out.phase; badge.textContent = PHASE[out.phase];
}

// ---------- Loop principal ----------
function loop() {
  if (!running) return;
  const now = performance.now();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    let lm = null;
    try {
      const res = window.__poseOverride ? window.__poseOverride(now) : landmarker.detectForVideo(video, now);
      lm = res?.landmarks?.[0] || null;
    } catch (e) { console.warn(e); }
    const out = detector.update(lm, now);
    out.events.forEach(handleEvent);
    draw(lm, out.phase);
    updatePanel(out);
    frames++;
    if (now - fpsT >= 1000) { $("#fps").textContent = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
  }
  requestAnimationFrame(loop);
}

async function loadModel() {
  if (landmarker || window.__poseOverride) return;
  setStatus("Carregando o modelo de pose...");
  const { FilesetResolver, PoseLandmarker } = await import(MP.module);
  const fileset = await FilesetResolver.forVisionTasks(MP.wasm);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MP.model, delegate },
    runningMode: "VIDEO", numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { landmarker = await PoseLandmarker.createFromOptions(fileset, opts("GPU")); }
  catch { landmarker = await PoseLandmarker.createFromOptions(fileset, opts("CPU")); } // sem GPU
}

async function start() {
  ensureAudio(); // o clique libera o som no navegador
  if (!navigator.mediaDevices?.getUserMedia) return setStatus("Este navegador não permite acesso à câmera.", "error");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    return setStatus(e.name === "NotAllowedError" ? "Permissão da câmera negada. Libere o acesso no navegador." : `Câmera indisponível: ${e.message}`, "error");
  }
  video.srcObject = stream;
  await video.play();
  document.querySelector(".video-wrap").style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  $("#placeholder").hidden = true;
  try { await loadModel(); }
  catch (e) {
    stop();
    return setStatus(`Não foi possível carregar o modelo de pose: ${e.message}`, "error");
  }
  detector.reset();
  running = true;
  $("#live").hidden = false; $("#stop").hidden = false;
  setStatus("Acompanhando. Fique de corpo inteiro na imagem, se possível.", "ok");
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* opcional */ }
  requestAnimationFrame(loop);
}

function stop() {
  running = false;
  stopSiren();
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  wakeLock?.release?.(); wakeLock = null;
  video.srcObject = null;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  $("#placeholder").hidden = false; $("#live").hidden = true; $("#stop").hidden = true; $("#phase-badge").hidden = true;
  setStatus("Parado.");
}

function applySettings() {
  const sens = Number($("#sens").value);
  $("#sens-out").textContent = SENS_LABEL[sens];
  $("#confirm-out").textContent = `${$("#confirm").value} s`;
  detector.setOptions({
    sensitivity: sens,
    confirmMs: Number($("#confirm").value) * 1000,
    abruptEnabled: $("#abrupt").checked,
    longLieEnabled: $("#longlie").checked,
  });
}

$("#start").addEventListener("click", start);
$("#stop").addEventListener("click", stop);
$("#ack").addEventListener("click", () => {
  detector.acknowledge(); stopSiren();
  $("#banner").hidden = true;
  logEvent("info", "Alarme desligado", "confirmado por uma pessoa");
});
$("#test-alarm").addEventListener("click", () => {
  ensureAudio();
  startSiren();
  banner("alarm", "🔔 Teste de alarme", "É assim que o alarme de queda soa.", true);
});
["#sens", "#confirm", "#abrupt", "#longlie"].forEach((s) => $(s).addEventListener("input", applySettings));
$("#sound").addEventListener("change", () => { if (!$("#sound").checked) stopSiren(); });
document.addEventListener("visibilitychange", () => {
  if (running && document.hidden) setStatus("Aba em segundo plano: o acompanhamento pode parar. Mantenha a aba visível.", "error");
  else if (running) setStatus("Acompanhando.", "ok");
});
applySettings();
