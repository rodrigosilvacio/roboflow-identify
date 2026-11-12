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
  const occupancy = []; // [row][bay] -> paletes ocupados
  for (let r = 0; r < L.rows; r++) {
    occupancy.push([]);
    const x = rowX(r);
    for (let b = 0; b <= L.bays; b++) for (const dx of [-L.rackDepth / 2, L.rackDepth / 2]) {
      m.makeTranslation(x + dx, (L.levels * L.levelH + 0.6) / 2, z0 + b * L.bayLen); ups.setMatrixAt(iu++, m);
    }
    for (let b = 0; b < L.bays; b++) {
      let occ = 0;
      for (let l = 0; l < L.levels; l++) {
        const y = 0.35 + l * L.levelH;
        for (const dx of [-L.rackDepth / 2, L.rackDepth / 2]) { m.makeTranslation(x + dx, y, z0 + (b + 0.5) * L.bayLen); beams.setMatrixAt(ib++, m); }
        for (const dz of [-0.24, 0.24]) for (const sx of [-0.25, 0.25]) { // 2 paletes por nível de cada lado
          if (rand() < 0.86) {
            occ++;
            m.makeTranslation(x + sx * L.rackDepth, y + 0.1 + (L.levelH * 0.72) / 2, z0 + (b + 0.5 + dz) * L.bayLen);
            boxes.setMatrixAt(ix, m);
            col.setHSL(0.08 + rand() * 0.03, 0.55 + rand() * 0.15, 0.5 + rand() * 0.12);
            boxes.setColorAt(ix++, col);
          }
        }
      }
      occupancy[r].push(occ);
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
      estante: r + 1, modulo: b + 1, niveis: L.levels, ocupados: occupancy[r][b], posicoes: L.levels * 4,
      center: new THREE.Vector3(rowX(r), (L.levels * L.levelH) / 2, z0 + (b + 0.5) * L.bayLen),
    });
    ih++;
  }
  hits.instanceMatrix.needsUpdate = true;
  scene.add(hits);

  // Destaques: módulo sob o cursor (claro) e módulo selecionado (ciano)
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(L.rackDepth + 0.5, L.levels * L.levelH + 0.4, L.bayLen + 0.1));
  const hoverBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  const selBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00d4ff }));
  hoverBox.visible = selBox.visible = false;
  scene.add(hoverBox, selBox);
  const place = (box, i) => { if (i == null) { box.visible = false; return; } box.position.copy(bayData[i].center); box.visible = true; };

  return {
    hits, bayData,
    size: { width, length },
    setHover: (i) => place(hoverBox, i),
    setSelected: (i) => place(selBox, i),
  };
}
