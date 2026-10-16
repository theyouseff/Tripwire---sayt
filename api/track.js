// Ochiq hodisa qabul qiluvchi. Faqat oq ro'yxatdagi hodisalar; admin kirishlari sanalmaydi.
'use strict';
const getRedis = require('../lib/redis');
const { send, getIp, readJson, dayKey } = require('../lib/http');
const { isAdmin } = require('../lib/auth');

const EVENTS = new Set(['view', 'cta_hero', 'cta_sticky', 'cta_price', 'tg_click', 'card_copy', 'video_play', 'faq_open', 'reach_pay']);
const INDEXED = new Set(['video_play', 'faq_open']);
const UNIQUE = new Set(['view', 'reach_pay', 'card_copy', 'tg_click']);
const SOURCES = new Set(['instagram', 'telegram', 'youtube', 'facebook', 'google', 'direct', 'other']);
const TTL = 400 * 24 * 3600;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  try {
    const len = Number(req.headers['content-length'] || 0);
    if (len > 1024) return send(res, 413, { error: 'too large' });

    let b;
    try { b = await readJson(req, 1024); } catch (e) { return send(res, e.code || 400, { error: 'bad body' }); }

    const e = b && b.e;
    if (typeof e !== 'string' || !EVENTS.has(e)) return send(res, 400, { error: 'event' });
    const id = typeof b.i === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(b.i) ? b.i : null;
    if (!id) return send(res, 400, { error: 'id' });

    let idx = null;
    if (INDEXED.has(e)) {
      idx = Number(b.x);
      if (!Number.isInteger(idx) || idx < 0 || idx > 9) return send(res, 400, { error: 'index' });
    }

    if (await isAdmin(req)) return send(res, 204);

    const r = getRedis();
    const ip = getIp(req);
    const minute = Math.floor(Date.now() / 60000);
    const rl = await r.incr(`rl:t:${ip}:${minute}`);
    if (rl === 1) await r.expire(`rl:t:${ip}:${minute}`, 120);
    if (rl > 120) return send(res, 429, { error: 'slow down' });

    const day = dayKey();
    const bump = async (key) => { const n = await r.incr(key); if (n === 1) await r.expire(key, TTL); };

    const tasks = [bump(`ev:${day}:${e}${idx !== null ? ':' + idx : ''}`)];
    if (UNIQUE.has(e)) { tasks.push(r.pfadd(`pf:${day}:${e}`, id)); tasks.push(r.expire(`pf:${day}:${e}`, TTL)); }
    if (e === 'view') {
      const s = SOURCES.has(b.s) ? b.s : 'other';
      const d = b.d === 'm' ? 'm' : 'd';
      tasks.push(bump(`src:${day}:${s}`), bump(`dev:${day}:${d}`));
    }
    await Promise.all(tasks);
    return send(res, 204);
  } catch (err) {
    console.error('track error', err && err.message);
    return send(res, 500, { error: 'server' });
  }
};
