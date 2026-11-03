(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const video = $("#video");
  const overlay = $("#overlay");
  const octx = overlay.getContext("2d");

  // Parâmetros do MVP
  const SAMPLE_W = 64, SAMPLE_H = 48;      // quadro reduzido para medir movimento (barato)
  const PIXEL_DELTA = 32;                  // diferença mínima de brilho para um pixel "mudar"
  const SENS = { 1: 0.12, 2: 0.07, 3: 0.04, 4: 0.02, 5: 0.01 }; // % da imagem que precisa mudar
  const SENS_LABEL = { 1: "Muito baixa", 2: "Baixa", 3: "Média", 4: "Alta", 5: "Muito alta" };
  const AI_COOLDOWN_MS = 2500;             // no máximo 1 consulta à IA a cada 2,5 s
  const ALERT_COOLDOWN_MS = 10000;         // não repete o alerta por 10 s
  const SEND_W = 640;                      // largura do quadro enviado ao Roboflow

  const sample = document.createElement("canvas");
  sample.width = SAMPLE_W; sample.height = SAMPLE_H;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  const sendCanvas = document.createElement("canvas");

  let stream = null, prev = null, timer = null, wakeLock = null;
  let lastAI = 0, lastAlert = 0, inFlight = false, calls = 0, alerts = 0, boxesUntil = 0;

  const setStatus = (msg, kind = "") => { $("#status").textContent = msg; $("#status").dataset.kind = kind; };
  const setState = (s, kind = "") => { $("#state").textContent = s; $("#state").dataset.kind = kind; };
  const threshold = () => SENS[$("#sens").value];

  function updateThresholdMarker() {
    $("#meter-threshold").style.left = `${Math.min(100, (threshold() / 0.15) * 100)}%`;
    $("#sens-out").textContent = SENS_LABEL[$("#sens").value];
  }

  // 1) Mede quanto da imagem mudou em relação ao quadro anterior (100% no navegador)
  function motionLevel() {
    sctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = sctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    const gray = new Uint8Array(SAMPLE_W * SAMPLE_H);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) gray[j] = (data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10;
    let changed = 0;
    if (prev) for (let j = 0; j < gray.length; j++) if (Math.abs(gray[j] - prev[j]) > PIXEL_DELTA) changed++;
    const first = !prev;
    prev = gray;
    return first ? 0 : changed / gray.length;
  }

  function frameToBase64() {
    const s = SEND_W / video.videoWidth;
    sendCanvas.width = SEND_W;
    sendCanvas.height = Math.round(video.videoHeight * s);
    sendCanvas.getContext("2d").drawImage(video, 0, 0, sendCanvas.width, sendCanvas.height);
    return sendCanvas.toDataURL("image/jpeg", 0.8);
  }

  // 2) Só quando há movimento: pergunta ao Roboflow se é uma pessoa
  async function askAI() {
    inFlight = true; lastAI = Date.now();
    setState("Verificando…", "busy");
    const dataUrl = frameToBase64();
    try {
      const resp = await fetch(cfg.PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`, apikey: cfg.SUPABASE_ANON_KEY },
        body: JSON.stringify({ image: dataUrl.split(",")[1], confidence: 0.5 }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);
      $("#calls-count").textContent = ++calls;
      if (data.count > 0) {
        drawBoxes(data.people, data.image?.width || SEND_W);
        triggerAlert(data.count, dataUrl);
      } else {
        setState("Monitorando", "ok");
        setStatus("Movimento detectado, mas não era uma pessoa. Alerta ignorado.");
      }
    } catch (e) {
      setState("Erro", "error");
      setStatus(`Não foi possível consultar a IA: ${e.message}`, "error");
    } finally {
      inFlight = false;
    }
  }

  function drawBoxes(people, srcW) {
    overlay.width = video.clientWidth; overlay.height = video.clientHeight;
    const k = overlay.width / srcW;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.strokeStyle = "#f85149"; octx.lineWidth = 3;
    people.forEach((p) => octx.strokeRect((p.x - p.width / 2) * k, (p.y - p.height / 2) * k, p.width * k, p.height * k));
    boxesUntil = Date.now() + 3000;
  }

  function beep() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.25, ac.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.2);
        o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.2);
      });
    } catch { /* sem áudio */ }
  }

  function triggerAlert(count, dataUrl) {
    const now = new Date();
    const time = now.toLocaleTimeString("pt-BR");
    const text = `${count} ${count === 1 ? "pessoa" : "pessoas"} às ${time}`;
    setState("Pessoa detectada", "alert");
    setStatus(`Alerta: ${text}.`, "error");
    if (Date.now() - lastAlert < ALERT_COOLDOWN_MS) return; // evita alertas repetidos em sequência
    lastAlert = Date.now();
    $("#alerts-count").textContent = ++alerts;
    $("#alert-text").textContent = text;
    $("#alert").hidden = false;
    clearTimeout(triggerAlert.t);
    triggerAlert.t = setTimeout(() => ($("#alert").hidden = true), 6000);
    if ($("#sound").checked) beep();
    if ($("#notify").checked && "Notification" in window && Notification.permission === "granted") {
      new Notification("Pessoa detectada", { body: text });
    }
    const log = $("#log");
    log.querySelector(".empty")?.remove();
    const li = document.createElement("li");
    li.innerHTML = `<img alt="Quadro do alerta" src="${dataUrl}"><div><b>${time}</b><span>${count} ${count === 1 ? "pessoa" : "pessoas"}</span></div>`;
    log.prepend(li);
    while (log.children.length > 10) log.lastChild.remove();
  }

  function tick() {
    if (!video.videoWidth) return;
    const level = motionLevel();
    $("#meter-bar").style.width = `${Math.min(100, (level / 0.15) * 100)}%`;
    if (Date.now() > boxesUntil) octx.clearRect(0, 0, overlay.width, overlay.height);
    const moving = level >= threshold();
    $("#meter-bar").dataset.active = moving;
    if (moving && !inFlight && Date.now() - lastAI > AI_COOLDOWN_MS) askAI();
    else if (!inFlight && $("#state").dataset.kind !== "alert") setState(moving ? "Movimento" : "Monitorando", "ok");
    if ($("#state").dataset.kind === "alert" && Date.now() - lastAlert > 4000 && !moving) setState("Monitorando", "ok");
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) return setStatus("Este navegador não permite acesso à câmera.", "error");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      return setStatus(e.name === "NotAllowedError" ? "Permissão da câmera negada. Libere o acesso no navegador." : `Câmera indisponível: ${e.message}`, "error");
    }
    video.srcObject = stream;
    await video.play();
    // A área do vídeo segue a proporção real da câmera (16:9 ou 4:3) para as caixas alinharem
    document.querySelector(".video-wrap").style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    prev = null;
    $("#placeholder").hidden = true;
    $("#live").hidden = false;
    $("#stop").hidden = false;
    setState("Monitorando", "ok");
    setStatus("Monitorando. Mantenha esta aba aberta e visível.", "ok");
    timer = setInterval(tick, 200); // 5 verificações por segundo
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* opcional */ }
  }

  function stop() {
    clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    wakeLock?.release?.(); wakeLock = null;
    video.srcObject = null;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    $("#placeholder").hidden = false;
    $("#live").hidden = true;
    $("#stop").hidden = true;
    $("#meter-bar").style.width = "0";
    setState("Parado");
    setStatus("Monitoramento parado.");
  }

  $("#start").addEventListener("click", start);
  $("#stop").addEventListener("click", stop);
  $("#sens").addEventListener("input", updateThresholdMarker);
  $("#notify").addEventListener("change", async (e) => {
    if (e.target.checked && "Notification" in window && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") e.target.checked = false;
    }
  });
  // Navegadores desaceleram abas em segundo plano: avisa o usuário
  document.addEventListener("visibilitychange", async () => {
    if (!stream) return;
    if (document.hidden) setStatus("Aba em segundo plano: a detecção pode ficar lenta.", "error");
    else {
      setStatus("Monitorando. Mantenha esta aba aberta e visível.", "ok");
      try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* opcional */ }
    }
  });
  updateThresholdMarker();
})();
