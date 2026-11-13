/* =========================================================
   Sayt analitikasi — /api/track ga hodisalarni yuboradi.
   Tashrif (vid), sessiya (sid), manba (UTM / referrer),
   bo'limlarga yetib borish, scroll, bosishlar, video sharhlar.
   window.TRK = { track(type, name, extra), ctx() }
   ========================================================= */
(() => {
  // Sahifa fonda/oldindan yuklangan bo'lsa (havola ko'rinishi, prerender) odam hali ko'rmagan — hisoblamaymiz,
  // faqat sahifa haqiqatan ko'rinadigan bo'lganda boshlaymiz.
  function boot() {
  const ENDPOINT = "/api/track";
  const SESSION_IDLE = 30 * 60 * 1000;
  const off = { track() {}, ctx: () => ({}) };
  const store = (s) => { try { return window[s]; } catch { return null; } };
  const ls = store("localStorage");
  const ss = store("sessionStorage");
  const get = (st, k) => { try { return st && st.getItem(k); } catch { return null; } };
  const set = (st, k, v) => { try { st && st.setItem(k, v); } catch {} };
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  // Robotlar, Vercel skrinshotlari va panel egasining qurilmasi hisoblanmaydi
  const UA = navigator.userAgent || "";
  if (navigator.webdriver || /bot|crawl|spider|preview|lighthouse|headless|vercel|screenshot|pagespeed|gtmetrix|pingdom|uptime|facebookexternalhit|facebot|meta-external|bytespider|monitor|checker|validator|inspect|adsbot|telegrambot|whatsapp|python|curl|wget/i.test(UA)) {
    window.TRK = off; return;
  }
  const params = new URLSearchParams(location.search);
  if (params.has("notrack")) set(ls, "trk_off", "1");
  if (get(ls, "trk_off") === "1") { window.TRK = off; return; }

  let vid = get(ls, "trk_vid");
  if (!vid) { vid = rid(); set(ls, "trk_vid", vid); }

  const now = Date.now();
  let sid = get(ss, "trk_sid");
  const last = Number(get(ss, "trk_last") || 0);
  const hasUtm = [...params.keys()].some((k) => k.startsWith("utm_"));
  if (!sid || now - last > SESSION_IDLE || hasUtm) {
    sid = rid();
    set(ss, "trk_sid", sid);
    set(ss, "trk_seen", "[]");
    const utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((k) => {
      if (params.get(k)) utm[k] = params.get(k).slice(0, 100);
    });
    set(ss, "trk_src", JSON.stringify({ utm, ref: document.referrer.slice(0, 300) }));
  }
  set(ss, "trk_last", String(now));
  let src = { utm: {}, ref: "" };
  try { src = JSON.parse(get(ss, "trk_src") || "") || src; } catch {}

  const queue = [];
  let timer = null;
  function flush(useBeacon) {
    if (!queue.length) return;
    const body = JSON.stringify({ vid, sid, utm: src.utm, ref: src.ref, path: location.pathname, events: queue.splice(0, 50) });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
    } else {
      fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
    }
  }
  function track(type, name, extra) {
    queue.push({ type, name: name == null ? null : String(name).slice(0, 120), t: Date.now(), ...(extra || {}) });
    set(ss, "trk_last", String(Date.now()));
    clearTimeout(timer);
    // Telegram'ga o'tishda sahifa yopilishi mumkin — darhol yuboramiz
    if (type === "telegram") flush(true);
    else timer = setTimeout(() => flush(false), type === "pageview" ? 0 : 1500);
  }
  window.TRK = { track, ctx: () => ({ vid, sid, utm: src.utm, ref: src.ref }) };

  track("pageview", location.pathname, { screen: `${screen.width}x${screen.height}`, lang: navigator.language });

  // ---- Bo'limlarga yetib borish (har sessiyada bir marta) ----
  let seen;
  try { seen = new Set(JSON.parse(get(ss, "trk_seen") || "[]")); } catch { seen = new Set(); }
  const sections = document.querySelectorAll("section[id]");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        // 25% ko'rinsa yoki (juda uzun bo'limlar uchun) ekranning yarmini egallasa
        if (!e.isIntersecting || (e.intersectionRatio < 0.25 && e.intersectionRect.height < innerHeight * 0.5)) return;
        const id = e.target.id;
        io.unobserve(e.target);
        if (seen.has(id)) return;
        seen.add(id);
        set(ss, "trk_seen", JSON.stringify([...seen]));
        track("section", id);
      });
    }, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
    sections.forEach((s) => io.observe(s));
  }

  // ---- Scroll chuqurligi ----
  const hit = new Set();
  let maxScroll = 0;
  function onScroll() {
    const h = document.documentElement.scrollHeight - innerHeight;
    const p = h > 0 ? Math.min(100, Math.round((scrollY / h) * 100)) : 100;
    if (p > maxScroll) maxScroll = p;
    [25, 50, 75, 100].forEach((d) => { if (p >= d - 2 && !hit.has(d)) { hit.add(d); track("scroll", String(d)); } });
  }
  addEventListener("scroll", onScroll, { passive: true });

  // ---- Bosishlar ----
  const label = (el) => (el.dataset.trk || el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const sectionOf = (el) => el.closest("section[id]")?.id || (el.closest(".sticky") ? "sticky" : "boshqa");
  document.addEventListener("click", (e) => {
    // Video sharhlar (krujoklar): kattalashib, ovoz bilan o'ynaydi
    const circle = e.target.closest(".circle.embed");
    if (circle) {
      if (!circle.classList.contains("expanded")) {
        const list = [...circle.parentElement.querySelectorAll(".circle.embed")];
        const idx = list.indexOf(circle) + 1;
        track("video", `Fikr ${idx}`, { idx, section: sectionOf(circle) });
      }
      return;
    }
    const el = e.target.closest("a, button, summary");
    if (!el) return;
    let kind = "click";
    if (el.matches("summary")) {
      if (el.parentElement && el.parentElement.classList.contains("is-open")) return; // yopilishini hisoblamaymiz
      kind = "faq";
    } else if (el.matches('a[href*="t.me/"]')) kind = "telegram";
    else if (el.matches('a[href="#dars"]')) kind = "cta";
    track(kind, label(el), { section: sectionOf(el) });
  }, true);

  // ---- Faol vaqt (sahifa ko'rinib turgan vaqt) ----
  let active = 0;
  let since = document.visibilityState === "visible" ? Date.now() : 0;
  function leave() {
    if (since) { active += Date.now() - since; since = 0; }
    track("leave", null, { ms: active, scroll: maxScroll });
    flush(true);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leave();
    else since = Date.now();
  });
  addEventListener("pagehide", () => { if (since) leave(); });
  }
  if (document.visibilityState === "visible") boot();
  else {
    const h = () => { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", h); boot(); } };
    document.addEventListener("visibilitychange", h);
  }
})();
