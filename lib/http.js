'use strict';

function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  if (headers) Object.keys(headers).forEach((k) => res.setHeader(k, headers[k]));
  if (body === undefined || body === null) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// JSON tanani o'qiydi (Vercel req.body ni o'zi beradi; lokal serverda oqimdan o'qiymiz). Max 2 KB.
function readJson(req, max = 2048) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null && req.body !== '') {
      if (typeof req.body === 'object') return resolve(req.body);
      try { return resolve(JSON.parse(req.body)); } catch (e) { return reject(Object.assign(new Error('bad json'), { code: 400 })); }
    }
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(Object.assign(new Error('bad json'), { code: 400 })); }
    });
    req.on('error', reject);
  });
}

// Toshkent vaqti (UTC+5) bo'yicha kun: YYYY-MM-DD
function dayKey(offsetDays = 0) {
  return new Date(Date.now() + 5 * 3600e3 - offsetDays * 86400e3).toISOString().slice(0, 10);
}

module.exports = { send, getIp, readJson, dayKey };
