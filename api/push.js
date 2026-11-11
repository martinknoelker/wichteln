import { redis, pipeline, k, TTL, handle, fail, body, getMeta, nameKey } from '../lib/redis.js';
import { notify, vapidPublic } from '../lib/push.js';

export default handle(async (req, res) => {
  // Öffentlicher Schlüssel für die Anmeldung im Browser
  if (req.method === 'GET') return res.status(200).json({ key: await vapidPublic() });
  if (req.method !== 'POST') fail(405, 'Nur GET oder POST erlaubt');
  const b = body(req);
  const id = String(b.id || '');
  const meta = await getMeta(id);

  if (b.action === 'subscribe') {
    const token = String(b.token || '-');
    const sub = b.sub;
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 600
      || !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') fail(400, 'Ungültige Anmeldung.');
    const ok = await redis('HEXISTS', k(id, 'p'), token);
    if (!Number(ok)) fail(403, 'Du bist bei dieser Feier nicht angemeldet.');
    await pipeline([
      ['HSET', k(id, 's'), token, JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } })],
      ['EXPIRE', k(id, 's'), TTL],
    ]);
    return res.status(200).json({ ok: true });
  }

  if (b.action === 'remind') {
    if (!b.admin || b.admin !== meta.admin) fail(403, 'Nur der Organisator kann erinnern.');
    if (meta.status !== 'open') fail(409, 'Die Losung ist noch nicht freigegeben.');
    const flat = (await redis('HGETALL', k(id, 'p'))) || [];
    let token = null;
    for (let i = 0; i < flat.length; i += 2) {
      try { if (nameKey(JSON.parse(flat[i + 1]).name) === nameKey(b.name)) token = flat[i]; } catch {}
    }
    if (!token) fail(404, 'Diese Person gibt es nicht.');
    if (Number(await redis('HEXISTS', k(id, 'd'), token))) return res.status(200).json({ result: 'drawn' });
    const lock = await redis('SET', k(id, 'rl:' + token), '1', 'NX', 'EX', '600');
    if (lock !== 'OK') return res.status(200).json({ result: 'wait' });
    const r = await notify(id, {
      title: '⏰ Dein Los wartet noch',
      body: `Bei „${meta.name}“ hast du noch nicht gezogen. Der Organisator erinnert dich – jetzt ziehen!`,
      url: `/?p=${id}`,
      tag: 'wichtel-remind-' + id,
    }, [token]);
    return res.status(200).json({ result: r.sent ? 'sent' : 'nosub' });
  }
  fail(400, 'Unbekannte Aktion.');
});
