import { extractPalette, nearestColorName, rgbToHex } from "./colors.js";

const cfg = window.APP_CONFIG || {};
const $ = (s) => document.querySelector(s);
const drop = $("#drop");
const fileInput = $("#file");
const canvas = $("#preview");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const result = $("#result");
const status = $("#status");
const useRoboflow = $("#use-roboflow");
let currentFile = null;

if (cfg.ROBOFLOW_PROXY_URL) {
  $("#roboflow-toggle").hidden = false;
}

const MAX_MB = 8;

function setStatus(msg, kind = "") {
  status.textContent = msg;
  status.dataset.kind = kind;
}

function renderMain(rgb, source) {
  const hex = rgbToHex(rgb);
  $("#swatch").style.background = hex;
  $("#color-name").textContent = nearestColorName(rgb);
  $("#color-hex").textContent = hex;
  $("#color-rgb").textContent = `rgb(${rgb.join(", ")})`;
  $("#source").textContent = source;
  result.hidden = false;
}

function renderPalette(palette) {
  const list = $("#palette");
  list.innerHTML = "";
  for (const { rgb, share } of palette) {
    const hex = rgbToHex(rgb);
    const li = document.createElement("li");
    li.innerHTML = `<span class="chip" style="background:${hex}"></span>
      <span class="pname">${nearestColorName(rgb)}</span>
      <code>${hex}</code><span class="pct">${(share * 100).toFixed(1)}%</span>`;
    li.title = "Copiar HEX";
    li.addEventListener("click", () => copy(hex));
    list.appendChild(li);
  }
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); setStatus(`${text} copiado`, "ok"); } catch { /* sem permissão */ }
}

function drawImage(img) {
  const maxW = 640;
  const scale = Math.min(1, maxW / img.width);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  canvas.hidden = false;
}

function analyzeLocal() {
  // Reduz para ~100px no menor lado (como o bloco do Roboflow) para ficar rápido
  const s = Math.min(1, 100 / Math.min(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * s));
  const h = Math.max(1, Math.round(canvas.height * s));
  const small = document.createElement("canvas");
  small.width = w; small.height = h;
  const sctx = small.getContext("2d");
  sctx.drawImage(canvas, 0, 0, w, h);
  return extractPalette(sctx.getImageData(0, 0, w, h), 5);
}

async function analyzeRoboflow(file) {
  const base64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const headers = { "Content-Type": "application/json" };
  if (cfg.SUPABASE_ANON_KEY) {
    headers.Authorization = `Bearer ${cfg.SUPABASE_ANON_KEY}`;
    headers.apikey = cfg.SUPABASE_ANON_KEY;
  }
  const resp = await fetch(cfg.ROBOFLOW_PROXY_URL, { method: "POST", headers, body: JSON.stringify({ image: base64 }) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.rgb) throw new Error(data.error || `Erro ${resp.status}`);
  return data.rgb;
}

async function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) return setStatus("Envie um arquivo de imagem (JPG, PNG, WEBP).", "error");
  if (file.size > MAX_MB * 1024 * 1024) return setStatus(`Imagem acima de ${MAX_MB} MB.`, "error");
  currentFile = file;
  setStatus("Analisando...");

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    drawImage(img);
    URL.revokeObjectURL(url);
    const palette = analyzeLocal();
    renderPalette(palette);
    if (palette.length) renderMain(palette[0].rgb, "Análise local (navegador)");

    if (cfg.ROBOFLOW_PROXY_URL && useRoboflow.checked) {
      setStatus("Consultando o Roboflow...");
      try {
        const rgb = await analyzeRoboflow(file);
        renderMain(rgb, "Roboflow Workflow (Dominant Color)");
        setStatus("Pronto.", "ok");
      } catch (e) {
        setStatus(`Roboflow indisponível (${e.message}). Exibindo análise local.`, "error");
      }
    } else {
      setStatus("Pronto. Clique na imagem para ver a cor de um ponto específico.", "ok");
    }
  };
  img.onerror = () => setStatus("Não foi possível ler a imagem.", "error");
  img.src = url;
}

// Conta-gotas: clique na imagem para pegar a cor do ponto
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  renderMain([r, g, b], `Ponto selecionado (${x}, ${y})`);
});

fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
window.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) handleFile(item.getAsFile());
});
useRoboflow.addEventListener("change", () => currentFile && handleFile(currentFile));
$("#copy-hex").addEventListener("click", () => copy($("#color-hex").textContent));
