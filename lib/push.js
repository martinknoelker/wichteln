import crypto from 'node:crypto';
import { redis, pipeline, k } from './redis.js';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const SUBJECT = 'https://wichteln-ten.vercel.app';

// VAPID-Schlüssel: einmalig erzeugt und in der Datenbank abgelegt (keine zusätzliche Einrichtung nötig).
let cached = null;
export async function getVapid() {
  if (cached) return cached;
  const key = 'wichtel:vapid';
  let v = await redis('GET', key);
  if (!v) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = privateKey.export({ format: 'jwk' });
    const pub = publicKey.export({ format: 'jwk' });
    const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
    const fresh = JSON.stringify({ pub: b64u(raw), jwk });
    await redis('SET', key, fresh, 'NX');
    v = await redis('GET', key);
  }
  const o = JSON.parse(v);
  cached = { pub: o.pub, priv: crypto.createPrivateKey({ key: o.jwk, format: 'jwk' }) };
  return cached;
}

function vapidHeader(endpoint, vapid) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: vapid.priv, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapid.pub}`;
}

// Verschlüsselung nach RFC 8291 (aes128gcm)
export function encryptPayload(sub, text) {
  const ua = Buffer.from(sub.keys.p256dh, 'base64url');
  const auth = Buffer.from(sub.keys.auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  const asPub = ecdh.generateKeys();
  const secret = ecdh.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const enc = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, enc]);
}

// true = zugestellt, false = Abo ungültig (löschen), null = vorübergehender Fehler
export async function sendOne(sub, payload, vapid) {
  try {
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(sub.endpoint, vapid),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'high',
      },
      body: encryptPayload(sub, JSON.stringify(payload)),
      signal: AbortSignal.timeout(7000),
    });
    if (r.status === 404 || r.status === 410) return false;
    return r.ok ? true : null;
  } catch {
    return null;
  }
}

// An viele Abos eines Festes (tokens = nur diese; sonst alle)
export async function notify(id, payload, tokens) {
  const flat = (await redis('HGETALL', k(id, 's'))) || [];
  const subs = [];
  for (let i = 0; i < flat.length; i += 2) {
    if (tokens && !tokens.includes(flat[i])) continue;
    try { subs.push([flat[i], JSON.parse(flat[i + 1])]); } catch {}
  }
  if (!subs.length) return { sent: 0, total: 0 };
  const vapid = await getVapid();
  const res = await Promise.all(subs.map(([, s]) => sendOne(s, payload, vapid)));
  const dead = subs.filter((_, i) => res[i] === false).map(([t]) => t);
  if (dead.length) await redis('HDEL', k(id, 's'), ...dead);
  return { sent: res.filter((x) => x === true).length, total: subs.length };
}

export const vapidPublic = async () => (await getVapid()).pub;
