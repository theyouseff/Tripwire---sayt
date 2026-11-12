// Neon Postgres ulanishi va jadvallar (birinchi so'rovda avtomatik yaratiladi).
import { neon } from "@neondatabase/serverless";

const URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
// globalThis.__TEST_SQL__ — faqat mahalliy sinov uchun (xotiradagi Postgres)
export const sql = globalThis.__TEST_SQL__ || (URL ? neon(URL) : null);

let ready = null;
export function ensureSchema() {
  if (!sql) return Promise.reject(new Error("no_database"));
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        vid TEXT, sid TEXT,
        type TEXT NOT NULL, name TEXT, section TEXT, num INTEGER,
        src TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT,
        ref_host TEXT, device TEXT, os TEXT, browser TEXT, country TEXT, city TEXT,
        meta JSONB
      )`;
      await sql`CREATE INDEX IF NOT EXISTS events_ts ON events (ts)`;
      await sql`CREATE INDEX IF NOT EXISTS events_type_ts ON events (type, ts)`;
      await sql`CREATE INDEX IF NOT EXISTS events_sid ON events (sid)`;
      await sql`CREATE INDEX IF NOT EXISTS events_vid ON events (vid)`;
      await sql`CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY, login TEXT UNIQUE NOT NULL, name TEXT,
        pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'assistant',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      // Bir martalik tozalash: ishga tushirishdan oldingi sinov/robot yozuvlari (faqat bir marta ishlaydi)
      await sql`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now())`;
      const first = await sql`INSERT INTO meta (k) VALUES ('reset_launch_2026_11') ON CONFLICT DO NOTHING RETURNING k`;
      if (first.length) await sql`DELETE FROM events`;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}
