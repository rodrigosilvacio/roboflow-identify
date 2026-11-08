// Avaliação do Cliente: totem com consentimento + MediaPipe Face Landmarker no navegador
const { Session, LABELS, summarize } = window.ExpressionLogic;

// Arquivos do MediaPipe servidos pelo próprio site (vendor/ na raiz), com CDN do Google como reserva
const base = new URL("../vendor/mediapipe/", import.meta.url).href;
const MP_SOURCES = window.MP_CONFIG ? [window.MP_CONFIG] : [
  { name: "local", module: `${base}vision_bundle.mjs`, wasm: `${base}wasm`, model: `${base}face_landmarker.task` },
  {
    name: "cdn",
    module: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs",
    wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    model: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  },
];
const CAPTURE_MS = 3000;
const STORE_KEY = "avaliacoes-v1";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const video = $("#video");
let landmarker = null, loading = null, stream = null, pending = null, idleTimer = null;

// ---------- Armazenamento local (MVP) ----------
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function save(records) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(records)); } catch { /* modo privado */ }
}
function addRecord(rec) {
  const all = load();
  all.push({ t: new Date().toISOString(), ...rec });
  save(all);
}

// ---------- Telas ----------
function show(id) {
  $$(".screen").forEach((s) => (s.hidden = s.id !== id));
  $("#kiosk-msg").textContent = "";
  clearTimeout(idleTimer);
  // Sem resposta na confirmação: volta ao início sem salvar nada
  if (id === "screen-confirm") idleTimer = setTimeout(() => show("screen-start"), 20000);
}
function thanks(final) {
  $("#thanks-emoji").textContent = final === "triste" ? "🙏" : final === "neutro" ? "👍" : "💜";
  $("#thanks-text").textContent = final === "triste"
    ? "Sentimos muito. Vamos usar sua avaliação para melhorar."
    : "Sua opinião ajuda a melhorar o atendimento.";
  show("screen-thanks");
  setTimeout(() => show("screen-start"), 4000);
}

// ---------- MediaPipe ----------
async function loadFrom(src) {
  const { FilesetResolver, FaceLandmarker } = await import(src.module);
  const fileset = await FilesetResolver.forVisionTasks(src.wasm);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: src.model, delegate },
    runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true,
  });
  try { return await FaceLandmarker.createFromOptions(fileset, opts("GPU")); }
  catch { return await FaceLandmarker.createFromOptions(fileset, opts("CPU")); }
}
function ensureModel() {
  if (landmarker || window.__faceOverride) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      let lastError;
      for (const src of MP_SOURCES) {
        try { landmarker = await loadFrom(src); window.__mpSource = src.name; return; }
        catch (e) { lastError = e; console.warn(`MediaPipe (${src.name}) falhou`, e); }
      }
      loading = null;
      throw lastError;
    })();
  }
  return loading;
}

// ---------- Captura de 3 segundos ----------
function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}

