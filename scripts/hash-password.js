// Ishlatish: node scripts/hash-password.js "sizning-parolingiz"
// Natijani Vercel'da ADMIN_PASSWORD_HASH o'zgaruvchisiga qo'ying.
const crypto = require('crypto');
const pw = process.argv[2];
if (!pw || pw.length < 10) { console.error('Parol kamida 10 belgidan iborat bo\'lsin.\nIshlatish: node scripts/hash-password.js "parol"'); process.exit(1); }
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(pw, salt, 64);
console.log('scrypt$' + salt.toString('hex') + '$' + hash.toString('hex'));
