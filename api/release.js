import { redis, pipeline, k, TTL, handle, fail, body, getMeta, settingsOf, nameKey } from '../lib/redis.js';
import { derange, assignTargets, pick } from '../lib/assign.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  const meta = await getMeta(id);
  if (!b.admin || b.admin !== meta.admin) fail(403, 'Nur die Person, die die Feier erstellt hat, kann die Losung freigeben.');
  if (meta.status === 'open') return res.status(200).json({ ok: true });
  const s = settingsOf(meta);

  const [flat, exFlat] = await Promise.all([redis('HGETALL', k(id, 'p')), redis('HGETALL', k(id, 'x'))]);
  const people = [];
  for (let i = 0; i < (flat || []).length; i += 2) people.push({ token: flat[i], ...JSON.parse(flat[i + 1]) });
  if (people.length < meta.total) fail(409, `Es haben erst ${people.length} von ${meta.total} Personen eingereicht.`);
  const n = people.length;

  // Ausschlüsse: Person i darf Person j nicht beschenken
  const excl = {};
  for (let i = 0; i < (exFlat || []).length; i += 2) {
    try { excl[exFlat[i]] = new Set(JSON.parse(exFlat[i + 1])); } catch {}
  }
  const keys = people.map((p) => nameKey(p.name));
  const allowed = people.map((p, i) => keys.map((_, j) => j).filter((j) => j !== i && !(excl[p.token] && excl[p.token].has(keys[j]))));
  const target = assignTargets(allowed);
  if (!target) fail(409, 'Mit den gewählten Ausschlüssen geht die Losung nicht auf. Bitte ein paar Teilnehmer, einzelne Ausschlüsse wieder herauszunehmen.');

  // Farben und Buchstaben werden unabhängig voneinander (und unabhängig von der Person) gemischt
  const c = s.useColor ? derange(n) : null;
  const l = s.useLetter ? derange(n) : null;

  // Joker und Loser: zufällig, nie dieselbe Person
  const jokerIdx = s.joker ? pick(n) : -1;
  let loserIdx = -1;
  if (s.loser) {
    const rest = [...Array(n).keys()].filter((i) => i !== jokerIdx);
    loserIdx = rest[pick(rest.length)];
  }

  const args = [];
  people.forEach((p, i) => {
    const o = { target: people[target[i]].name };
    if (c) o.color = people[c[i]].color;
    if (l) o.letter = people[l[i]].letter;
    if (i === jokerIdx) o.joker = true;
    if (i === loserIdx) o.loser = true;
    args.push(p.token, JSON.stringify(o));
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
