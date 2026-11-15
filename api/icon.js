import zlib from 'node:zlib';

// App-Icon (Geschenk unter dem Stern) – wird beim ersten Aufruf pro Größe selbst gezeichnet und als PNG ausgeliefert.
const rr = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const ell = (cx, cy, rx, ry, rot = 0) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (x, y) => { const dx = x - cx, dy = y - cy; return ((dx * c + dy * s) / rx) ** 2 + ((-dx * s + dy * c) / ry) ** 2 <= 1; };
};
const poly = (pts) => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const DOTS = [[70, 90, 4, .7], [150, 50, 3, .5], [420, 80, 5, .7], [460, 190, 3, .5], [60, 260, 3, .5], [450, 330, 4, .6], [100, 430, 4, .5], [400, 440, 3, .5], [330, 40, 3, .6], [40, 170, 3, .5]];
const BOW = [ell(205, 222, 44, 17, -0.33), ell(307, 222, 44, 17, 0.33)];
const GIFT = [
  [ell(256, 408, 112, 14), '#000000', 0.28],
  [rr(156, 270, 356, 402, 14), '#d6473a', 1],
  [rr(144, 242, 368, 288, 14), '#e8584a', 1],
  [rect(236, 242, 276, 402), '#f0cf8a', 1],
  ...BOW.map((f) => [f, '#f0cf8a', 1]),
  [ell(256, 236, 17, 17), '#c99a4a', 1],
];
const COLOR = [
  [rect(0, 0, 512, 512), '#143d31', 1],
  ...DOTS.map(([x, y, r, a]) => [ell(x, y, r, r), '#ffffff', a]),
  [poly([[256, 52], [266, 86], [300, 96], [266, 106], [256, 140], [246, 106], [212, 96], [246, 86]]), '#f0cf8a', 1],
  ...GIFT,
];
// Einfarbige Silhouette (für das kleine Symbol in der Statusleiste): Box + Schleife, Band ausgespart
const MONO = [
  [rr(156, 270, 356, 402, 14), '#ffffff', 1],
  [rr(144, 242, 368, 288, 14), '#ffffff', 1],
  ...BOW.map((f) => [f, '#ffffff', 1]),
  [ell(256, 236, 17, 17), '#ffffff', 1],
];
const MONO_CUT = rect(240, 290, 272, 402);

