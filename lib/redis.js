import crypto from 'node:crypto';

// Vercel + Upstash Redis setzt diese Variablen automatisch, sobald die Datenbank verbunden ist.
const BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const TTL = String(60 * 60 * 24 * 60); // Daten werden nach 60 Tagen automatisch gelöscht

export function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

function assertConfig() {
  if (!BASE || !TOKEN) {
    fail(500, 'Keine Datenbank verbunden. Bitte in Vercel unter „Storage" eine Upstash-Redis-Datenbank mit dem Projekt verbinden und neu deployen.');
  }
}

export async function redis(...cmd) {
  assertConfig();
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd.map(String)),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export async function pipeline(cmds) {
  assertConfig();
  const r = await fetch(`${BASE}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds.map((c) => c.map(String))),
  });
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error(data.error || 'Datenbankfehler');
  return data.map((d) => {
    if (d.error) throw new Error(d.error);
    return d.result;
  });
}

export const k = (id, part) => `wichtel:${id}:${part}`;

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export function rid(len) {
  let s = '';
  for (const b of crypto.randomBytes(len)) s += ALPHA[b % ALPHA.length];
  return s;
}

export function body(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

export function clean(v, max) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function getMeta(id) {
  if (!/^[a-z0-9]{4,16}$/.test(String(id || ''))) fail(404, 'Diese Feier gibt es nicht (mehr).');
  const arr = await redis('HGETALL', k(id, 'meta'));
  if (!arr || !arr.length) fail(404, 'Diese Feier gibt es nicht (mehr).');
  const o = {};
  for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  o.total = Number(o.total);
  return o;
}

export function handle(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await fn(req, res);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Serverfehler' });
    }
  };
}
