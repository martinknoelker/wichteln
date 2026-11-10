import { redis, pipeline, k, TTL, handle, fail, body, getMeta } from '../lib/redis.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  const token = String(b.token || '') || '-';
  const meta = await getMeta(id);
  if (meta.status !== 'open') fail(409, 'Die Losung ist noch nicht freigegeben.');

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
