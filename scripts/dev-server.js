// Lokal sinov serveri: statik fayllar + /api funksiyalari (Vercel o'rniga).
// Ishlatish: ADMIN_PASSWORD_HASH=... node scripts/dev-server.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const port = Number(process.argv[2]) || 8766;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/')) {
    const file = path.join(root, u.pathname.replace(/\/$/, '') + '.js');
    if (!file.startsWith(path.join(root, 'api')) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
    try { return await require(file)(req, res); } catch (e) { console.error(e); res.statusCode = 500; return res.end('error'); }
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (fs.existsSync(path.join(file, 'index.html'))) { res.statusCode = 302; res.setHeader('Location', p + '/'); return res.end(); }
    res.statusCode = 404; return res.end('not found');
  }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log('dev server: http://localhost:' + port));