async function captureExpression() {
  show("screen-camera");
  $("#live-label").textContent = "Preparando...";
  $("#countdown").textContent = "3";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  } catch (e) {
    show("screen-start");
    $("#kiosk-msg").textContent = e.name === "NotAllowedError"
      ? "Sem permissão para a câmera. Você pode avaliar tocando nos botões."
      : "Câmera indisponível. Você pode avaliar tocando nos botões.";
    return;
  }
  video.srcObject = stream;
  await video.play();
  try { await ensureModel(); }
  catch {
    stopCamera(); show("screen-start");
    $("#kiosk-msg").textContent = "Não foi possível carregar a análise. Avalie tocando nos botões.";
    return;
  }

  const session = new Session();
  const start = performance.now();
  let lastTime = -1;
  await new Promise((done) => {
    function frame() {
      if (!stream) return done(); // cancelado
      const now = performance.now();
      const left = CAPTURE_MS - (now - start);
      $("#countdown").textContent = Math.max(1, Math.ceil(left / 1000));
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        let shapes = null;
        try {
          const res = window.__faceOverride ? window.__faceOverride(now) : landmarker.detectForVideo(video, now);
          shapes = res?.faceBlendshapes?.[0]?.categories || null;
        } catch (e) { console.warn(e); }
        const f = session.add(shapes);
        $("#live-label").textContent = f ? `${LABELS[f.label].emoji} ${LABELS[f.label].nome}` : "Procurando o rosto...";
      }
      if (left <= 0) return done();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  const cancelled = !stream;
  stopCamera(); // a câmera desliga assim que os 3 segundos acabam
  if (cancelled) return;

  const r = session.result();
  window.__lastSession = r; // diagnóstico
  if (r.label === "sem_rosto") {
    show("screen-start");
    $("#kiosk-msg").textContent = "Não conseguimos ver seu rosto. Tente de novo, mais perto e com luz, ou avalie tocando nos botões.";
    return;
  }
  pending = { suggested: r.label, confidence: Math.round(r.confidence * 100) / 100 };
  $("#suggest-emoji").textContent = LABELS[r.label].emoji;
  $("#suggest-name").textContent = LABELS[r.label].nome;
  $$("[data-fix]").forEach((b) => (b.hidden = b.dataset.fix === r.label));
  show("screen-confirm");
}

// ---------- Painel ----------
const pct = (v) => `${Math.round(v * 100)}%`;
function renderPanel() {
  const records = load();
  const s = summarize(records);
  $("#k-total").textContent = s.total;
  $("#k-sat").textContent = s.total ? pct(s.satisfaction) : "—";
  $("#k-index").textContent = s.total ? (s.index > 0 ? `+${s.index}` : s.index) : "—";
  $("#k-acc").textContent = s.cameraAccuracy === null ? "—" : pct(s.cameraAccuracy);
  $("#k-acc-n").textContent = s.cameraUses ? `em ${s.cameraUses} ${s.cameraUses === 1 ? "uso" : "usos"} da câmera` : "";
  const colors = { feliz: "var(--ok)", neutro: "var(--muted)", triste: "var(--err)" };
  $("#bars").innerHTML = ["feliz", "neutro", "triste"].map((k) => {
    const v = s.total ? s.count[k] / s.total : 0;
    return `<div class="bar"><span>${LABELS[k].emoji} ${LABELS[k].nome}</span><div class="track"><div class="fill" style="width:${v * 100}%;background:${colors[k]}"></div></div><b>${s.count[k]}</b></div>`;
  }).join("");
  const rows = records.slice(-15).reverse().map((r) => {
    const time = new Date(r.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const sug = r.suggested ? `${LABELS[r.suggested].emoji} ${r.suggested === r.final ? "acertou" : "corrigido"}` : "—";
    return `<tr><td>${time}</td><td>${LABELS[r.final].emoji} ${LABELS[r.final].nome}</td><td>${r.source === "camera" ? "Câmera" : "Toque"}</td><td>${sug}</td></tr>`;
  });
  $("#rows").innerHTML = rows.length ? rows.join("") : `<tr><td colspan="4" class="muted">Nenhuma avaliação ainda.</td></tr>`;
}
function route() {
  const panel = location.hash === "#painel";
  $("#panel").hidden = !panel;
  $("#kiosk").hidden = panel;
  $("#to-panel").hidden = panel;
  if (panel) renderPanel();
}

// ---------- Eventos ----------
$("#btn-camera").addEventListener("click", captureExpression);
$("#btn-cancel").addEventListener("click", () => { stopCamera(); show("screen-start"); });
$$("[data-choice]").forEach((b) => b.addEventListener("click", () => {
  addRecord({ source: "toque", final: b.dataset.choice });
  thanks(b.dataset.choice);
}));
$("#btn-yes").addEventListener("click", () => {
  addRecord({ source: "camera", suggested: pending.suggested, final: pending.suggested, confidence: pending.confidence });
  thanks(pending.suggested);
});
$$("[data-fix]").forEach((b) => b.addEventListener("click", () => {
  addRecord({ source: "camera", suggested: pending.suggested, final: b.dataset.fix, confidence: pending.confidence });
  thanks(b.dataset.fix);
}));
$("#to-kiosk").addEventListener("click", (e) => { e.preventDefault(); history.replaceState(null, "", location.pathname); route(); });
$("#btn-csv").addEventListener("click", () => {
  const lines = [["data_hora", "avaliacao", "origem", "camera_sugeriu", "confianca"]]
    .concat(load().map((r) => [r.t, LABELS[r.final].nome, r.source, r.suggested ? LABELS[r.suggested].nome : "", r.confidence ?? ""]));
  const blob = new Blob(["﻿" + lines.map((l) => l.join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `avaliacoes-${new Date().toISOString().slice(0, 10)}.csv` });
  link.click();
  URL.revokeObjectURL(link.href);
});
$("#btn-clear").addEventListener("click", () => {
  if (confirm("Apagar todas as avaliações salvas neste navegador?")) { save([]); renderPanel(); }
});
window.addEventListener("hashchange", route);
route();
// Pré-carrega o modelo em segundo plano (não liga a câmera): a avaliação começa mais rápido
setTimeout(() => ensureModel().catch(() => {}), 1500);
