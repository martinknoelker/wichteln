import { redis, pipeline, k, rid, TTL, handle, fail, body, clean, getMeta, settingsOf, nameKey, hashPin } from '../lib/redis.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  const meta = await getMeta(id);
  if (meta.status !== 'collecting') fail(409, 'Die Losung läuft bereits – neue Teilnehmer sind nicht mehr möglich.');
  const s = settingsOf(meta);

  const name = clean(b.name, 40);
  const nk = nameKey(name);
  const pin = String(b.pin ?? '').trim();
  if (!name) fail(400, 'Bitte gib deinen Namen ein.');
  if (!/^\d{4}$/.test(pin)) fail(400, 'Bitte wähle eine PIN aus genau 4 Ziffern.');

  const person = { name };
  if (s.useColor) {
    const color = clean(b.color, 30);
    if (!color) fail(400, 'Bitte gib eine Farbe ein.');
    if (/^(bunt\w*|mehrfarbig\w*|multi\s?colou?r\w*|regenbogen\w*|rainbow)$/i.test(color)) fail(400, 'Bunt gilt nicht – bitte wähle eine einzelne Farbe.');
    person.color = color;
  }
  if (s.useLetter) {
    const letter = [...String(b.letter || '').trim().toLocaleUpperCase('de-DE')][0] || '';
    if (!/^\p{L}$/u.test(letter)) fail(400, 'Bitte gib genau einen Buchstaben ein.');
    person.letter = letter;
  }
  person.pin = hashPin(id, nk, pin);

  // Platz atomar reservieren, damit nie mehr als „total" Personen teilnehmen
  const n = await redis('INCR', k(id, 'count'));
  if (n > meta.total) {
    await redis('DECR', k(id, 'count'));
    fail(409, 'Die Feier ist leider schon voll.');
  }

  // Jeder Name darf nur einmal vorkommen (Groß-/Kleinschreibung egal)
  const token = rid(20);
  const got = await redis('HSETNX', k(id, 'n'), nk, token);
  if (Number(got) !== 1) {
    await redis('DECR', k(id, 'count'));
    fail(409, 'Diesen Namen gibt es schon in der Runde. Falls du das bist, tippe auf „Ich bin schon dabei". Sonst nimm bitte z. B. deinen Nachnamen dazu.');
  }
  try {
    await pipeline([
      ['HSET', k(id, 'p'), token, JSON.stringify(person)],
      ...['count', 'p', 'n'].map((x) => ['EXPIRE', k(id, x), TTL]),
    ]);
  } catch (e) {
    await redis('HDEL', k(id, 'n'), nk).catch(() => {});
    await redis('DECR', k(id, 'count')).catch(() => {});
    throw e;
  }
  res.status(200).json({ token });
});