const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(size, w, h, rgba, alpha) {
  const ch = alpha ? 4 : 3;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    for (let x = 0; x < w; x++) for (let k = 0; k < ch; k++) raw[y * (w * ch + 1) + 1 + x * ch + k] = rgba[(y * w + x) * 4 + k];
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- Liquid-Glass-Look (Farb-Icon): halbtransparente, brechende Glasformen über leuchtendem Hintergrund ----
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
function blur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let pass = 0; pass < 2; pass++) {
    const from = pass ? out : src;
    for (let y = 0; y < h; y++) { // horizontal
      let acc = 0; const row = y * w;
      for (let x = -r; x <= r; x++) acc += from[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) { tmp[row + x] = acc / (2 * r + 1); acc += from[row + Math.min(w - 1, x + r + 1)] - from[row + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) { // vertical
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) { out[y * w + x] = acc / (2 * r + 1); acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
    }
  }
  return out;
}
const GLASS = [
  [rr(156, 270, 356, 402, 22), '#ff5a4a', 0.62],
  [rr(144, 242, 368, 288, 18), '#ff7a66', 0.66],
  [rect(236, 242, 276, 402), '#ffe2a0', 0.72],
  ...BOW.map((f) => [f, '#ffe2a0', 0.74]),
  [ell(256, 236, 17, 17), '#ffd27a', 0.8],
  [poly([[256, 46], [268, 84], [306, 96], [268, 108], [256, 146], [244, 108], [206, 96], [244, 84]]), '#ffe9b0', 0.78],
];
const PANE = rr(40, 40, 472, 472, 120);
function bgAt(x, y) {
  const t = y / 512;
  let r = mix(10, 22, t), g = mix(52, 86, t), b = mix(40, 64, t);
  const glow = (cx, cy, rad, cr, cg, cb, k) => { const d = Math.hypot(x - cx, y - cy) / rad; const f = Math.max(0, 1 - d); const w = f * f * k; r = mix(r, cr, w); g = mix(g, cg, w); b = mix(b, cb, w); };
  glow(256, 110, 190, 255, 214, 130, 0.85);
  glow(256, 390, 200, 230, 70, 60, 0.7);
  glow(60, 440, 190, 40, 190, 140, 0.55);
  glow(450, 60, 180, 120, 200, 255, 0.35);
  for (const [dx, dy, rd, al] of DOTS) { const d = Math.hypot(x - dx, y - dy); if (d < rd + 1) { const w = al * clamp(rd + 1 - d); r = mix(r, 255, w); g = mix(g, 255, w); b = mix(b, 255, w); } }
  return [r, g, b];
}
function renderGlass(size) {
  const S = 2, R = size * S, k = 512 / R;
  const col = new Float32Array(R * R * 3), alp = new Float32Array(R * R), pane = new Float32Array(R * R), tint = GLASS.map(([f, c, a]) => [f, hex(c), a]);
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const X = (x + .5) * k, Y = (y + .5) * k, i = y * R + x;
    if (PANE(X, Y)) pane[i] = 1;
    let cr = 0, cg = 0, cb = 0, ca = 0;
    for (const [f, c, al] of tint) if (f(X, Y)) { cr = cr * (1 - al) + c[0] * al; cg = cg * (1 - al) + c[1] * al; cb = cb * (1 - al) + c[2] * al; ca = ca * (1 - al) + al; }
    alp[i] = ca ? 1 : 0; col[i * 3] = ca ? cr / ca : 0; col[i * 3 + 1] = ca ? cg / ca : 0; col[i * 3 + 2] = ca ? cb / ca : 0;
    col[i * 3 + 0] = cr; col[i * 3 + 1] = cg; col[i * 3 + 2] = cb; pane[i] = pane[i];
    // ca (Deckkraft) separat merken
    alpA[i] = ca;
  }
  const H = blur(alp, R, R, Math.round(R * 0.022)), Hs = blur(alp, R, R, Math.max(1, Math.round(R * 0.006)));
  const SH = blur(alp, R, R, Math.round(R * 0.03)), PH = blur(pane, R, R, Math.round(R * 0.05)), PHs = blur(pane, R, R, Math.max(1, Math.round(R * 0.008)));
  const out = new Uint8Array(size * size * 4);
  const L = [-0.55, -0.83], at = (a, x, y) => a[clamp(y, 0, R - 1) * R + clamp(x, 0, R - 1)];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let sr = 0, sg = 0, sb = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = px * S + sx, y = py * S + sy, i = y * R + x, X = (x + .5) * k, Y = (y + .5) * k;
      // Glas-Scheibe (Hintergrund-Kachel) – bricht den Hintergrund leicht
      const pgx = (at(PH, x + 2, y) - at(PH, x - 2, y)), pgy = (at(PH, x, y + 2) - at(PH, x, y - 2));
      let [r, g, b] = bgAt(X - pgx * 90, Y - pgy * 90);
      const pe = pane[i] ? clamp(1 - PHs[i]) * 1 : 0; // Randbereich der Kachel
      const pl = clamp(-(pgx * L[0] + pgy * L[1]) * 9, 0, 1);
      const pd = clamp((pgx * L[0] + pgy * L[1]) * 9, 0, 1);
      if (pane[i]) { const wv = 0.1 + 0.32 * pl * (1 - PH[i]) * 3 + pe * 0.5; r = mix(r, 255, clamp(wv, 0, .8)); g = mix(g, 255, clamp(wv, 0, .8)); b = mix(b, 255, clamp(wv, 0, .8)); r *= 1 - pd * .25; g *= 1 - pd * .25; b *= 1 - pd * .25; }
      // Schlagschatten des Geschenks
      const sh = clamp(at(SH, x, y - Math.round(R * 0.018)) * 0.55);
      r *= 1 - sh * .6; g *= 1 - sh * .6; b *= 1 - sh * .5;
      if (alp[i]) {
        const gx = (at(H, x + 2, y) - at(H, x - 2, y)), gy = (at(H, x, y + 2) - at(H, x, y - 2));
        const [br, bg, bb] = bgAt(X - gx * 140, Y - gy * 140); // Brechung
        const a = alpA[i];
        const lum = 1.04;
        const cr = col[i * 3] / a, cg = col[i * 3 + 1] / a, cb = col[i * 3 + 2] / a;
        r = mix(br, cr, Math.min(1, a * 1.12)) * lum; g = mix(bg, cg, Math.min(1, a * 1.12)) * lum; b = mix(bb, cb, Math.min(1, a * 1.12)) * lum;
        const edge = clamp(1 - Hs[i]) ; // 1 am Rand
        const spec = clamp(-(gx * L[0] + gy * L[1]) * 14, 0, 1);
        const dark = clamp((gx * L[0] + gy * L[1]) * 10, 0, 1);
        const inner = clamp(1 - H[i] * 1.5);
        const hi = clamp(spec * 0.85 + edge * 0.55 + inner * 0.18);
        r = mix(r, 255, hi); g = mix(g, 255, hi); b = mix(b, 255, hi);
        r *= 1 - dark * .22; g *= 1 - dark * .22; b *= 1 - dark * .22;
        const top = clamp((1 - (Y - 236) / 40) * 0.0); r += top;
      }
      sr += r; sg += g; sb += b;
    }
    const o = (py * size + px) * 4, n = S * S;
    out[o] = clamp(sr / n, 0, 255); out[o + 1] = clamp(sg / n, 0, 255); out[o + 2] = clamp(sb / n, 0, 255); out[o + 3] = 255;
  }
  return png(size, size, size, out, false);
}
let alpA;
function render(size, mono) {
  if (!mono) { alpA = new Float32Array(size * 2 * size * 2); return renderGlass(size); }
  const layers = MONO.map(([f, c, a]) => [f, hex(c), a]);
  const out = new Uint8Array(size * size * 4);
  const S = 2, view = 256, off = [128, 160];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = off[0] + ((px + (sx + .5) / S) * view) / size, y = off[1] + ((py + (sy + .5) / S) * view) / size;
      let ca = 0;
      for (const [f, , al] of layers) if (f(x, y)) ca = ca * (1 - al) + al;
      if (ca && MONO_CUT(x, y) && y > 290) ca = 0;
      a += ca;
    }
    const i = (py * size + px) * 4;
    out[i] = out[i + 1] = out[i + 2] = 255; out[i + 3] = Math.round((a / (S * S)) * 255);
  }
  return png(size, size, size, out, true);
}
const cache = {};
export default function handler(req, res) {
  const q = String((req.query && req.query.s) || '512');
  const key = ['96', '192', '512'].includes(q) ? q : '512';
  if (!cache[key]) cache[key] = key === '96' ? render(96, true) : render(Number(key), false);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.status(200).end(cache[key]);
}
