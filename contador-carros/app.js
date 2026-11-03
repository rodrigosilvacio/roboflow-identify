(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const canvas = $("#preview");
  const ctx = canvas.getContext("2d");
  const status = $("#status");
  const MAX_MB = 8;
  const MAX_SIDE = 1280; // reduz antes de enviar: mais rápido e mais barato
  const LABELS = { car: "Carros", truck: "Caminhões", bus: "Ônibus", motorcycle: "Motos" };
  const COLORS = { car: "#7c5cff", truck: "#ff8c00", bus: "#2ea043", motorcycle: "#e91e63" };
  let currentImg = null;

  const setStatus = (msg, kind = "") => { status.textContent = msg; status.dataset.kind = kind; };

  function draw(img, detections = [], srcW = img.width) {
    const scale = Math.min(1, 900 / img.width);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const k = canvas.width / srcW; // detecções vêm nas coordenadas da imagem enviada
    ctx.lineWidth = Math.max(2, canvas.width / 300);
    ctx.font = `600 ${Math.max(12, canvas.width / 60)}px system-ui, sans-serif`;
    detections.forEach((d, i) => {
      const color = COLORS[d.class] || "#7c5cff";
      const x = (d.x - d.width / 2) * k, y = (d.y - d.height / 2) * k;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, d.width * k, d.height * k);
      const tag = String(i + 1);
      const tw = ctx.measureText(tag).width + 8;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.max(0, y - 20), tw, 20);
      ctx.fillStyle = "#fff";
      ctx.fillText(tag, x + 4, Math.max(14, y - 5));
    });
    canvas.hidden = false;
  }

  function toBase64(img) {
    const s = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return { base64: c.toDataURL("image/jpeg", 0.9).split(",")[1], width: c.width };
  }

  async function count(img) {
    if (!cfg.PROXY_URL) return setStatus("Serviço de contagem não configurado.", "error");
    const { base64, width } = toBase64(img);
    const classes = $("#others").checked ? ["car", "truck", "bus", "motorcycle"] : ["car"];
    setStatus("Contando veículos...");
    $("#drop").setAttribute("aria-busy", "true");
    try {
      const resp = await fetch(cfg.PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
          apikey: cfg.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ image: base64, confidence: Number($("#conf").value), classes }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);

      draw(img, data.detections, data.image?.width || width);
      $("#count").textContent = data.count;
      const byClass = {};
      data.detections.forEach((d) => (byClass[d.class] = (byClass[d.class] || 0) + 1));
      $("#breakdown").innerHTML = Object.entries(byClass)
        .map(([c, n]) => `<li><span class="dot" style="background:${COLORS[c] || "#7c5cff"}"></span>${LABELS[c] || c}<b>${n}</b></li>`)
        .join("");
      $("#result").hidden = false;
      setStatus(data.count ? "Pronto. Cada caixa numerada é um veículo." : "Nenhum veículo encontrado. Tente reduzir a confiança mínima.", "ok");
    } catch (e) {
      setStatus(`Não foi possível contar: ${e.message}`, "error");
    } finally {
      $("#drop").removeAttribute("aria-busy");
    }
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setStatus("Envie um arquivo de imagem (JPG, PNG, WEBP).", "error");
    if (file.size > MAX_MB * 1024 * 1024) return setStatus(`Imagem acima de ${MAX_MB} MB.`, "error");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { currentImg = img; draw(img); count(img); };
    img.onerror = () => setStatus("Não foi possível ler a imagem.", "error");
    img.src = url;
  }

  const drop = $("#drop");
  const fileInput = $("#file");
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
  $("#conf").addEventListener("input", (e) => ($("#conf-out").textContent = `${Math.round(e.target.value * 100)}%`));
  $("#conf").addEventListener("change", () => currentImg && count(currentImg));
  $("#others").addEventListener("change", () => currentImg && count(currentImg));
})();
