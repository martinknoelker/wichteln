import { redis, k, handle, fail, body, getMeta, settingsOf, nameKey } from '../lib/redis.js';
import { KID_MAX, parse, personFrom, tokenByName, createKids, claimKids } from '../lib/kids.js';

// Kinderprofile verwalten.
//  Eltern (token):  add | claim | edit | drop     – nur solange die Losung nicht freigegeben ist
//  Organisator:     convert (bestehendes Profil zum Kinderprofil machen oder zurück)
export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  const meta = await getMeta(id);
  const action = String(b.action || '');
  if (meta.status !== 'collecting') fail(409, 'Die Losung läuft schon – Kinderprofile lassen sich jetzt nicht mehr ändern.');
  const s = settingsOf(meta);

  if (action === 'convert') {
    if (!b.admin || b.admin !== meta.admin) fail(403, 'Nur der Organisator kann Profile zu Kinderprofilen machen.');
    const kt = await tokenByName(id, nameKey(b.name));
    const kp = kt && parse(await redis('HGET', k(id, 'p'), kt));
    if (!kp) fail(404, 'Diese Person gibt es nicht.');
    if (b.kid === false) {
      if (!kp.kid) return res.status(200).json({ ok: true });
      if (!kp.pin) fail(409, 'Dieses Kind wurde von den Eltern angemeldet und kann nicht zurückverwandelt werden.');
      const { kid, par, ...rest } = kp;
      await redis('HSET', k(id, 'p'), kt, JSON.stringify(rest));
      return res.status(200).json({ ok: true });
    }
    const toks = [];
    for (const nm of (Array.isArray(b.parents) ? b.parents : []).slice(0, 4)) {
      const t = await tokenByName(id, nameKey(nm));
      const pp = t && parse(await redis('HGET', k(id, 'p'), t));
      if (!pp) fail(404, 'Ein ausgewählter Elternteil ist nicht angemeldet.');
      if (t === kt || pp.kid) continue;
      if (!toks.includes(t)) toks.push(t);
    }
    if (!toks.length) fail(400, 'Bitte wähle mindestens einen Elternteil.');
    await redis('HSET', k(id, 'p'), kt, JSON.stringify({ ...kp, kid: 1, par: toks }));
    return res.status(200).json({ ok: true });
  }

  const token = String(b.token || '') || '-';
  const me = parse(await redis('HGET', k(id, 'p'), token));
  if (!me) fail(403, 'Du bist bei dieser Feier nicht angemeldet.');
  if (me.kid) fail(403, 'Kinderprofile können keine weiteren Kinder anmelden.');

  const myKid = async (name) => {
    const kt = await tokenByName(id, nameKey(name));
    const kp = kt && parse(await redis('HGET', k(id, 'p'), kt));
    if (!kp || !kp.kid || !Array.isArray(kp.par) || !kp.par.includes(token)) fail(403, 'Du verwaltest dieses Kind nicht.');
    return [kt, kp];
  };

  if (action === 'add') {
    const list = (Array.isArray(b.kids) ? b.kids : []).slice(0, KID_MAX).map((x) => personFrom(x, s));
    if (!list.length) fail(400, 'Bitte gib den Namen des Kindes ein.');
    const need = list.length;
    const n = await redis('INCRBY', k(id, 'count'), need);
    if (n > meta.total) {
      await redis('DECRBY', k(id, 'count'), need);
      const free = Math.max(0, meta.total - (n - need));
      fail(409, `Es ist nicht genug Platz: ${free} frei, ${need} gebraucht. Bitte den Organisator, die Teilnehmerzahl zu erhöhen.`);
    }
    try { await createKids(id, token, list); }
    catch (e) { await redis('DECRBY', k(id, 'count'), need).catch(() => {}); throw e; }
    return res.status(200).json({ ok: true });
  }

  if (action === 'claim') {
    const names = (Array.isArray(b.names) ? b.names : []).slice(0, KID_MAX);
    if (!names.length) fail(400, 'Bitte wähle ein Kind.');
    await claimKids(id, token, names);
    return res.status(200).json({ ok: true });
  }

  if (action === 'edit') {
    const [kt, kp] = await myKid(b.kid);
    const upd = personFrom({ name: kp.name, color: b.color ?? kp.color, letter: b.letter ?? kp.letter }, s);
    await redis('HSET', k(id, 'p'), kt, JSON.stringify({ ...kp, ...upd }));
    return res.status(200).json({ ok: true });
  }

  if (action === 'drop') {
    const [kt, kp] = await myKid(b.kid);
    const par = kp.par.filter((x) => x !== token);
    if (par.length) await redis('HSET', k(id, 'p'), kt, JSON.stringify({ ...kp, par }));
    else if (kp.pin) { const { kid, par: _p, ...rest } = kp; await redis('HSET', k(id, 'p'), kt, JSON.stringify(rest)); }
    else {
      await redis('HDEL', k(id, 'p'), kt);
      await redis('HDEL', k(id, 'n'), nameKey(kp.name));
      await redis('DECR', k(id, 'count'));
    }
    return res.status(200).json({ ok: true });
  }

  fail(400, 'Unbekannte Aktion.');
});
