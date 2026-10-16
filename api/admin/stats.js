'use strict';
const getRedis = require('../../lib/redis');
const { send, dayKey } = require('../../lib/http');
const { isAdmin } = require('../../lib/auth');

const BUTTONS = ['cta_hero', 'cta_sticky', 'cta_price', 'card_copy', 'tg_click'];
const SOURCES = ['instagram', 'telegram', 'youtube', 'facebook', 'google', 'direct', 'other'];
const VIDEOS = 6, FAQS = 4;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' }, { Allow: 'GET' });
  if (!(await isAdmin(req))) return send(res, 401, { error: 'auth' });
  try {
    const url = new URL(req.url, 'http://x');
    const n = [1, 7, 30].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 7;
    const days = Array.from({ length: n }, (_, i) => dayKey(n - 1 - i));
    const r = getRedis();

    // Hisoblagichlar bitta mget'da
    const keys = [];
    const add = (k) => { keys.push(k); return keys.length - 1; };
    const map = { views: [], btn: {}, src: {}, dev: { m: [], d: [] }, video: Array.from({ length: VIDEOS }, () => []), faq: Array.from({ length: FAQS }, () => []) };
    BUTTONS.forEach((b) => { map.btn[b] = []; });
    SOURCES.forEach((s) => { map.src[s] = []; });
    days.forEach((d) => {
      map.views.push(add(`ev:${d}:view`));
      BUTTONS.forEach((b) => map.btn[b].push(add(`ev:${d}:${b}`)));
      SOURCES.forEach((s) => map.src[s].push(add(`src:${d}:${s}`)));
      map.dev.m.push(add(`dev:${d}:m`)); map.dev.d.push(add(`dev:${d}:d`));
      for (let i = 0; i < VIDEOS; i++) map.video[i].push(add(`ev:${d}:video_play:${i}`));
      for (let i = 0; i < FAQS; i++) map.faq[i].push(add(`ev:${d}:faq_open:${i}`));
    });
    const vals = await r.mget(...keys);
    const num = (i) => Number(vals[i]) || 0;
    const series = (idxs) => idxs.map(num);
    const sum = (a) => a.reduce((x, y) => x + y, 0);

    const uniq = {};
    for (const name of ['view', 'reach_pay', 'card_copy', 'tg_click']) {
      uniq[name] = await Promise.all(days.map((d) => r.pfcount(`pf:${d}:${name}`)));
    }

    const last = await r.get('admin:last');
    let lastLogin = null;
    try { lastLogin = last ? (typeof last === 'string' ? JSON.parse(last) : last) : null; } catch (e) { lastLogin = null; }

    return send(res, 200, {
      days,
      views: series(map.views),
      uniques: uniq,
      buttons: Object.fromEntries(BUTTONS.map((b) => [b, sum(series(map.btn[b]))])),
      sources: Object.fromEntries(SOURCES.map((s) => [s, sum(series(map.src[s]))])),
      devices: { m: sum(series(map.dev.m)), d: sum(series(map.dev.d)) },
      videos: map.video.map((a) => sum(series(a))),
      faq: map.faq.map((a) => sum(series(a))),
      lastLogin,
    });
  } catch (err) {
    console.error('stats error', err && err.message);
    return send(res, 500, { error: 'server' });
  }
};
