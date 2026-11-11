import { redis, pipeline, k, handle, getMeta, settingsOf, nameKey } from '../lib/redis.js';

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
    // Der Organisator macht selbst mit: seinen Teilnehmer-Eintrag merken, damit jedes Gerät ihn zur Verwaltung führt
    if (!m.org && out.isAdmin) { m.org = 1; await redis('HSET', k(id, 'p'), t, JSON.stringify(m)); }
    if (m.org) out.me.adminKey = meta.admin;
  }
  if (out.isAdmin && meta.status === 'open') {
    // Nur wer noch nicht gezogen hat (nie, was gezogen wurde) – für die Erinnerung
    const [pf, dk] = await pipeline([['HGETALL', k(id, 'p')], ['HKEYS', k(id, 'd')]]);
    const done = new Set(dk || []);
    out.pending = [];
    for (let i = 0; i < (pf || []).length; i += 2) {
      if (!done.has(pf[i])) { try { out.pending.push(JSON.parse(pf[i + 1]).name); } catch {} }
    }
    out.pending.sort((x, y) => x.localeCompare(y, 'de')); // feste Reihenfolge
  }
  if (out.isAdmin && meta.status === 'collecting') {
    // Nur für den Organisator: seine geheimen Ausschlüsse (Name → Namen)
    const byKey = {};
    names.forEach((n) => { byKey[nameKey(n)] = n; });
    out.adminEx = {};
    try {
      const ax = JSON.parse(meta.ax || '{}');
      for (const [g, list] of Object.entries(ax)) {
        if (!byKey[g]) continue;
        const l = list.map((x) => byKey[x]).filter(Boolean);
        if (l.length) out.adminEx[byKey[g]] = l;
      }
    } catch {}
  }
  res.status(200).json(out);
});
