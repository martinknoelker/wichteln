import { redis, k, handle, fail, body, getMeta, settingsOf, flag, asBool, budgetOf, nameKey, clean } from '../lib/redis.js';

// Der Ersteller kann die Einstellungen ändern, solange die Losung nicht freigegeben ist.
export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  const meta = await getMeta(id);
  if (!b.admin || b.admin !== meta.admin) fail(403, 'Nur die Person, die die Feier erstellt hat, kann das ändern.');
  if (meta.status !== 'collecting') fail(409, 'Die Losung ist schon freigegeben – Einstellungen sind jetzt gesperrt.');

  const cur = settingsOf(meta);
  const next = {
    useColor: asBool(b.useColor, cur.useColor),
    useLetter: asBool(b.useLetter, cur.useLetter),
    joker: asBool(b.joker, cur.joker),
    loser: asBool(b.loser, cur.loser),
    budget: b.budget === undefined ? cur.budget : budgetOf(b.budget),
  };
  if (next.useColor !== cur.useColor || next.useLetter !== cur.useLetter) {
    const count = Number(await redis('HLEN', k(id, 'p')));
    if (count > 0) fail(409, 'Farbe und Buchstabe lassen sich nicht mehr ändern, sobald jemand eingereicht hat.');
  }
  const fields = ['useColor', flag(next.useColor), 'useLetter', flag(next.useLetter), 'joker', flag(next.joker), 'loser', flag(next.loser), 'budget', next.budget];
  // Geheime Ausschlüsse des Organisators: { "Name": ["Name", …] } → nameKeys
  if (b.ex && typeof b.ex === 'object') {
    const ax = {};
    for (const [g, list] of Object.entries(b.ex)) {
      const gk = nameKey(clean(g, 40));
      const arr = [...new Set((Array.isArray(list) ? list : []).map((r) => nameKey(clean(r, 40))).filter((r) => r && r !== gk))];
      if (gk && arr.length) ax[gk] = arr;
    }
    fields.push('ax', JSON.stringify(ax));
  }
  await redis('HSET', k(id, 'meta'), ...fields);
  res.status(200).json({ settings: next });
});
