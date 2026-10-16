// Parol tekshirish va "ishonchli qurilma" cookie'si. IP ga tayanilmaydi (Wi-Fi almashganda IP o'zgaradi).
'use strict';
const crypto = require('crypto');
const getRedis = require('./redis');

const COOKIE = 'tw_admin';
const MAX_AGE = 365 * 24 * 3600; // 1 yil

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.VERCEL) throw new Error('SESSION_SECRET o\'rnatilmagan (kamida 16 belgi)');
  return 'dev-only-secret-change-me';
}

const b64 = (b) => Buffer.from(b).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// "scrypt$<saltHex>$<hashHex>"
function verifyPassword(password, stored) {
  try {
    if (!stored || typeof password !== 'string' || password.length > 200) return false;
    const [alg, saltHex, hashHex] = stored.split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const got = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(got, expected);
  } catch (e) { return false; }
}

async function currentEpoch() {
  const v = await getRedis().get('admin:epoch');
  return Number(v) || 0;
}

async function makeToken() {
  const payload = b64(JSON.stringify({ v: 1, iat: Date.now(), ep: await currentEpoch() }));
  return payload + '.' + hmac(payload);
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

async function isAdmin(req) {
  try {
    const token = parseCookies(req)[COOKIE];
    if (!token) return false;
    const [payload, sig] = token.split('.');
    if (!payload || !sig || !safeEqual(sig, hmac(payload))) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || Date.now() - data.iat > MAX_AGE * 1000) return false;
    return data.ep === (await currentEpoch());
  } catch (e) { return false; }
}

function isSecure(req) {
  return !!process.env.VERCEL || String(req.headers['x-forwarded-proto'] || '') === 'https';
}

function setCookieHeader(req, token) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE}${isSecure(req) ? '; Secure' : ''}`;
}
function clearCookieHeader(req) {
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isSecure(req) ? '; Secure' : ''}`;
}

module.exports = { verifyPassword, makeToken, isAdmin, setCookieHeader, clearCookieHeader, currentEpoch };
