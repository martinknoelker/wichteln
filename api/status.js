import { pipeline, k, handle, getMeta } from '../lib/redis.js';

export default handle(async (req, res) => {
  const { id, admin, token } = req.query;
  const meta = await getMeta(id);
  const t = String(token || '-');

  const [vals, drawnCount, mine, myDraw] = await pipeline([
    ['HVALS', k(id, 'p')],
    ['HLEN', k(id, 'd')],
    ['HGET', k(id, 'p'), t],
    ['HGET', k(id, 'd'), t],
  ]);

  // Es werden nur Namen herausgegeben – nie Farben, Buchstaben oder Ziehungen anderer.
  const names = (vals || []).map((v) => {
    try { return JSON.parse(v).name; } catch { return '?'; }
  });

  const out = {
    name: meta.name,
    total: meta.total,
    count: names.length,
    names,
    status: meta.status,
    drawnCount: Number(drawnCount || 0),
    isAdmin: !!admin && admin === meta.admin,
  };
  if (mine) {
    const m = JSON.parse(mine);
    out.me = { name: m.name, draw: myDraw ? JSON.parse(myDraw) : null };
  }
  res.status(200).json(out);
});
