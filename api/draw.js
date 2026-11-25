import { redis, pipeline, k, TTL, handle, fail, body, getMeta, nameKey } from '../lib/redis.js';
import { parse, tokenByName } from '../lib/kids.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  let token = String(b.token || '') || '-';
  const meta = await getMeta(id);
  if (meta.status !== 'open') fail(409, 'Die Losung ist noch nicht freigegeben.');

  // Für ein Kind ziehen: nur ein eingetragener Elternteil – das Los des Kindes gibt es nur einmal (für beide Eltern gleich)
  if (b.kid) {
    if (!(await redis('HEXISTS', k(id, 'p'), token))) fail(403, 'Du bist bei dieser Feier nicht angemeldet.');
    const kt = await tokenByName(id, nameKey(b.kid));
    const kp = kt && parse(await redis('HGET', k(id, 'p'), kt));
    if (!kp || !kp.kid || !Array.isArray(kp.par) || !kp.par.includes(token)) fail(403, 'Du verwaltest dieses Kind nicht.');
    token = kt;
  }

  const [mine, existing, assigned] = await pipeline([
    ['HGET', k(id, 'p'), token],
    ['HGET', k(id, 'd'), token],
    ['HGET', k(id, 'a'), token],
  ]);
  if (!mine) fail(403, 'Du bist bei dieser Feier nicht angemeldet.');
  if (existing) return res.status(200).json({ draw: JSON.parse(existing) });
  if (!assigned) fail(500, 'Für dich wurde kein Los gefunden.');

  // Los aufdecken: Jede Farbe und jeder Buchstabe aus dem Topf geht genau an eine Person.
  await pipeline([
    ['HSETNX', k(id, 'd'), token, assigned],
    ['EXPIRE', k(id, 'd'), TTL],
  ]);
  res.status(200).json({ draw: JSON.parse(assigned) });
});
