/*
 * Lógica de detecção de queda e movimento brusco a partir de pontos do corpo (pose).
 * Funciona no navegador (window.FallDetector) e no Node (module.exports) para testes.
 *
 * Entrada por quadro: 33 pontos do MediaPipe Pose (x, y normalizados 0..1, y para baixo)
 * Saída: estado, eventos e métricas.
 *
 * Ideia central:
 *  - Escala: tudo é medido em "comprimentos de tronco" (ombro até quadril), então funciona
 *    com a pessoa perto ou longe da câmera.
 *  - Queda em duas fases: descida rápida + corpo deitado = SUSPEITA; continua no chão por
 *    alguns segundos = ALARME. Se levantar antes, cancela.
 *  - Movimento brusco: velocidade do centro do tronco (braços não contam).
 */
(function (root) {
  const P = { NOSE: 0, L_SH: 11, R_SH: 12, L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANK: 27, R_ANK: 28 };

  const DEFAULTS = {
    minVisibility: 0.5,
    smoothingMs: 90,      // suavização por tempo (independe da taxa de quadros)
    historyMs: 1500,
    speedWindowMs: 180,   // janela para medir velocidade
    fallSpeed: 2.2,       // velocidade de descida do quadril (troncos/s)
    fallDrop: 0.9,        // quanto o quadril desceu na janela de queda (troncos)
    fallWindowMs: 1000,
    tiltRise: 45,         // tronco girar este tanto (graus) dentro da janela também indica queda
    descentMemoryMs: 1200,// por quanto tempo uma descida rápida "conta" para a queda
    lyingAngle: 55,       // graus em relação à vertical para considerar deitado
    uprightAngle: 30,
    confirmMs: 4000,      // tempo no chão para confirmar a queda
    recoverMs: 1200,      // tempo em pé para cancelar a suspeita
    abruptSpeed: 4.5,     // velocidade do tronco para movimento brusco (troncos/s)
    abruptCooldownMs: 5000,
    longLieEnabled: false,
    longLieMs: 30000,
  };

  // Sensibilidade 1..5 ajusta os limites (5 = dispara mais fácil)
  const SENS = { 1: 1.4, 2: 1.2, 3: 1.0, 4: 0.85, 5: 0.7 };

  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  class FallDetector {
    constructor(options = {}) {
      this.setOptions(options);
      this.reset();
    }

    setOptions(options = {}) {
      this.opt = { ...DEFAULTS, ...this.opt, ...options };
      const k = SENS[this.opt.sensitivity || 3] || 1;
      this.lim = {
        fallSpeed: this.opt.fallSpeed * k,
        fallDrop: this.opt.fallDrop * k,
        abruptSpeed: this.opt.abruptSpeed * k,
      };
    }

    reset() {
      this.phase = "normal";       // normal | suspeita | alarme
      this.reason = null;
      this.history = [];
      this.smooth = null;
      this.lastT = undefined;
      this.lastDescentAt = -Infinity;
      this.lastAbruptAt = -Infinity;
      this.suspicionAt = 0;
      this.uprightSince = null;
      this.lyingSince = null;
      this.lostSince = null;
      this.posture = "ausente";
    }

    acknowledge() {
      this.phase = "normal";
      this.reason = null;
      this.lastDescentAt = -Infinity;
      this.lyingSince = null;
    }

    // Extrai ombros e quadril com visibilidade suficiente (aceita um lado só)
    _keypoints(lm) {
      if (!lm || lm.length < 29) return null;
      const ok = (i) => lm[i] && (lm[i].visibility === undefined || lm[i].visibility >= this.opt.minVisibility);
      const pick = (a, b) => (ok(a) && ok(b) ? mid(lm[a], lm[b]) : ok(a) ? lm[a] : ok(b) ? lm[b] : null);
      const sh = pick(P.L_SH, P.R_SH);
      const hip = pick(P.L_HIP, P.R_HIP);
      if (!sh || !hip) return null;
      const ys = [P.NOSE, P.L_SH, P.R_SH, P.L_HIP, P.R_HIP, P.L_KNEE, P.R_KNEE, P.L_ANK, P.R_ANK]
        .filter(ok).map((i) => lm[i].y);
      const legs = [P.L_KNEE, P.R_KNEE, P.L_ANK, P.R_ANK].some(ok);
      return { sh, hip, legs, minY: Math.min(...ys), maxY: Math.max(...ys) };
    }

    update(landmarks, t) {
      const events = [];
      const kp = this._keypoints(landmarks);

      // Pessoa fora do quadro (ou não reconhecida)
      if (!kp) {
        if (this.lostSince === null) this.lostSince = t;
        this.posture = "ausente";
        // Sumiu logo após uma descida rápida: pode ter caído para fora da imagem
        if (this.phase === "normal" && t - this.lastDescentAt < this.opt.descentMemoryMs) {
          this.phase = "suspeita"; this.reason = "saiu_do_quadro"; this.suspicionAt = t;
          events.push({ type: "possivel_queda", reason: this.reason, t });
        }
        if (this.phase === "suspeita" && t - this.suspicionAt >= this.opt.confirmMs) {
          this.phase = "alarme";
          events.push({ type: "queda_confirmada", reason: this.reason, t });
        }
        return this._out(events, null);
      }
      this.lostSince = null;

      // Suavização por tempo: com poucos quadros/s, cada quadro pesa mais
      const dtMs = this.lastT !== undefined ? Math.max(1, t - this.lastT) : 0;
      this.lastT = t;
      const a = this.smooth ? Math.exp(-dtMs / this.opt.smoothingMs) : 0;
      const torsoRaw = dist(kp.sh, kp.hip);
      if (torsoRaw < 0.02) return this._out(events, null);
      const s = this.smooth || { sh: kp.sh, hip: kp.hip, torso: torsoRaw };
      this.smooth = {
        sh: { x: s.sh.x * a + kp.sh.x * (1 - a), y: s.sh.y * a + kp.sh.y * (1 - a) },
        hip: { x: s.hip.x * a + kp.hip.x * (1 - a), y: s.hip.y * a + kp.hip.y * (1 - a) },
        // o tamanho do tronco muda devagar (evita que a escala "pule" quando a pessoa gira)
        torso: s.torso * 0.9 + torsoRaw * 0.1,
      };
      const { sh, hip, torso } = this.smooth;

      // Inclinação do tronco em relação à vertical (0 = em pé, 90 = deitado)
      const angle = (Math.atan2(Math.abs(sh.x - hip.x), Math.abs(hip.y - sh.y)) * 180) / Math.PI;
      // Altura do corpo em troncos (em pé ~3, sentado ~2, deitado < 1,3)
      const extent = (kp.maxY - kp.minY) / torso;
      const center = mid(sh, hip);

      this.history.push({ t, hipY: hip.y, cx: center.x, cy: center.y, angle });
      while (this.history.length && t - this.history[0].t > this.opt.historyMs) this.history.shift();

      // Velocidades medidas contra um ponto ~180 ms atrás
      let ref = null;
      for (let i = this.history.length - 1; i >= 0; i--) {
        if (t - this.history[i].t >= this.opt.speedWindowMs) { ref = this.history[i]; break; }
      }
      let descentSpeed = 0, centerSpeed = 0;
      if (ref) {
        const dt = (t - ref.t) / 1000;
        descentSpeed = (hip.y - ref.hipY) / dt / torso;                       // + = descendo
        centerSpeed = Math.hypot(center.x - ref.cx, center.y - ref.cy) / dt / torso;
      }
      // Queda medida do ponto mais alto da janela até agora (robusto a poucos quadros/s)
      let minHip = hip.y, minHipT = t, minAngle = angle;
      for (const h of this.history) {
        if (t - h.t > this.opt.fallWindowMs) continue;
        if (h.hipY < minHip) { minHip = h.hipY; minHipT = h.t; }
        minAngle = Math.min(minAngle, h.angle);
      }
      const drop = (hip.y - minHip) / torso;
      const dropRate = t > minHipT ? drop / ((t - minHipT) / 1000) : 0;   // troncos/s ao longo da queda
      const tiltRise = angle - minAngle;

      // Postura
      let posture = "abaixado";
      if (angle >= this.opt.lyingAngle || (extent < 1.2 && angle >= 35)) posture = "deitado";
      // Sem pernas visíveis (webcam de mesa), vale o ângulo do tronco
      else if (angle <= this.opt.uprightAngle && (!kp.legs || extent >= 1.8)) posture = "em_pe";
      this.posture = posture;
      this.lyingSince = posture === "deitado" ? (this.lyingSince ?? t) : null;
      this.uprightSince = posture === "em_pe" ? (this.uprightSince ?? t) : null;

      // 1) Descida rápida do quadril
      const fastDrop = Math.max(descentSpeed, dropRate) >= this.lim.fallSpeed && drop >= this.lim.fallDrop;
      const fastTilt = tiltRise >= this.opt.tiltRise && drop >= this.lim.fallDrop * 0.5;
      if (fastDrop || fastTilt) this.lastDescentAt = t;

      // 2) Suspeita: houve descida rápida há pouco E agora está deitado (ou caiu muito)
      if (this.phase === "normal" && t - this.lastDescentAt <= this.opt.descentMemoryMs &&
          (posture === "deitado" || (posture === "abaixado" && drop >= this.lim.fallDrop * 1.5))) {
        this.phase = "suspeita"; this.reason = "queda"; this.suspicionAt = t;
        events.push({ type: "possivel_queda", reason: this.reason, t });
      }

      // 3) Confirmação ou recuperação
      if (this.phase === "suspeita") {
        if (this.uprightSince !== null && t - this.uprightSince >= this.opt.recoverMs) {
          this.phase = "normal"; this.lastDescentAt = -Infinity;
          events.push({ type: "recuperou", reason: this.reason, t });
          this.reason = null;
        } else if (t - this.suspicionAt >= this.opt.confirmMs) {
          this.phase = "alarme";
          events.push({ type: "queda_confirmada", reason: this.reason, t });
        }
      }

      // 4) Deitado imóvel por muito tempo (opcional: desmaio lento)
      if (this.opt.longLieEnabled && this.phase === "normal" && this.lyingSince !== null &&
          t - this.lyingSince >= this.opt.longLieMs) {
        this.phase = "alarme"; this.reason = "deitado_muito_tempo";
        events.push({ type: "queda_confirmada", reason: this.reason, t });
      }

      // 5) Movimento brusco do tronco (fora de uma queda).
      //    Descida rápida não conta aqui: ela é tratada como possível queda.
      const fallingNow = descentSpeed >= this.lim.fallSpeed * 0.8 || t - this.lastDescentAt < 300;
      if (this.opt.abruptEnabled !== false && this.phase === "normal" && !fallingNow &&
          centerSpeed >= this.lim.abruptSpeed && t - this.lastAbruptAt >= this.opt.abruptCooldownMs) {
        this.lastAbruptAt = t;
        events.push({ type: "movimento_brusco", speed: centerSpeed, t });
      }

      return this._out(events, { angle, extent, descentSpeed, dropRate, tiltRise, centerSpeed, drop, torso });
    }

    _out(events, metrics) {
      return { phase: this.phase, reason: this.reason, posture: this.posture, events, metrics };
    }
  }

  FallDetector.POINTS = P;
  if (typeof module !== "undefined" && module.exports) module.exports = { FallDetector };
  else root.FallDetector = FallDetector;
})(typeof window !== "undefined" ? window : globalThis);
