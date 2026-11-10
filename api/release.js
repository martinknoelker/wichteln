import crypto from 'node:crypto';
import { redis, pipeline, k, TTL, handle, fail, body, getMeta } from '../lib/redis.js';

// Zufällige Verteilung, bei der niemand seine eigene Angabe bekommt (Derangement)
function derange(n) {
  if (n < 2) return [0];
  for (;;) {
    const a = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.every((v, i) => v !== i)) return a;
  }
}

export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  const meta = await getMeta(id);
  if (!b.admin || b.admin !== meta.admin) fail(403, 'Nur die Person, die die Feier erstellt hat, kann die Losung freigeben.');
  if (meta.status === 'open') return res.status(200).json({ ok: true });

  const flat = (await redis('HGETALL', k(id, 'p'))) || [];
  const people = [];
  for (let i = 0; i < flat.length; i += 2) people.push({ token: flat[i], ...JSON.parse(flat[i + 1]) });
  if (people.length < meta.total) fail(409, `Es haben erst ${people.length} von ${meta.total} Personen eingereicht.`);

  // Farben und Buchstaben werden unabhängig voneinander gemischt
  const c = derange(people.length);
  const l = derange(people.length);
  const args = [];
  people.forEach((p, i) => {
    args.push(p.token, JSON.stringify({ color: people[c[i]].color, letter: people[l[i]].letter }));
  });

  // Nur einmal freigeben, auch wenn doppelt geklickt wird
  const lock = await redis('SET', k(id, 'releaselock'), '1', 'NX', 'EX', '60');
  if (lock !== 'OK') return res.status(200).json({ ok: true });

  await pipeline([
    ['HSET', k(id, 'a'), ...args],
    ['EXPIRE', k(id, 'a'), TTL],
    ['HSET', k(id, 'meta'), 'status', 'open'],
  ]);
  res.status(200).json({ ok: true });
});
