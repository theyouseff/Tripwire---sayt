'use strict';
const getRedis = require('../../lib/redis');
const { send, getIp, readJson } = require('../../lib/http');
const { verifyPassword, makeToken, setCookieHeader } = require('../../lib/auth');

const MAX_FAILS = 5;
const BLOCK_SEC = 15 * 60;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  try {
    const r = getRedis();
    const ip = getIp(req);
    const failKey = `rl:login:${ip}`;
    const fails = Number(await r.get(failKey)) || 0;
    if (fails >= MAX_FAILS) return send(res, 429, { error: 'Juda ko\'p urinish. 15 daqiqadan keyin qayta urinib ko\'ring.' });

    let body;
    try { body = await readJson(req, 1024); } catch (e) { return send(res, e.code || 400, { error: 'bad body' }); }

    const stored = process.env.ADMIN_PASSWORD_HASH;
    if (!stored) return send(res, 500, { error: 'ADMIN_PASSWORD_HASH o\'rnatilmagan' });

    if (!verifyPassword(body && body.password, stored)) {
      const n = await r.incr(failKey);
      if (n === 1) await r.expire(failKey, BLOCK_SEC);
      return send(res, 401, { error: 'Parol noto\'g\'ri.' });
    }

    await r.del(failKey);
    await r.set('admin:last', JSON.stringify({ ip, at: Date.now() }));
    return send(res, 200, { ok: true }, { 'Set-Cookie': setCookieHeader(req, await makeToken()) });
  } catch (err) {
    console.error('login error', err && err.message);
    return send(res, 500, { error: 'server' });
  }
};
