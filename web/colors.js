// Paleta de referência com nomes em português.
export const NAMED_COLORS = [
  ["Preto", "#000000"], ["Cinza escuro", "#404040"], ["Cinza", "#808080"],
  ["Cinza claro", "#C0C0C0"], ["Branco", "#FFFFFF"], ["Vermelho", "#E53935"],
  ["Vermelho escuro", "#8B0000"], ["Vinho", "#722F37"], ["Rosa", "#F48FB1"],
  ["Pink", "#E91E63"], ["Magenta", "#FF00FF"], ["Roxo", "#7B1FA2"],
  ["Lilás", "#C8A2C8"], ["Violeta", "#8F00FF"], ["Azul marinho", "#000080"],
  ["Azul", "#1E40FF"], ["Azul royal", "#4169E1"], ["Azul claro", "#87CEEB"],
  ["Ciano", "#00BCD4"], ["Turquesa", "#40E0D0"], ["Verde água", "#66CDAA"],
  ["Verde", "#2E9E44"], ["Verde escuro", "#006400"], ["Verde limão", "#9ACD32"],
  ["Verde oliva", "#808000"], ["Amarelo", "#FFEB3B"], ["Amarelo ouro", "#FFC107"],
  ["Mostarda", "#D4A017"], ["Laranja", "#FF8C00"], ["Coral", "#FF7F50"],
  ["Salmão", "#FA8072"], ["Pêssego", "#FFDAB9"], ["Bege", "#E8D9B5"],
  ["Creme", "#FFFDD0"], ["Caramelo", "#C68E17"], ["Marrom", "#795548"],
  ["Marrom escuro", "#4E342E"], ["Terracota", "#E2725B"], ["Dourado", "#D4AF37"],
  ["Prata", "#AAA9AD"],
];

export const rgbToHex = ([r, g, b]) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

export const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// RGB -> CIELAB para distância perceptual (mais próxima do olho humano).
function rgbToLab([r, g, b]) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const LAB_PALETTE = NAMED_COLORS.map(([name, hex]) => ({ name, hex, lab: rgbToLab(hexToRgb(hex)) }));

export function nearestColorName(rgb) {
  const lab = rgbToLab(rgb);
  let best = LAB_PALETTE[0];
  let bestD = Infinity;
  for (const c of LAB_PALETTE) {
    const d = (lab[0] - c.lab[0]) ** 2 + (lab[1] - c.lab[1]) ** 2 + (lab[2] - c.lab[2]) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best.name;
}

// K-means local, mesmo princípio do bloco Dominant Color do Roboflow.
export function extractPalette(imageData, k = 5, maxIter = 20) {
  const { data } = imageData;
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // ignora transparência
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!pixels.length) return [];
  k = Math.min(k, pixels.length);

  // Inicialização determinística espalhada pelos pixels
  let centroids = Array.from({ length: k }, (_, i) => pixels[Math.floor((i * pixels.length) / k)].slice());
  const assign = new Uint8Array(pixels.length);

  for (let it = 0; it < maxIter; it++) {
    for (let p = 0; p < pixels.length; p++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (pixels[p][0] - centroids[c][0]) ** 2 + (pixels[p][1] - centroids[c][1]) ** 2 + (pixels[p][2] - centroids[c][2]) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      assign[p] = best;
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let p = 0; p < pixels.length; p++) {
      const s = sums[assign[p]];
      s[0] += pixels[p][0]; s[1] += pixels[p][1]; s[2] += pixels[p][2]; s[3]++;
    }
    let moved = 0;
    centroids = centroids.map((c, i) => {
      const s = sums[i];
      if (!s[3]) return c;
      const n = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
      moved += Math.abs(n[0] - c[0]) + Math.abs(n[1] - c[1]) + Math.abs(n[2] - c[2]);
      return n;
    });
    if (moved < 1) break;
  }

  const counts = new Array(k).fill(0);
  for (const a of assign) counts[a]++;
  return centroids
    .map((c, i) => ({ rgb: c.map(Math.round), share: counts[i] / pixels.length }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share);
}
