import { pipeline, k, handle, getMeta, settingsOf, nameKey } from '../lib/redis.js';

export default handle(async (req, res) => {
  const { id, admin, token } = req.query;
  const meta = await getMeta(id);
  const t = String(token || '-');

  const [vals, drawnCount, mine, myDraw, myEx] = await pipeline([
    ['HVALS', k(id, 'p')],
    ['HLEN', k(id, 'd')],
    ['HGET', k(id, 'p'), t],
    ['HGET', k(id, 'd'), t],
    ['HGET', k(id, 'x'), t],
  ]);

  // Es werden nur Namen herausgegeben – nie Farben, Buchstaben, PINs oder Ziehungen anderer.
  const names = (vals || []).map((v) => {
    try { return JSON.parse(v).name; } catch { return '?'; }
  });

  const out = {
    name: meta.name,
    total: meta.total,
    count: names.length,
    names,
    status: meta.status,
    settings: { ...settingsOf(meta), target: meta.useColor !== undefined },
    drawnCount: Number(drawnCount || 0),
    isAdmin: !!admin && admin === meta.admin,
  };
  if (mine) {
    const m = JSON.parse(mine);
    const byKey = {};
    names.forEach((n) => { byKey[nameKey(n)] = n; });
    let excluded = [];
    try { excluded = (JSON.parse(myEx || '[]')).map((x) => byKey[x]).filter(Boolean); } catch {}
    out.me = { name: m.name, draw: myDraw ? JSON.parse(myDraw) : null, excluded };
  }
  res.status(200).json(out);
});
