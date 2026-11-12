// Analitika paneli API: kirish, statistika, foydalanuvchilar. Marshrut: /api/admin?a=...
import { sql, ensureSchema } from "./_lib/db.js";
import * as auth from "./_lib/auth.js";
import { body, clip } from "./_lib/util.js";

const TZ = "Asia/Tashkent";

function range(q) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 7 * 864e5);
  if (isNaN(from) || isNaN(to)) return [new Date(Date.now() - 7 * 864e5), new Date()];
  return [from, to];
}
const n = (v) => Number(v) || 0;
const reached = (name) => `count(DISTINCT sid) FILTER (WHERE type='section' AND name='${name}')`;

async function stats(q) {
  const [from, to] = range(q);
  const hours = (to - from) / 36e5;
  const unit = hours <= 48 ? "hour" : "day";
  const fmt = unit === "hour" ? "YYYY-MM-DD HH24:00" : "YYYY-MM-DD";
  const R = [from.toISOString(), to.toISOString()];
  // Manba filtri: bitta manba tanlansa, hamma raqamlar faqat shu manba bo'yicha hisoblanadi
  const only = q.src ? String(q.src).slice(0, 100) : "";
  const F = only ? " AND src = $3" : "";
  const P = only ? [...R, only] : R;

  const [kpi, sess, series, funnel, sections, scroll, sources, campaigns, clicks, videos, devices, browsers, cities, refs, live, srcList] = await Promise.all([
    sql(`SELECT count(DISTINCT vid) FILTER (WHERE type='pageview') visitors,
                count(DISTINCT sid) FILTER (WHERE type='pageview') sessions,
                count(*) FILTER (WHERE type='pageview') pageviews,
                count(DISTINCT vid) FILTER (WHERE type='pageview' AND vid IN (SELECT vid FROM events WHERE type='pageview' AND ts < $1)) ret,
                count(*) FILTER (WHERE type='telegram') tg_clicks,
                count(DISTINCT sid) FILTER (WHERE type='telegram') tg_sessions,
                count(DISTINCT vid) FILTER (WHERE type='telegram') tg_visitors
         FROM events WHERE ts >= $1 AND ts < $2${F}`, P),
    sql(`WITH s AS (
           SELECT sid, max(num) FILTER (WHERE type='leave') secs,
                  count(*) FILTER (WHERE type IN ('cta','click','telegram','faq','video')) acts
           FROM events WHERE ts >= $1 AND ts < $2${F} GROUP BY sid HAVING count(*) FILTER (WHERE type='pageview') > 0)
         SELECT avg(secs) avg_secs, percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) med_secs,
                count(*) FILTER (WHERE coalesce(secs,0) < 10 AND acts = 0)::float / nullif(count(*),0) bounce
         FROM s`, P),
    sql(`SELECT to_char(date_trunc('${unit}', ts AT TIME ZONE '${TZ}'), '${fmt}') k,
                count(DISTINCT vid) FILTER (WHERE type='pageview') v,
                count(DISTINCT vid) FILTER (WHERE type='telegram') t
         FROM events WHERE type IN ('pageview','telegram') AND ts >= $1 AND ts < $2${F} GROUP BY 1 ORDER BY 1`, P),
    sql(`SELECT count(DISTINCT sid) FILTER (WHERE type='pageview') visit,
                ${reached("kimlar")} kimlar, ${reached("fikrlar-1")} fikrlar, ${reached("darslar")} darslar,
                ${reached("qiymat")} qiymat, ${reached("narx")} narx, ${reached("stack")} kafolat, ${reached("dars")} dars,
                count(DISTINCT sid) FILTER (WHERE type='cta') cta,
                count(DISTINCT sid) FILTER (WHERE type='telegram') tg
         FROM events WHERE ts >= $1 AND ts < $2${F}`, P),
    sql(`SELECT name, count(DISTINCT sid) c FROM events WHERE type='section' AND ts >= $1 AND ts < $2${F} GROUP BY name`, P),
    sql(`SELECT name, count(DISTINCT sid) c FROM events WHERE type='scroll' AND ts >= $1 AND ts < $2${F} GROUP BY name`, P),
    sql(`SELECT src, count(DISTINCT vid) FILTER (WHERE type='pageview') visitors,
                count(DISTINCT sid) FILTER (WHERE type='pageview') sessions,
                ${reached("narx")} narx, ${reached("dars")} dars,
                count(DISTINCT sid) FILTER (WHERE type='telegram') tg_sessions,
                count(DISTINCT vid) FILTER (WHERE type='telegram') tg_visitors,
                avg(num) FILTER (WHERE type='leave') avg_secs
         FROM events WHERE ts >= $1 AND ts < $2${F} GROUP BY src ORDER BY visitors DESC`, P),
    sql(`SELECT src, coalesce(utm_campaign,'—') camp, coalesce(utm_content,'—') cont,
                count(DISTINCT vid) FILTER (WHERE type='pageview') visitors,
                count(DISTINCT vid) FILTER (WHERE type='telegram') tg
         FROM events WHERE ts >= $1 AND ts < $2${F} AND (utm_campaign IS NOT NULL OR utm_content IS NOT NULL)
         GROUP BY 1,2,3 ORDER BY visitors DESC LIMIT 50`, P),
    sql(`SELECT type, name, coalesce(section,'') section, count(*) clicks, count(DISTINCT sid) sessions
         FROM events WHERE type IN ('cta','click','telegram','faq') AND ts >= $1 AND ts < $2${F}
         GROUP BY 1,2,3 ORDER BY clicks DESC LIMIT 60`, P),
    sql(`SELECT coalesce(section,'') section, min(num) idx, name, count(*) plays, count(DISTINCT sid) sessions
         FROM events WHERE type='video' AND ts >= $1 AND ts < $2${F} GROUP BY 1,3 ORDER BY 1, 2`, P),
    sql(`SELECT device k, count(DISTINCT vid) c FROM events WHERE type='pageview' AND ts >= $1 AND ts < $2${F} GROUP BY 1 ORDER BY 2 DESC`, P),
    sql(`SELECT browser k, count(DISTINCT vid) c FROM events WHERE type='pageview' AND ts >= $1 AND ts < $2${F} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, P),
    sql(`SELECT coalesce(nullif(city,''),'Noma''lum') k, count(DISTINCT vid) c FROM events WHERE type='pageview' AND ts >= $1 AND ts < $2${F} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, P),
    sql(`SELECT coalesce(nullif(ref_host,''),'(to''g''ridan-to''g''ri)') k, count(DISTINCT sid) c FROM events WHERE type='pageview' AND ts >= $1 AND ts < $2${F} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, P),
    sql(`SELECT count(DISTINCT sid) c FROM events WHERE ts > now() - interval '5 minutes'${only ? " AND src = $1" : ""}`, only ? [only] : []),
    sql(`SELECT src, count(DISTINCT vid) v FROM events WHERE type='pageview' AND ts >= $1 AND ts < $2 GROUP BY 1 ORDER BY 2 DESC`, R),
  ]);

  const k = kpi[0] || {};
  const s = sess[0] || {};
  const visitors = n(k.visitors);
  return {
    range: { from, to, unit },
    kpi: {
      visitors, sessions: n(k.sessions), pageviews: n(k.pageviews), returning: n(k.ret),
      tg_clicks: n(k.tg_clicks), tg_sessions: n(k.tg_sessions), tg_visitors: n(k.tg_visitors),
      cr: visitors ? n(k.tg_visitors) / visitors : 0,
      avg_secs: Math.round(n(s.avg_secs)), med_secs: Math.round(n(s.med_secs)), bounce: n(s.bounce), live: n(live[0]?.c),
    },
    series: series.map((r) => ({ k: r.k, v: n(r.v), t: n(r.t) })),
    funnel: Object.fromEntries(Object.entries(funnel[0] || {}).map(([a, b]) => [a, n(b)])),
    sections: Object.fromEntries(sections.map((r) => [r.name, n(r.c)])),
    scroll: Object.fromEntries(scroll.map((r) => [r.name, n(r.c)])),
    srcList: srcList.map((r) => ({ src: r.src || "—", v: n(r.v) })),
    sources: sources.map((r) => ({ src: r.src || "—", visitors: n(r.visitors), sessions: n(r.sessions), narx: n(r.narx), dars: n(r.dars),
      tg_sessions: n(r.tg_sessions), tg_visitors: n(r.tg_visitors), avg_secs: Math.round(n(r.avg_secs)) })),
    campaigns: campaigns.map((r) => ({ src: r.src, camp: r.camp, cont: r.cont, visitors: n(r.visitors), tg: n(r.tg) })),
    clicks: clicks.map((r) => ({ type: r.type, name: r.name, section: r.section, clicks: n(r.clicks), sessions: n(r.sessions) })),
    videos: videos.map((r) => ({ section: r.section, idx: n(r.idx), name: r.name, plays: n(r.plays), sessions: n(r.sessions) })),
    devices: devices.map((r) => ({ k: r.k, c: n(r.c) })),
    browsers: browsers.map((r) => ({ k: r.k, c: n(r.c) })),
    cities: cities.map((r) => ({ k: r.k, c: n(r.c) })),
    refs: refs.map((r) => ({ k: r.k, c: n(r.c) })),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const a = req.query.a || "";
  const send = (code, obj) => res.status(code).json(obj);

  try {
    if (!auth.configured()) return send(503, { error: "not_configured" });
    if (sql) await ensureSchema();

    if (a === "login" && req.method === "POST") {
      const b = body(req) || {};
      const user = await auth.login(sql, b.login, b.password);
      if (!user) { await new Promise((r) => setTimeout(r, 700)); return send(401, { error: "bad_login" }); }
      auth.issue(res, user);
      return send(200, { user });
    }
    if (a === "logout") { auth.clear(res); return send(200, { ok: true }); }

    let me = auth.current(req);
    if (me && me.role !== "owner" && sql) {
      const still = await sql`SELECT 1 FROM users WHERE login = ${me.login}`;
      if (!still.length) me = null;
    }
    if (!me) return send(401, { error: "auth" });
    if (a === "me") return send(200, { user: me, database: Boolean(sql) });
    if (!sql) return send(503, { error: "no_database" });

    if (a === "stats") return send(200, await stats(req.query));

    // ---- Bitta qurilmaning tashriflarini o'chirish (faqat egasi): sinov / o'z tashriflari ----
    if (a === "purge_visitor" && req.method === "POST") {
      if (me.role !== "owner") return send(403, { error: "owner_only" });
      const b = body(req) || {};
      if (!b.vid) return send(400, { error: "vid" });
      const r = await sql`DELETE FROM events WHERE vid = ${String(b.vid)} RETURNING id`;
      return send(200, { ok: true, deleted: r.length });
    }

    // ---- Foydalanuvchilar (faqat egasi) ----
    if (a.startsWith("user")) {
      if (me.role !== "owner") return send(403, { error: "owner_only" });
      if (a === "users") return send(200, { users: await sql`SELECT id, login, name, role, created_at FROM users ORDER BY created_at` });
      const b = body(req) || {};
      if (a === "user_add" && req.method === "POST") {
        const login = String(b.login || "").toLowerCase().trim();
        if (!/^[a-z0-9._-]{3,32}$/.test(login) || login === auth.OWNER_LOGIN) return send(400, { error: "bad_login" });
        if (String(b.password || "").length < 8) return send(400, { error: "short_password" });
        const exists = await sql`SELECT 1 FROM users WHERE login = ${login}`;
        if (exists.length) return send(409, { error: "exists" });
        await sql`INSERT INTO users (login, name, pass_hash, role) VALUES (${login}, ${clip(b.name, 60) || login}, ${auth.hashPassword(String(b.password))}, 'assistant')`;
        return send(200, { ok: true });
      }
      if (a === "user_del" && req.method === "POST") {
        await sql`DELETE FROM users WHERE id = ${Number(b.id)}`;
        return send(200, { ok: true });
      }
      if (a === "user_pass" && req.method === "POST") {
        if (String(b.password || "").length < 8) return send(400, { error: "short_password" });
        await sql`UPDATE users SET pass_hash = ${auth.hashPassword(String(b.password))} WHERE id = ${Number(b.id)}`;
        return send(200, { ok: true });
      }
    }
    return send(404, { error: "unknown" });
  } catch (err) {
    console.error("admin error", err);
    return send(500, { error: "server" });
  }
}
