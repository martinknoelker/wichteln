import { redis, k, handle, fail, body, getMeta, nameKey, hashPin, sameHash } from '../lib/redis.js';

// „Ich bin schon dabei": Wer ihren/seinen Browser-Code verloren hat, kommt mit Name + PIN wieder rein.
export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  await getMeta(id);
  const nk = nameKey(b.name);
  const pin = String(b.pin ?? '').trim();
  if (!nk) fail(400, 'Bitte wähle deinen Namen aus.');
  if (!/^\d{4}$/.test(pin)) fail(400, 'Bitte gib deine PIN aus 4 Ziffern ein.');

  // Schutz vor Durchprobieren: höchstens 6 Versuche pro Name und 15 Minuten
  const pf = k(id, 'pf:' + nk);
  const tries = Number(await redis('INCR', pf));
  if (tries === 1) await redis('EXPIRE', pf, '900');
  if (tries > 6) fail(429, 'Zu viele falsche Versuche. Bitte warte 15 Minuten und probiere es dann noch einmal.');

  let token = await redis('HGET', k(id, 'n'), nk);
  if (!token) {
    // Feiern aus der ersten Version haben noch keine Namensliste
    const flat = (await redis('HGETALL', k(id, 'p'))) || [];
    for (let i = 0; i < flat.length; i += 2) {
      try { if (nameKey(JSON.parse(flat[i + 1]).name) === nk) token = flat[i]; } catch {}
    }
  }
  if (!token) fail(404, 'Zu diesem Namen gibt es keine Anmeldung.');
  const raw = await redis('HGET', k(id, 'p'), token);
  if (!raw) fail(404, 'Zu diesem Namen gibt es keine Anmeldung.');
  const p = JSON.parse(raw);
  if (!p.pin) fail(409, 'Diese Anmeldung stammt aus einer älteren Version und hat keine PIN. Bitte den Ersteller um einen persönlichen Link.');
  if (!sameHash(p.pin, hashPin(id, nk, pin))) fail(403, `Die PIN stimmt nicht. (${Math.max(0, 6 - tries)} Versuche übrig)`);

  await redis('DEL', pf);
  res.status(200).json({ token });
});
