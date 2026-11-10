import { redis, pipeline, k, rid, TTL, handle, fail, body, clean, getMeta } from '../lib/redis.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  const meta = await getMeta(id);
  if (meta.status !== 'collecting') fail(409, 'Die Losung läuft bereits – neue Teilnehmer sind nicht mehr möglich.');

  const name = clean(b.name, 40);
  const color = clean(b.color, 30);
  const letter = [...String(b.letter || '').trim().toLocaleUpperCase('de-DE')][0] || '';
  if (!name) fail(400, 'Bitte gib deinen Namen ein.');
  if (!color) fail(400, 'Bitte gib eine Farbe ein.');
  if (!/^\p{L}$/u.test(letter)) fail(400, 'Bitte gib genau einen Buchstaben ein.');

  // Platz atomar reservieren, damit nie mehr als „total" Personen teilnehmen
  const n = await redis('INCR', k(id, 'count'));
  if (n > meta.total) {
    await redis('DECR', k(id, 'count'));
    fail(409, 'Die Feier ist leider schon voll.');
  }

  const token = rid(20);
  await pipeline([
    ['HSET', k(id, 'p'), token, JSON.stringify({ name, color, letter })],
    ...['count', 'p'].map((x) => ['EXPIRE', k(id, x), TTL]),
  ]);
  res.status(200).json({ token });
});
