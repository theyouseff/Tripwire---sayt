// Redis klienti. Upstash env bo'lmasa, lokal sinov uchun xotiradagi oddiy baza ishlatiladi.
'use strict';

function memoryClient() {
  const kv = new Map();      // key -> { v, exp }
  const sets = new Map();    // key -> Set (HyperLogLog o'rniga)
  const alive = (k) => {
    const e = kv.get(k);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) { kv.delete(k); return null; }
    return e;
  };
  return {
    memory: true,
    async get(k) { const e = alive(k); return e ? e.v : null; },
    async set(k, v, opts) { kv.set(k, { v, exp: opts && opts.ex ? Date.now() + opts.ex * 1000 : 0 }); return 'OK'; },
    async incr(k) { const e = alive(k); const n = (e ? Number(e.v) : 0) + 1; kv.set(k, { v: n, exp: e ? e.exp : 0 }); return n; },
    async expire(k, sec) { const e = alive(k); if (e) e.exp = Date.now() + sec * 1000; return e ? 1 : 0; },
    async del(k) { return kv.delete(k) ? 1 : 0; },
    async mget(...keys) { return keys.flat().map((k) => { const e = alive(k); return e ? e.v : null; }); },
    async pfadd(k, ...vals) { const s = sets.get(k) || new Set(); const before = s.size; vals.flat().forEach((x) => s.add(x)); sets.set(k, s); return s.size > before ? 1 : 0; },
    async pfcount(k) { const s = sets.get(k); return s ? s.size : 0; },
  };
}

let client;
module.exports = function getRedis() {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const { Redis } = require('@upstash/redis');
    client = new Redis({ url, token });
  } else {
    if (process.env.VERCEL) console.error('Redis env topilmadi: xotiradagi bazadan foydalanilmoqda (ma\'lumot saqlanmaydi).');
    client = memoryClient();
  }
  return client;
};
