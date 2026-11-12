// Cena do armazém fictício: estantes porta-paletes, ruas numeradas, áreas de recebimento e expedição.
// Tudo é gerado por código (sem modelos externos) e desenhado em lote (InstancedMesh) para ficar leve.
import * as THREE from "three";

export const LAYOUT = {
  rows: 13,          // estantes (fileiras de porta-paletes)
  bays: 14,          // módulos por estante
  levels: 6,         // níveis por módulo
  bayLen: 2.8,       // comprimento de um módulo (m)
  rackDepth: 2.5,    // estante dupla, costas com costas (m)
  aisle: 3.2,        // largura da rua (m)
  levelH: 1.7,       // altura de cada nível (m)
};

// Pseudoaleatório determinístico: a ocupação é sempre a mesma a cada abertura
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

function labelTexture(text, { bg = "#f5c518", fg = "#111", w = 256, h = 256, font = 150, radius = 18 } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, radius); g.fill();
  g.lineWidth = 10; g.strokeStyle = "#111"; g.stroke();
  g.fillStyle = fg; g.font = `800 ${font}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 6);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Placa flutuante: a largura acompanha o texto (nada fica cortado)
function signSprite(text, color = "#1f6feb", height = 3.2) {
  const font = "700 64px system-ui, sans-serif";
  const probe = document.createElement("canvas").getContext("2d"); probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 80, h = 128;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(255,255,255,.94)"; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 24); g.fill();
  g.fillStyle = color; g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set((height * w) / h, height, 1); s.renderOrder = 10;
  return s;
}

export function buildWarehouse(scene) {
  const L = LAYOUT, rand = rng(42);
  const pitch = L.rackDepth + L.aisle;
  const width = L.rows * L.rackDepth + (L.rows - 1) * L.aisle;
  const length = L.bays * L.bayLen;
  const x0 = -width / 2 + L.rackDepth / 2;          // centro da primeira estante
  const z0 = -length / 2;                            // fundo das estantes
  const rowX = (r) => x0 + r * pitch;

  // Piso, faixas e paredes baixas
  const floorW = width + 30, floorD = length + 46;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorD), new THREE.MeshLambertMaterial({ color: 0xd9dde3 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = 8; scene.add(floor);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2c200 });
  const addLine = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); scene.add(m); };
  for (let a = 0; a < L.rows - 1; a++) { // bordas de cada rua
    const cx = rowX(a) + pitch / 2;
    addLine(cx - L.aisle / 2 + 0.15, 0, 0.12, length);
    addLine(cx + L.aisle / 2 - 0.15, 0, 0.12, length);
  }
  addLine(0, length / 2 + 2.5, width + 6, 0.25);   // faixa de corredor principal
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xbfc6cf });
  const back = new THREE.Mesh(new THREE.BoxGeometry(floorW, 6, 0.4), wallMat); back.position.set(0, 3, 8 - floorD / 2); scene.add(back);

  // Estantes: colunas (azul), longarinas (laranja) e paletes com caixas (papelão)
  const upGeo = new THREE.BoxGeometry(0.12, L.levels * L.levelH + 0.6, 0.12);
  const beamGeo = new THREE.BoxGeometry(0.1, 0.14, L.bayLen);
  const boxGeo = new THREE.BoxGeometry(L.rackDepth * 0.44, L.levelH * 0.72, L.bayLen * 0.42);
  const upCount = L.rows * (L.bays + 1) * 2, beamCount = L.rows * L.bays * L.levels * 2;
  const ups = new THREE.InstancedMesh(upGeo, new THREE.MeshLambertMaterial({ color: 0x2f5fa8 }), upCount);
  const beams = new THREE.InstancedMesh(beamGeo, new THREE.MeshLambertMaterial({ color: 0xe8742a }), beamCount);
  const boxes = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), L.rows * L.bays * L.levels * 4);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  let iu = 0, ib = 0, ix = 0;
  const occupancy = [];   // [row][bay] -> paletes ocupados no módulo
  const levelOcc = [];    // [row][bay][level] -> paletes ocupados no nível (0 a 4)
  for (let r = 0; r < L.rows; r++) {
    occupancy.push([]); levelOcc.push([]);
    const x = rowX(r);
    for (let b = 0; b <= L.bays; b++) for (const dx of [-L.rackDepth / 2, L.rackDepth / 2]) {
      m.makeTranslation(x + dx, (L.levels * L.levelH + 0.6) / 2, z0 + b * L.bayLen); ups.setMatrixAt(iu++, m);
    }
    for (let b = 0; b < L.bays; b++) {
      let occ = 0;
      const perLevel = [];
      for (let l = 0; l < L.levels; l++) {
        let lv = 0;
        const y = 0.35 + l * L.levelH;
        for (const dx of [-L.rackDepth / 2, L.rackDepth / 2]) { m.makeTranslation(x + dx, y, z0 + (b + 0.5) * L.bayLen); beams.setMatrixAt(ib++, m); }
        for (const dz of [-0.24, 0.24]) for (const sx of [-0.25, 0.25]) { // 2 paletes por nível de cada lado
          if (rand() < 0.86) {
            occ++; lv++;
            m.makeTranslation(x + sx * L.rackDepth, y + 0.1 + (L.levelH * 0.72) / 2, z0 + (b + 0.5 + dz) * L.bayLen);
            boxes.setMatrixAt(ix, m);
            col.setHSL(0.08 + rand() * 0.03, 0.55 + rand() * 0.15, 0.5 + rand() * 0.12);
            boxes.setColorAt(ix++, col);
          }
        }
        perLevel.push(lv);
      }
      occupancy[r].push(occ); levelOcc[r].push(perLevel);
    }
  }
  boxes.count = ix;
  [ups, beams, boxes].forEach((im) => { im.instanceMatrix.needsUpdate = true; scene.add(im); });
  if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;

  // Placas de rua no chão (amarelas, numeradas), na entrada de cada rua
  for (let a = 0; a < L.rows - 1; a++) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: labelTexture(String(a + 1).padStart(2, "0")) }));
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(rowX(a) + pitch / 2, 0.04, length / 2 + 1.4);
    scene.add(plate);
  }

  // Área de expedição (frente) e recebimento (lateral), com paletes no chão e docas
  const palletMat = new THREE.MeshLambertMaterial({ color: 0xc9873f });
  const floorPallet = new THREE.BoxGeometry(1.2, 1.1, 1.0);
  for (let i = 0; i < 18; i++) {
    const p = new THREE.Mesh(floorPallet, palletMat);
    p.position.set(-width / 2 + 4 + (i % 9) * 3.2, 0.55, length / 2 + 8 + Math.floor(i / 9) * 2.2);
    scene.add(p);
  }
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x6b7480 });
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(3, 3.6, 0.3), dockMat);
    d.position.set(-width / 2 + 6 + i * 6, 1.8, 8 + floorD / 2 - 0.2);
    scene.add(d);
  }
  const sArm = signSprite("Armazenagem · 12 ruas"); sArm.position.set(0, L.levels * L.levelH + 4, z0 + 4); scene.add(sArm);
  const sExp = signSprite("Expedição · docas 1 a 6", "#1a7f37"); sExp.position.set(-width / 4, 5, length / 2 + 14); scene.add(sExp);
  const sRec = signSprite("Recebimento", "#9a6700"); sRec.position.set(width / 4, 5, length / 2 + 14); scene.add(sRec);

  // Caixas de clique por módulo (invisíveis): o raio da câmera acerta o módulo da estante
  const hitGeo = new THREE.BoxGeometry(L.rackDepth + 0.4, L.levels * L.levelH, L.bayLen);
  const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const hits = new THREE.InstancedMesh(hitGeo, hitMat, L.rows * L.bays);
  const bayData = [];
  let ih = 0;
  for (let r = 0; r < L.rows; r++) for (let b = 0; b < L.bays; b++) {
    m.makeTranslation(rowX(r), (L.levels * L.levelH) / 2, z0 + (b + 0.5) * L.bayLen);
    hits.setMatrixAt(ih, m);
    bayData.push({
      id: `E${String(r + 1).padStart(2, "0")}-M${String(b + 1).padStart(2, "0")}`,
      estante: r + 1, modulo: b + 1, niveis: L.levels, ocupados: occupancy[r][b], posicoes: L.levels * 4, porNivel: levelOcc[r][b],
      center: new THREE.Vector3(rowX(r), (L.levels * L.levelH) / 2, z0 + (b + 0.5) * L.bayLen),
    });
    ih++;
  }
  hits.instanceMatrix.needsUpdate = true;
  scene.add(hits);

  // Destaques: módulo sob o cursor (azul translúcido), módulo selecionado (ciano) e nível clicado (amarelo)
  const boxGeoHi = new THREE.BoxGeometry(L.rackDepth + 0.5, L.levels * L.levelH + 0.4, L.bayLen + 0.1);
  const edges = new THREE.EdgesGeometry(boxGeoHi);
  const mkHi = (color, fill) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(boxGeoHi, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fill, depthWrite: false })));
    g.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color })));
    g.visible = false; scene.add(g); return g;
  };
  const hoverBox = mkHi(0x2f9bff, 0.16), selBox = mkHi(0x00d4ff, 0.22);
  const levelGeo = new THREE.BoxGeometry(L.rackDepth + 0.7, L.levelH, L.bayLen + 0.3);
  const levelBox = new THREE.Group();
  levelBox.add(new THREE.Mesh(levelGeo, new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.35, depthWrite: false })));
  levelBox.add(new THREE.LineSegments(new THREE.EdgesGeometry(levelGeo), new THREE.LineBasicMaterial({ color: 0xffb000 })));
  levelBox.visible = false; scene.add(levelBox);
  const place = (box, i) => { if (i == null) { box.visible = false; return; } box.position.copy(bayData[i].center); box.visible = true; };

  // Marcador 📍 do local clicado: alfinete + etiqueta com o endereço
  const pin = new THREE.Group();
  const pinMat = new THREE.MeshLambertMaterial({ color: 0xe5484d, emissive: 0x5a0d10 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), pinMat); head.position.y = 3.2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 20), pinMat); tip.rotation.x = Math.PI; tip.position.y = 1.6;
  pin.add(head, tip); pin.visible = false; scene.add(pin);
  let pinLabel = null;
  function setPin(pos, text) {
    if (!pos) { pin.visible = false; if (pinLabel) pinLabel.visible = false; return; }
    pin.position.copy(pos); pin.visible = true;
    if (pinLabel) { scene.remove(pinLabel); pinLabel.material.map.dispose(); pinLabel.material.dispose(); }
    pinLabel = signSprite(text, "#b42318", 2.2);
    pinLabel.position.copy(pos).add(new THREE.Vector3(0, 5.6, 0));
    scene.add(pinLabel);
  }

  // Traduz o ponto clicado em endereço do armazém
  const pad = (n) => String(n).padStart(2, "0");
  const aisleCenter = (a) => rowX(a - 1) + pitch / 2;         // rua a (1..12) fica entre as estantes a e a+1
  const moduleAtZ = (z) => Math.min(L.bays, Math.max(1, Math.floor((z - z0) / L.bayLen) + 1));
  // normal: direção da face atingida. Topo da estante (apontando de cima) = módulo inteiro; frente = nível exato.
  function locate(point, bayIndex = null, normal = null) {
    if (bayIndex != null) {
      const d = bayData[bayIndex];
      const fromTop = normal && normal.y > 0.7;
      // rua de acesso: o lado da estante em que o ponto está (a primeira e a última só têm um lado)
      let rua = point.x < d.center.x ? d.estante - 1 : d.estante;
      rua = Math.min(L.rows - 1, Math.max(1, rua));
      const modulo = `Módulo inteiro: ${d.ocupados} de ${d.posicoes} paletes (${Math.round((d.ocupados / d.posicoes) * 100)}%)`;
      const pinAt = new THREE.Vector3(d.center.x, L.levels * L.levelH + 0.6, d.center.z);
      const base = `Rua ${pad(rua)} · Estante ${pad(d.estante)} · Módulo ${pad(d.modulo)}`;
      if (fromTop) {
        return {
          kind: "modulo", bayIndex, nivel: null, rua, code: `R${pad(rua)}-E${pad(d.estante)}-M${pad(d.modulo)}`,
          title: base, short: `Estante ${pad(d.estante)} · Módulo ${pad(d.modulo)}`,
          lines: [modulo, `Por nível (1 a ${L.levels}): ${d.porNivel.join(" · ")} paletes`, "Aproxime e clique na frente da estante para ver um nível"],
          pos: new THREE.Vector3(d.center.x, (L.levels * L.levelH) / 2, d.center.z), pinAt,
        };
      }
      const nivel = Math.min(L.levels, Math.max(1, Math.floor((point.y - 0.35) / L.levelH) + 1));
      const pos = new THREE.Vector3(d.center.x, 0.35 + (nivel - 1) * L.levelH + L.levelH / 2, d.center.z);
      return {
        kind: "modulo", bayIndex, nivel, rua, code: `R${pad(rua)}-E${pad(d.estante)}-M${pad(d.modulo)}-N${nivel}`,
        title: `${base} · Nível ${nivel}`, short: `Estante ${pad(d.estante)} · Módulo ${pad(d.modulo)} · Nível ${nivel}`,
        lines: [`Nível ${nivel}: ${d.porNivel[nivel - 1]} de 4 paletes`, modulo],
        pos, pinAt,
      };
    }
    const { x, z } = point;
    const inStorageX = x > -width / 2 - 1 && x < width / 2 + 1;
    if (inStorageX && z >= z0 && z <= -z0) {
      // entre estantes: qual rua?
      for (let a = 1; a <= L.rows - 1; a++) {
        if (Math.abs(x - aisleCenter(a)) <= L.aisle / 2 + 0.2) {
          const mod = moduleAtZ(z);
          return { kind: "rua", rua: a, code: `R${pad(a)}-M${pad(mod)}`, title: `Rua ${pad(a)} (corredor)`, lines: [`Em frente ao módulo ${pad(mod)}`, `Entre as estantes ${pad(a)} e ${pad(a + 1)}`], pos: new THREE.Vector3(aisleCenter(a), 0, z), pinAt: new THREE.Vector3(aisleCenter(a), 0, z) };
        }
      }
    }
    if (z > -z0 && z <= -z0 + 6) {
      let best = 1, bd = Infinity;
      for (let a = 1; a <= L.rows - 1; a++) { const d = Math.abs(x - aisleCenter(a)); if (d < bd) { bd = d; best = a; } }
      return { kind: "area", code: `CP-R${pad(best)}`, title: "Corredor principal", lines: [`Em frente à rua ${pad(best)}`], pos: new THREE.Vector3(x, 0, z), pinAt: new THREE.Vector3(x, 0, z) };
    }
    if (z > -z0 + 6) {
      if (x < 0) {
        const doca = Math.min(6, Math.max(1, Math.round((x - (-width / 2 + 6)) / 6) + 1));
        return { kind: "area", code: `EXP-D${doca}`, title: "Expedição", lines: [`Próximo à doca ${doca}`, "Separação e carregamento"], pos: new THREE.Vector3(x, 0, z), pinAt: new THREE.Vector3(x, 0, z) };
      }
      return { kind: "area", code: "REC", title: "Recebimento", lines: ["Conferência e entrada de mercadorias"], pos: new THREE.Vector3(x, 0, z), pinAt: new THREE.Vector3(x, 0, z) };
    }
    return { kind: "area", code: "ARM", title: "Área do armazém", lines: ["Fora das ruas de armazenagem"], pos: new THREE.Vector3(x, 0, z), pinAt: new THREE.Vector3(x, 0, z) };
  }

  return {
    hits, bayData, floor,
    size: { width, length },
    setHover: (i) => place(hoverBox, i),
    setSelected: (i) => place(selBox, i),
    setLevel: (loc) => {
      if (!loc || loc.kind !== "modulo" || !loc.nivel) { levelBox.visible = false; return; }
      levelBox.position.copy(loc.pos); levelBox.visible = true;
    },
    setPin, locate,
  };
}
