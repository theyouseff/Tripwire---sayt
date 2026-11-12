// Saytdan kelgan analitika hodisalarini bazaga yozadi. Doim 204 qaytaradi — sayt hech qachon sinmaydi.
import { sql, ensureSchema } from "./_lib/db.js";
import { deriveSource, parseUA, geo, body, clip, refHost, BOT_RE } from "./_lib/util.js";

const TYPES = new Set(["pageview", "section", "scroll", "click", "cta", "telegram", "faq", "video", "leave"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const b = body(req);
  if (!b || !Array.isArray(b.events) || !b.sid || !b.vid) return res.status(204).end();
  if (!sql) return res.status(204).end();
  const ua = req.headers["user-agent"] || "";
  if (!ua || BOT_RE.test(ua)) return res.status(204).end();

  try {
    await ensureSchema();
    const utm = b.utm && typeof b.utm === "object" ? b.utm : {};
    const src = deriveSource(utm, b.ref);
    const { device, os, browser } = parseUA(ua);
    const { country, city } = geo(req);
    const host = refHost(b.ref);

    const evs = b.events.slice(0, 50).filter((e) => e && TYPES.has(e.type));
    if (!evs.length) return res.status(204).end();
    const cols = 18;
    const values = [];
    const rows = evs.map((e, i) => {
      const num = Number.isFinite(e.ms) ? Math.min(Math.round(e.ms / 1000), 86400)
        : Number.isFinite(e.idx) ? e.idx : null;
      const meta = {};
      if (e.scroll != null) meta.scroll = Number(e.scroll) || 0;
      if (e.screen) meta.screen = clip(e.screen, 20);
      if (e.lang) meta.lang = clip(e.lang, 20);
      values.push(
        clip(b.vid, 40), clip(b.sid, 40), e.type, clip(e.name, 120), clip(e.section, 40), num,
        src, clip(utm.utm_source, 100), clip(utm.utm_medium, 100), clip(utm.utm_campaign, 100), clip(utm.utm_content, 100),
        clip(host, 100), device, os, browser, clip(country, 8), clip(city, 80),
        Object.keys(meta).length ? JSON.stringify(meta) : null,
      );
      return "(" + Array.from({ length: cols }, (_, j) => `$${i * cols + j + 1}`).join(",") + ")";
    });
    await sql(
      `INSERT INTO events (vid, sid, type, name, section, num, src, utm_source, utm_medium, utm_campaign, utm_content, ref_host, device, os, browser, country, city, meta) VALUES ${rows.join(",")}`,
      values,
    );
    return res.status(204).end();
  } catch (err) {
    console.error("track error", err.message);
    return res.status(204).end();
  }
}
