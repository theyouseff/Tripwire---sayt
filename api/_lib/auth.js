// Panelga kirish: egasi (ADMIN_LOGIN / ADMIN_PASSWORD) va bazadagi yordamchilar.
import crypto from "node:crypto";

const SECRET = process.env.SESSION_SECRET || "";
export const OWNER_LOGIN = (process.env.ADMIN_LOGIN || "admin").toLowerCase();
const OWNER_PASS = process.env.ADMIN_PASSWORD || "";
const COOKIE = "adm";
const TTL = 30 * 24 * 3600 * 1000;

const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  return safeEq(crypto.scryptSync(pw, salt, 32).toString("hex"), hash);
}

export function issue(res, user) {
  const payload = b64(JSON.stringify({ u: user.login, n: user.name || user.login, r: user.role, exp: Date.now() + TTL }));
  const token = `${payload}.${sign(payload)}`;
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL / 1000}`);
}
export function clear(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
export function current(req) {
  if (!SECRET) return null;
  const raw = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!payload || !sig || !safeEq(sign(payload), sig)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (d.exp < Date.now()) return null;
    return { login: d.u, name: d.n, role: d.r };
  } catch { return null; }
}

export async function login(sql, loginName, pw) {
  const l = String(loginName || "").toLowerCase().trim();
  if (!l || !pw) return null;
  if (OWNER_PASS && l === OWNER_LOGIN && safeEq(pw, OWNER_PASS)) {
    return { login: OWNER_LOGIN, name: "Egasi", role: "owner" };
  }
  if (!sql) return null;
  const rows = await sql`SELECT login, name, pass_hash, role FROM users WHERE login = ${l}`;
  if (rows[0] && checkPassword(pw, rows[0].pass_hash)) return { login: rows[0].login, name: rows[0].name, role: rows[0].role };
  return null;
}

export const configured = () => Boolean(SECRET && OWNER_PASS);
