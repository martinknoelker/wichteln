import { redis, k, TTL, handle, fail, body, getMeta, nameKey } from '../lib/redis.js';

// Jede Person kann (nur für sich, geheim) festlegen, wen sie diesmal NICHT ziehen soll.
export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  const token = String(b.token || '') || '-';
  const meta = await getMeta(id);
  if (meta.status !== 'collecting') fail(409, 'Die Losung ist schon freigegeben – Ausschlüsse sind jetzt gesperrt.');

  const flat = (await redis('HGETALL', k(id, 'p'))) || [];
  const byKey = {};
  let me = null;
  for (let i = 0; i < flat.length; i += 2) {
    let p; try { p = JSON.parse(flat[i + 1]); } catch { continue; }
    byKey[nameKey(p.name)] = p.name;
    if (flat[i] === token) me = p;
  }
  if (!me) fail(403, 'Du bist bei dieser Feier nicht angemeldet.');

  const selfKey = nameKey(me.name);
  const asked = Array.isArray(b.names) ? b.names : [];
  const keys = [...new Set(asked.map(nameKey))].filter((x) => x && x !== selfKey && byKey[x]);
  const max = Math.max(0, meta.total - 3);
  if (keys.length > max) fail(400, max === 0 ? 'Bei so wenigen Personen kann niemand ausgeschlossen werden.' : `Du kannst höchstens ${max} Personen ausschließen, sonst geht die Losung nicht auf.`);

  await redis('HSET', k(id, 'x'), token, JSON.stringify(keys));
  await redis('EXPIRE', k(id, 'x'), TTL);
  res.status(200).json({ excluded: keys.map((x) => byKey[x]) });
});
