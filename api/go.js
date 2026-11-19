// Qisqa UTM havolalar: /go/<kod>?c=kampaniya&k=kontent → /?utm_source=…&utm_medium=…&utm_campaign=…&utm_content=…
// Noma'lum kod → bosh sahifa. Hech qachon xato bermaydi.
import { sql } from "./_lib/db.js";
import { BUILTIN_LINKS, cleanTag } from "./_lib/util.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const code = String(req.query.code || "").toLowerCase().trim().slice(0, 40);
  let target = "/";
  try {
    let source = null, medium = null;
    if (BUILTIN_LINKS[code]) [source, medium] = BUILTIN_LINKS[code];
    else if (sql && /^[a-z0-9_-]{2,40}$/.test(code)) {
      // ensureSchema chaqirilmaydi: jadval yo'q bo'lsa — xato ushlanadi va bosh sahifaga yo'naltiriladi
      const rows = await sql`SELECT code FROM utm_links WHERE code = ${code}`;
      if (rows[0]) { source = rows[0].code; medium = "link"; }
    }
    if (source) {
      const p = new URLSearchParams({ utm_source: source, utm_medium: medium });
      const c = cleanTag(req.query.c), k = cleanTag(req.query.k);
      if (c) p.set("utm_campaign", c);
      if (k) p.set("utm_content", k);
      target = `/?${p}`;
    }
  } catch (err) {
    console.error("go error", err.message);
  }
  res.statusCode = 302;
  res.setHeader("Location", target);
  res.end();
}
