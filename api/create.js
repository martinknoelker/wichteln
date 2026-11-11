import { pipeline, k, rid, TTL, handle, fail, body, clean, flag, asBool } from '../lib/redis.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') fail(405, 'Nur POST erlaubt');
  const b = body(req);
  const name = clean(b.name, 60);
  const total = parseInt(b.total, 10);
  if (!name) fail(400, 'Bitte gib der Feier einen Namen.');
  if (!(total >= 2 && total <= 50)) fail(400, 'Die Teilnehmerzahl muss zwischen 2 und 50 liegen.');

  const id = rid(8);
  const admin = rid(20);
  await pipeline([
    ['HSET', k(id, 'meta'),
      'name', name, 'total', total, 'status', 'collecting', 'admin', admin, 'created', Date.now(),
      'useColor', flag(asBool(b.useColor, true)),
      'useLetter', flag(asBool(b.useLetter, true)),
      'joker', flag(asBool(b.joker, false)),
      'loser', flag(asBool(b.loser, false))],
    ['EXPIRE', k(id, 'meta'), TTL],
  ]);
  res.status(200).json({ id, admin });
});
