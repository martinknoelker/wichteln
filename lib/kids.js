import { redis, pipeline, k, rid, TTL, fail, clean, nameKey } from './redis.js';

// Kinderprofile: Ein Kind ist ein normaler Teilnehmer ({ kid: 1, par: [Eltern-Tokens] }) ohne eigene PIN.
export const KID_MAX = 8;
export const parse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

// Name + Farbe + Buchstabe laut Einstellungen prüfen (für ein Kind)
export function personFrom(b, s) {
  const name = clean(b && b.name, 40);
  if (!name) fail(400, 'Bitte gib den Namen des Kindes ein.');
  const person = { name };
  if (s.useColor) {
    const color = clean(b.color, 30);
    if (!color) fail(400, `Bitte gib eine Farbe für ${name} ein.`);
    if (/^(bunt\w*|mehrfarbig\w*|multi\s?colou?r\w*|regenbogen\w*|rainbow)$/i.test(color)) fail(400, 'Bunt gilt nicht – bitte wähle eine einzelne Farbe.');
    person.color = color;
  }
  if (s.useLetter) {
    const letter = [...String(b.letter || '').trim().toLocaleUpperCase('de-DE')][0] || '';
    if (!/^\p{L}$/u.test(letter)) fail(400, `Bitte gib genau einen Buchstaben für ${name} ein.`);
    person.letter = letter;
  }
  return person;
}

export async function tokenByName(id, nk) {
  if (!nk) return null;
  const t = await redis('HGET', k(id, 'n'), nk);
  if (t) return t;
  const flat = (await redis('HGETALL', k(id, 'p'))) || [];
  for (let i = 0; i < flat.length; i += 2) {
    const p = parse(flat[i + 1]);
    if (p && nameKey(p.name) === nk) return flat[i];
  }
  return null;
}

// Legt Kinder an (Plätze müssen vom Aufrufer schon reserviert sein). Bei Fehler wird alles hier Angelegte zurückgenommen.
export async function createKids(id, parentToken, list) {
  const made = [];
  try {
    for (const person of list) {
      const nk = nameKey(person.name);
      const token = rid(20);
      const got = await redis('HSETNX', k(id, 'n'), nk, token);
      if (Number(got) !== 1) fail(409, `Den Namen „${person.name}“ gibt es schon in der Runde. Bitte nimm z. B. den Nachnamen dazu.`);
      made.push({ nk, token });
      await redis('HSET', k(id, 'p'), token, JSON.stringify({ ...person, kid: 1, par: [parentToken] }));
    }
    await pipeline(['count', 'p', 'n'].map((x) => ['EXPIRE', k(id, x), TTL]));
  } catch (e) {
    for (const m of made) {
      await redis('HDEL', k(id, 'n'), m.nk).catch(() => {});
      await redis('HDEL', k(id, 'p'), m.token).catch(() => {});
    }
    throw e;
  }
  return made;
}

// Zusätzlicher Elternteil bei bestehenden Kindern
export async function claimKids(id, parentToken, names) {
  for (const nm of names) {
    const kt = await tokenByName(id, nameKey(nm));
    const kp = kt && parse(await redis('HGET', k(id, 'p'), kt));
    if (!kp || !kp.kid) fail(404, `„${clean(nm, 40)}“ ist kein Kinderprofil in dieser Runde.`);
    const par = Array.isArray(kp.par) ? kp.par : [];
    if (!par.includes(parentToken)) await redis('HSET', k(id, 'p'), kt, JSON.stringify({ ...kp, par: [...par, parentToken] }));
  }
}
