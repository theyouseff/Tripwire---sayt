// Umumiy yordamchilar: manbani aniqlash, qurilma, geo, so'rov tanasi.

// Tayyor manbalar: qisqa kod → [utm_source, utm_medium, paneldagi nom]
export const BUILTIN_LINKS = {
  is: ["instagram_stories", "stories", "Instagram storis"],
  id: ["instagram_direct", "direct", "Instagram direct"],
  tg: ["telegram_channel", "channel", "Telegram kanal"],
  yv: ["youtube_video", "video", "YouTube video"],
  yb: ["youtube_bio", "bio", "YouTube bio"],
};
export const SOURCE_NAMES = Object.fromEntries(Object.values(BUILTIN_LINKS).map(([src, , name]) => [src, name]));

export const BOT_RE = /bot|crawl|spider|preview|lighthouse|headless|vercel|screenshot|pagespeed|gtmetrix|pingdom|uptime|facebookexternalhit|facebot|meta-external|bytespider|slurp|scrapy|monitor|checker|validator|inspect|adsbot|mediapartners|telegrambot|whatsapp|python|curl|wget|node-fetch|axios|go-http|okhttp\/[0-9.]+$|java\//i;

export function refHost(ref) {
  try { return ref ? new URL(ref).hostname.replace(/^www\./, "") : ""; } catch { return ""; }
}

// Sessiya manbai: 1) UTM (tayyor nom yoki men qo'shgan havolaning nomi), 2) referrer domeni,
// 3) referrer yo'q: sof havola → To'g'ridan-to'g'ri, ?… bor-u UTM yo'q → Boshqa havola (parametrli)
export function deriveSource(utm, ref, q, custom = {}) {
  const u = (utm && utm.utm_source ? String(utm.utm_source) : "").toLowerCase().trim();
  if (u) return SOURCE_NAMES[u] || custom[u] || u;
  const h = refHost(ref);
  if (h && !/tripwire-sayt/.test(h)) {
    if (/instagram/.test(h)) return "Instagram (UTM'siz)";
    if (/(^|\.)t\.me$|telegram/.test(h)) return "Telegram (UTM'siz)";
    if (/youtu/.test(h)) return "YouTube (UTM'siz)";
    if (/facebook|fb\.|messenger/.test(h)) return "Facebook";
    if (/google\./.test(h)) return "Google";
    if (/yandex/.test(h)) return "Yandex";
    return h;
  }
  const query = String(q || "").replace(/^\?/, "").trim();
  return query ? "Boshqa havola (parametrli)" : "To'g'ridan-to'g'ri";
}

// Kampaniya / kontent qiymatini tozalash: bo'sh joy → _, xavfli belgilar olib tashlanadi
export const cleanTag = (v) => String(v || "").trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_.-]/gu, "").slice(0, 60);

export function parseUA(ua = "") {
  const device = /iPad|Tablet/i.test(ua) ? "Planshet" : /Mobi|Android|iPhone/i.test(ua) ? "Telefon" : "Kompyuter";
  const os = /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Boshqa";
  const browser = /Instagram/i.test(ua) ? "Instagram ichida" : /Telegram/i.test(ua) ? "Telegram ichida" : /FBAN|FBAV/i.test(ua) ? "Facebook ichida"
    : /YaBrowser/i.test(ua) ? "Yandex" : /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /Chrome\//i.test(ua) ? "Chrome"
    : /Safari\//i.test(ua) ? "Safari" : /Firefox\//i.test(ua) ? "Firefox" : "Boshqa";
  return { device, os, browser };
}

export function geo(req) {
  const h = req.headers || {};
  let city = h["x-vercel-ip-city"] || "";
  try { city = decodeURIComponent(city); } catch {}
  return { country: h["x-vercel-ip-country"] || "", city };
}

export function body(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (Buffer.isBuffer(b)) { try { b = JSON.parse(b.toString("utf8")); } catch { b = null; } }
  return b && typeof b === "object" ? b : null;
}

export const clip = (v, n = 200) => (v == null ? null : String(v).slice(0, n));
