// Web-App-Manifest. Startadresse = die eigene Feier (und – falls vorhanden – die persönliche Anmeldung), damit die App direkt dort öffnet.
const ok = (v, re) => (typeof v === 'string' && re.test(v) ? v : '');
export default function handler(req, res) {
  const q = req.query || {};
  const p = ok(q.p, /^[a-z0-9]{4,16}$/);
  const admin = ok(q.admin, /^[A-Za-z0-9_-]{6,80}$/);
  const t = ok(q.t, /^[A-Za-z0-9_-]{6,80}$/);
  let start = '/';
  if (p) {
    const u = new URLSearchParams({ p });
    if (admin) u.set('admin', admin); else if (t) u.set('t', t);
    start = '/?' + u.toString();
  }
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).end(JSON.stringify({
    id: start,
    name: 'Wichteln – Weihnachtslosung',
    short_name: 'Wichteln',
    description: 'Weihnachts-Wichteln: losen, wer wen beschenkt.',
    lang: 'de',
    start_url: start,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b1f19',
    theme_color: '#0b1f19',
    icons: [
      { src: '/api/icon?s=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/icon?s=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/api/icon?s=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }));
}
