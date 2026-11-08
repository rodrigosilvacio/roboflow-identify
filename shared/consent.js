/*
 * Consentimento antes de usar câmera ou imagens (componente compartilhado pelos projetos).
 *
 * Uso na página (ao carregar):
 *   Consent.gate({ id: "detector-queda", title: "...", items: ["...", "..."] });
 *   - Mostra um aviso por cima da página e bloqueia a interação até a pessoa decidir.
 *   - "Concordo": libera a página e lembra a decisão até fechar a aba (sessionStorage).
 *   - "Não concordo": a página continua bloqueada e nada é coletado.
 *
 * Uso por ação (ex.: totem, a cada cliente):
 *   const ok = await Consent.ask({ title: "...", items: [...], accept: "...", decline: "..." });
 */
(function () {
  const PREFIX = "consent:";
  const memory = {
    get(id) { try { return sessionStorage.getItem(PREFIX + id); } catch { return null; } },
    set(id, v) { try { sessionStorage.setItem(PREFIX + id, v); } catch { /* modo privado */ } },
    clear(id) { try { sessionStorage.removeItem(PREFIX + id); } catch { /* modo privado */ } },
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Bloqueia colar e arrastar imagens enquanto não houver consentimento (eles não passam pelo "inert")
  let blocking = false;
  const blocker = (e) => { if (blocking) { e.preventDefault(); e.stopImmediatePropagation(); } };
  ["paste", "drop", "dragover"].forEach((t) => window.addEventListener(t, blocker, true));

  function setInert(on) {
    document.querySelectorAll("body > :not(.consent-overlay)").forEach((el) => {
      if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert");
    });
  }

  function dialog({ title, items = [], accept = "Concordo e quero continuar", decline = "Não concordo", note }) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "consent-overlay";
      overlay.innerHTML = `
        <div class="consent-box" role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-body">
          <p class="consent-tag">MVP de visão computacional</p>
          <h2 id="consent-title">${esc(title)}</h2>
          <div id="consent-body">
            <ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
            <p class="consent-note">${esc(note || "Este é um protótipo para demonstração. Você pode desistir a qualquer momento fechando a página.")}</p>
          </div>
          <div class="consent-actions">
            <button type="button" class="consent-accept">${esc(accept)}</button>
            <button type="button" class="consent-decline">${esc(decline)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      blocking = true;
      setInert(true);
      const acceptBtn = overlay.querySelector(".consent-accept");
      acceptBtn.focus();
      const close = (value) => {
        overlay.remove();
        blocking = false;
        setInert(false);
        resolve(value);
      };
      acceptBtn.addEventListener("click", () => close(true));
      overlay.querySelector(".consent-decline").addEventListener("click", () => close(false));
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Escape") close(null); // fechar sem decidir
        if (e.key === "Tab") { // mantém o foco dentro do aviso
          const f = [...overlay.querySelectorAll("button")];
          const i = f.indexOf(document.activeElement);
          e.preventDefault();
          f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
        }
      });
    });
  }

  function declinedScreen(opts) {
    const overlay = document.createElement("div");
    overlay.className = "consent-overlay";
    overlay.innerHTML = `
      <div class="consent-box" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <p class="consent-tag">Tudo bem</p>
        <h2 id="consent-title">Nada foi coletado</h2>
        <p>Sem o seu consentimento, a câmera não é ligada e nenhuma imagem é processada.</p>
        <div class="consent-actions">
          <button type="button" class="consent-accept">Rever e permitir</button>
          <a class="consent-link" href="../">Ver outros projetos</a>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    blocking = true;
    setInert(true);
    const btn = overlay.querySelector(".consent-accept");
    btn.focus();
    btn.addEventListener("click", () => { overlay.remove(); gate(opts); });
  }

  // Link discreto para revogar o consentimento a qualquer momento
  function addRevokeLink(id, opts) {
    if (document.querySelector(".consent-revoke")) return;
    const a = document.createElement("button");
    a.type = "button";
    a.className = "consent-revoke";
    a.textContent = "🔒 Privacidade";
    a.title = "Rever ou revogar o consentimento";
    a.addEventListener("click", async () => {
      const keep = await dialog({
        title: "Seu consentimento",
        items: [...(opts.items || []), "Você permitiu o uso nesta aba. Pode revogar agora: a página recarrega e a câmera é desligada."],
        accept: "Manter permissão",
        decline: "Revogar",
      });
      if (keep === false) { memory.clear(id); location.reload(); } // Esc mantém como está
    });
    document.body.appendChild(a);
  }

  async function gate(opts) {
    const { id } = opts;
    if (memory.get(id) === "sim") { addRevokeLink(id, opts); return true; }
    const ok = await dialog(opts);
    if (ok) {
      memory.set(id, "sim");
      addRevokeLink(id, opts);
      document.dispatchEvent(new CustomEvent("consent:granted", { detail: { id } }));
      return true;
    }
    declinedScreen(opts);
    return false;
  }

  window.Consent = {
    gate,
    ask: dialog,
    granted: (id) => memory.get(id) === "sim",
  };
})();
