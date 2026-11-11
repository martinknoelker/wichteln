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
function render(size, mono) {
  const layers = (mono ? MONO : COLOR).map(([f, c, a]) => [f, hex(c), a]);
  const out = new Uint8Array(size * size * 4);
  const S = 2, view = mono ? 256 : 512, off = mono ? [128, 160] : [0, 0];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = off[0] + ((px + (sx + .5) / S) * view) / size, y = off[1] + ((py + (sy + .5) / S) * view) / size;
      let cr = 0, cg = 0, cb = 0, ca = 0;
      for (const [f, c, al] of layers) if (f(x, y)) { cr = cr * (1 - al) + c[0] * al; cg = cg * (1 - al) + c[1] * al; cb = cb * (1 - al) + c[2] * al; ca = ca * (1 - al) + al; }
      if (mono && ca && MONO_CUT(x, y) && y > 290) ca = 0;
      r += cr; g += cg; b += cb; a += ca;
    }
    const i = (py * size + px) * 4, n = S * S;
    out[i] = r / n; out[i + 1] = g / n; out[i + 2] = b / n; out[i + 3] = mono ? Math.round((a / n) * 255) : 255;
  }
  return png(size, size, size, out, mono);
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
