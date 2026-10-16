'use strict';
const getRedis = require('../../lib/redis');
const { send, readJson } = require('../../lib/http');
const { isAdmin, clearCookieHeader } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  try {
    let body = {};
    try { body = await readJson(req, 512); } catch (e) { body = {}; }
    // "Barcha qurilmalardan chiqish": epoch oshiriladi, eski cookie'lar yaroqsiz bo'ladi
    if (body && body.all === true && (await isAdmin(req))) await getRedis().incr('admin:epoch');
    return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookieHeader(req) });
  } catch (err) {
    return send(res, 500, { error: 'server' });
  }
};
