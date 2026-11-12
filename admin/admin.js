/* LOR darslar · Sayt analitikasi paneli */
const API = "/api/admin";
const SITE = location.origin + "/";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("ru-RU");
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const pctS = (a, b, d = 1) => (b ? `${pct(a, b).toFixed(d)}%` : "—");
const secs = (s) => { s = Math.round(s || 0); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };

// Saytdagi bo'limlar (sahifadagi tartibda)
const SECTION_NAMES = {
  bosh: "1. Bosh ekran", kimlar: "2. Kimlar uchun", "fikrlar-1": "3. Hamkasblar fikrlari", darslar: "4. 3 ta dars",
  qiymat: "5. Qiymati (value stack)", narx: "6. Narx (97 000)", stack: "7. Kafolat", "fikrlar-2": "8. Fikrlar (yana)",
  faq: "9. Savollar (FAQ)", dars: "10. To'lov bo'limi", sticky: "Pastki tugma (telefon)", boshqa: "Boshqa",
};
const UTM_SOURCES = [
  ["instagram_stories", "Instagram storis", "stories"],
  ["instagram_direct", "Instagram direct", "direct"],
  ["telegram_channel", "Telegram kanal", "channel"],
  ["youtube_video", "YouTube video", "video"],
  ["youtube_bio", "YouTube bio", "bio"],
];
const TITLES = { overview: "Umumiy", funnel: "Voronka", sources: "Manbalar", behavior: "Xatti-harakat", utm: "UTM havolalar", settings: "Sozlamalar" };

let ME = null, DATA = null, RANGE = "7", TAB = "overview", TIMER = null, SRC = "";

async function api(a, opts = {}) {
  const { params, body } = opts;
  const qs = new URLSearchParams({ a, ...(params || {}) });
  const res = await fetch(`${API}?${qs}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && a !== "login") { showLogin(); throw new Error("auth"); }
  if (!res.ok) throw Object.assign(new Error(data.error || res.status), { code: data.error, status: res.status });
  return data;
}

// ---------- vaqt oralig'i (Toshkent, UTC+5) ----------
function rangeDates() {
  const now = new Date();
  const tz = 5 * 3600e3;
  const dayStart = (d) => new Date(Math.floor((d.getTime() + tz) / 864e5) * 864e5 - tz);
  if (RANGE === "today") return { from: dayStart(now), to: now };
  if (RANGE === "yesterday") { const t = dayStart(now); return { from: new Date(t - 864e5), to: t }; }
  if (RANGE === "all") return { from: new Date("2024-01-01"), to: now };
  return { from: new Date(dayStart(now) - (Number(RANGE) - 1) * 864e5), to: now };
}
const rangeParams = () => { const { from, to } = rangeDates(); return { from: from.toISOString(), to: to.toISOString(), ...(SRC ? { src: SRC } : {}) }; };

// ---------- kirish ----------
function showLogin() { $("#app").hidden = true; $("#login").hidden = false; }
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  $("#loginErr").textContent = "";
  try {
    await api("login", { body: { login: f.login.value, password: f.password.value } });
    f.reset();
    boot();
  } catch (err) {
    $("#loginErr").textContent = err.code === "not_configured" ? "Panel hali sozlanmagan." : "Login yoki parol noto'g'ri.";
  }
});
$("#logout").addEventListener("click", async () => { await api("logout").catch(() => {}); showLogin(); });

async function boot() {
  try {
    const r = await api("me");
    ME = r.user;
    // Panelga kirgan qurilma saytda hisoblanmaydi
    try { if (localStorage.getItem("trk_off") === null) localStorage.setItem("trk_off", "1"); } catch {}
    $("#login").hidden = true; $("#app").hidden = false;
    $("#me").innerHTML = `<b>${esc(ME.name)}</b>${ME.role === "owner" ? "Egasi" : "Yordamchi"} · ${esc(ME.login)}`;
    $("#usersCard").hidden = ME.role !== "owner";
    let vid = null; try { vid = localStorage.getItem("trk_vid"); } catch {}
    $("#purgeBox").hidden = !(ME.role === "owner" && vid);
    syncTrk();
    if (!r.database) notice("Ma'lumotlar bazasi hali ulanmagan — statistika baza ulangandan keyin ishlaydi.");
    renderUtm();
    load();
    clearInterval(TIMER);
    TIMER = setInterval(() => { if (document.visibilityState === "visible") load(true); }, 60000);
  } catch (err) {
    if (err.code === "not_configured") { showLogin(); $("#loginErr").textContent = "Panel hali sozlanmagan."; }
  }
}
function notice(t) { const n = $("#notice"); n.textContent = t; n.hidden = !t; }

// ---------- navigatsiya ----------
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]"); if (!b) return;
  TAB = b.dataset.tab;
  $$("#tabs button").forEach((x) => x.classList.toggle("is-active", x === b));
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === TAB));
  $("#title").textContent = TITLES[TAB] + (SRC ? ` · ${SRC}` : "");
  if (TAB === "settings" && ME?.role === "owner") loadUsers();
  if (TAB === "overview" && DATA) renderChart();
});
// ---------- manba filtri ----------
const BASE_SOURCES = ["Instagram storis", "Instagram direct", "Telegram kanal", "YouTube video", "YouTube bio", "To'g'ridan-to'g'ri"];
function renderSrcSel() {
  const counts = Object.fromEntries((DATA.srcList || []).map((x) => [x.src, x.v]));
  const names = [...BASE_SOURCES, ...Object.keys(counts).filter((k) => !BASE_SOURCES.includes(k))];
  if (SRC && !names.includes(SRC)) names.push(SRC);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  $("#srcSel").innerHTML = `<option value="">Barcha manbalar · ${fmt(total)}</option>` + names.map((n) => `<option value="${esc(n)}"${n === SRC ? " selected" : ""}>${esc(n)} · ${fmt(counts[n] || 0)}</option>`).join("");
  $("#srcSel").value = SRC;
  $("#srcWrap").classList.toggle("is-active", Boolean(SRC));
  $("#title").textContent = TITLES[TAB] + (SRC ? ` · ${SRC}` : "");
}
$("#srcSel").addEventListener("change", (e) => { SRC = e.target.value; load(); });
$("#range").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-r]"); if (!b) return;
  RANGE = b.dataset.r;
  $$("#range button").forEach((x) => x.classList.toggle("is-active", x === b));
  load();
});

async function load(silent) {
  if (!silent) document.body.classList.add("loading");
  try {
    DATA = await api("stats", { params: rangeParams() });
    notice("");
    renderAll();
  } catch (err) {
    if (err.code === "no_database") notice("Ma'lumotlar bazasi hali ulanmagan — Vercel → Storage → Neon'ni ulang.");
    else if (err.message !== "auth") notice("Ma'lumotlarni yuklab bo'lmadi. Sahifani yangilab ko'ring.");
  } finally { document.body.classList.remove("loading"); }
}

function renderAll() {
  const d = DATA, k = d.kpi, f = d.funnel;
  renderSrcSel();
  $("#live").textContent = k.live;

  $("#kpis").innerHTML = [
    ["Tashrif buyuruvchilar", fmt(k.visitors), `${fmt(k.returning)} qaytib kelgan`],
    ["Sessiyalar", fmt(k.sessions), `${fmt(k.pageviews)} sahifa ko'rish`],
    ["Telegram'ga o'tdi", fmt(k.tg_visitors), `${fmt(k.tg_clicks)} marta bosilgan`, true],
    ["Konversiya", k.visitors ? `${(k.cr * 100).toFixed(2)}%` : "—", "tashrif → to'lov tugmasi", true],
    ["O'rtacha vaqt", secs(k.avg_secs), `mediana ${secs(k.med_secs)}`],
    ["Bounce", k.sessions ? `${(k.bounce * 100).toFixed(0)}%` : "—", "10 s dan kam, harakatsiz"],
  ].map(([a, b, c, acc]) => `<div class="kpi${acc ? " kpi--accent" : ""}"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join("");

  renderChart();

  const mainFunnel = [
    ["Saytga kirdi", f.visit], ["Kimlar uchun", f.kimlar], ["Hamkasblar fikrlari", f.fikrlar], ["3 ta dars", f.darslar],
    ["Qiymati (value stack)", f.qiymat], ["Narx (97 000)", f.narx], ["Kafolat", f.kafolat], ["To'lov bo'limi", f.dars],
    ["\"Darsga to'lov qilish\" bosdi", f.tg],
  ];
  $("#miniFunnel").innerHTML = bars(mainFunnel.filter((_, i) => [0, 3, 5, 7, 8].includes(i)), f.visit, true);
  $("#funnel").innerHTML = funnelHtml(mainFunnel);
  $("#payFunnel").innerHTML = funnelHtml([["To'lov bo'limini ko'rdi", f.dars], ["Tugmani bosdi (Telegram'ga o'tdi)", f.tg]]);
  $("#scroll").innerHTML = bars(["25", "50", "75", "100"].map((x) => [`${x}% gacha`, d.scroll[x] || 0]), Math.max(1, f.visit), true);
  $("#miniSources").innerHTML = bars(d.sources.slice(0, 6).map((s) => [s.src, s.visitors, `${s.tg_visitors} bosdi`]), Math.max(1, ...d.sources.map((s) => s.visitors)));

  // manbalar
  $("#sourcesTable").innerHTML = table(
    ["Manba", "Tashrif", "Sessiya", "Narxgacha", "To'lov bo'limigacha", "Tugmani bosdi", "Konversiya", "O'rt. vaqt"],
    d.sources.map((s) => [esc(s.src), fmt(s.visitors), fmt(s.sessions), pctS(s.narx, s.sessions, 0), pctS(s.dars, s.sessions, 0),
      `<b>${fmt(s.tg_visitors)}</b>`, `<span class="good">${pctS(s.tg_visitors, s.visitors)}</span>`, secs(s.avg_secs)]),
    [1, 2, 3, 4, 5, 6, 7],
  );
  $("#campaigns").innerHTML = table(["Manba", "Kampaniya", "Kontent", "Tashrif", "Bosdi"],
    d.campaigns.map((c) => [esc(c.src), esc(c.camp), esc(c.cont), fmt(c.visitors), fmt(c.tg)]), [3, 4]);
  $("#refs").innerHTML = bars(d.refs.map((r) => [r.k, r.c]), Math.max(1, ...d.refs.map((r) => r.c)));

  // xatti-harakat
  const order = ["bosh", "kimlar", "fikrlar-1", "darslar", "qiymat", "narx", "stack", "fikrlar-2", "faq", "dars"];
  $("#sections").innerHTML = bars(order.map((s) => [SECTION_NAMES[s], d.sections[s] || 0]), Math.max(1, f.visit), true);
  $("#videos").innerHTML = d.videos.length
    ? bars(d.videos.map((v) => [`${v.name} · ${v.section === "fikrlar-2" ? "2-blok" : "1-blok"}`, v.plays, `${v.sessions} kishi`]), Math.max(1, ...d.videos.map((v) => v.plays)))
    : empty();
  const TYPE_NAMES = { cta: "To'lovga o'tish", click: "Boshqa", telegram: "Telegram", faq: "Savol (FAQ)" };
  $("#clicks").innerHTML = table(["Tugma", "Turi", "Bo'lim", "Bosishlar", "Kishi"],
    d.clicks.map((c) => [esc(c.name || "—"), `<span class="tag">${TYPE_NAMES[c.type] || c.type}</span>`, esc(SECTION_NAMES[c.section] || c.section || "—"), fmt(c.clicks), fmt(c.sessions)]), [3, 4]);
  const share = (arr) => bars(arr.map((x) => [x.k, x.c]), Math.max(1, arr.reduce((a, b) => a + b.c, 0)), true);
  $("#devices").innerHTML = share(d.devices);
  $("#browsers").innerHTML = share(d.browsers);
  $("#cities").innerHTML = share(d.cities);
}

// ---------- komponentlar ----------
function bar(label, val, max, showPct, extra) {
  const w = max ? Math.max(val ? 2 : 0, (val / max) * 100) : 0;
  return `<div class="bar"><span class="bar__label" title="${esc(String(label).replace(/<[^>]+>/g, ""))}">${label}</span>
    <span class="bar__track"><span class="bar__fill" style="width:${w}%"></span></span>
    <span class="bar__val">${fmt(val)}${showPct ? `<small>${pctS(val, max, 0)}</small>` : extra ? `<small>${esc(extra)}</small>` : ""}</span></div>`;
}
function bars(rows, max, showPct) {
  if (!rows.length) return empty();
  return `<div class="bars">${rows.map(([l, v, ex]) => bar(esc(l), v, max, showPct, ex)).join("")}</div>`;
}
function funnelHtml(rows) {
  const top = rows[0]?.[1] || 0;
  return `<div class="funnel">${rows.map(([name, v], i) => {
    const prev = i ? rows[i - 1][1] : v;
    const w = top ? Math.max(v ? 3 : 0, (v / top) * 100) : 0;
    const dropTxt = i && prev && v < prev ? `<span class="drop">−${(100 - pct(v, prev)).toFixed(0)}%</span>` : "";
    return `<div class="fstep"><span class="fstep__name">${esc(name)}</span>
      <span class="fstep__bar"><span class="fstep__fill" style="width:${w}%">${fmt(v)}</span></span>
      <span class="fstep__meta"><b>${pctS(v, top)}</b>${dropTxt}</span></div>`;
  }).join("")}</div>`;
}
function table(head, rows, numCols = []) {
  if (!rows.length) return empty();
  return `<table><thead><tr>${head.map((h, i) => `<th class="${numCols.includes(i) ? "num" : ""}">${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${numCols.includes(i) ? "num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
const empty = () => `<p class="empty">Hozircha ma'lumot yo'q</p>`;

function renderChart() {
  const el = $("#chart");
  if (!el.clientWidth) return;
  const s = DATA.series;
  const keys = fillKeys(s.map((x) => x.k));
  if (!keys.length) { el.innerHTML = empty(); return; }
  const vmap = Object.fromEntries(s.map((x) => [x.k, x.v])), tmap = Object.fromEntries(s.map((x) => [x.k, x.t]));
  const V = keys.map((k) => vmap[k] || 0), L = keys.map((k) => tmap[k] || 0);
  const W = el.clientWidth || 800, H = 260, P = { l: 36, r: 12, t: 12, b: 26 };
  const max = Math.max(4, ...V), lmax = Math.max(2, ...L);
  const x = (i) => P.l + (keys.length === 1 ? (W - P.l - P.r) / 2 : (i / (keys.length - 1)) * (W - P.l - P.r));
  const y = (v) => P.t + (1 - v / max) * (H - P.t - P.b);
  const yl = (v) => H - P.b - (v / lmax) * (H - P.t - P.b) * 0.45;
  const line = V.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  const area = `${line}L${x(V.length - 1)},${H - P.b}L${x(0)},${H - P.b}Z`;
  const bw = Math.max(3, Math.min(18, (W - P.l - P.r) / keys.length * 0.35));
  const grid = [0, .25, .5, .75, 1].map((g) => { const yy = P.t + g * (H - P.t - P.b); return `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" stroke="#163d52"/><text x="${P.l - 8}" y="${yy + 4}" fill="#6f94a7" font-size="10" text-anchor="end">${Math.round(max * (1 - g))}</text>`; }).join("");
  const step = Math.ceil(keys.length / 8);
  const labels = keys.map((k, i) => i % step ? "" : `<text x="${x(i)}" y="${H - 6}" fill="#6f94a7" font-size="10" text-anchor="middle">${DATA.range.unit === "hour" ? k.slice(11, 16) : k.slice(8, 10) + "." + k.slice(5, 7)}</text>`).join("");
  const lb = L.map((v, i) => v ? `<rect x="${x(i) - bw / 2}" y="${yl(v)}" width="${bw}" height="${H - P.b - yl(v)}" rx="3" fill="#ffffff" opacity=".85"/>` : "").join("");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4fc3e8" stop-opacity=".35"/><stop offset="1" stop-color="#4fc3e8" stop-opacity="0"/></linearGradient></defs>
    ${grid}${lb}<path d="${area}" fill="url(#ga)"/><path d="${line}" fill="none" stroke="#4fc3e8" stroke-width="2.2" stroke-linejoin="round"/>
    ${labels}<rect id="hov" x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent"/></svg><div class="tip"></div>`;
  const tip = $(".tip", el);
  $("#hov", el).addEventListener("mousemove", (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(keys.length - 1, Math.round((px - P.l) / (W - P.l - P.r) * (keys.length - 1))));
    tip.style.left = `${x(i) / W * r.width}px`; tip.style.top = `${y(V[i]) / H * r.height}px`; tip.style.opacity = 1;
    tip.innerHTML = `<b>${keys[i]}</b><br>${V[i]} tashrif · ${L[i]} Telegram'ga o'tdi`;
  });
  $("#hov", el).addEventListener("mouseleave", () => (tip.style.opacity = 0));
}
function fillKeys(ks) {
  const { from, to } = rangeDates();
  const out = [];
  const tz = 5 * 3600e3;
  if (DATA.range.unit === "hour") {
    for (let t = Math.floor(from.getTime() / 36e5) * 36e5; t <= to.getTime(); t += 36e5) out.push(new Date(t + tz).toISOString().slice(0, 13).replace("T", " ") + ":00");
  } else {
    let start = from;
    if (RANGE === "all") { if (!ks.length) return []; start = new Date([...ks].sort()[0] + "T00:00:00Z"); start = new Date(start.getTime() - tz); }
    for (let t = Math.floor((start.getTime() + tz) / 864e5) * 864e5; t <= to.getTime() + tz; t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
addEventListener("resize", () => DATA && renderChart());

// ---------- UTM ----------
function renderUtm() {
  const camp = $("#utmCamp").value.trim().replace(/\s+/g, "_"), cont = $("#utmCont").value.trim().replace(/\s+/g, "_");
  $("#utmList").innerHTML = UTM_SOURCES.map(([src, name, medium]) => {
    const p = new URLSearchParams({ utm_source: src, utm_medium: medium, ...(camp ? { utm_campaign: camp } : {}), ...(cont ? { utm_content: cont } : {}) });
    const url = `${SITE}?${p}`;
    return `<div class="utm-row"><b>${name}</b><code>${esc(url)}</code><button class="btn btn--ghost" data-copy="${esc(url)}">Nusxalash</button></div>`;
  }).join("");
}
$("#utmCamp").addEventListener("input", renderUtm);
$("#utmCont").addEventListener("input", renderUtm);
$("#utmList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Nusxalandi ✓"; } catch { b.textContent = "Qo'lda nusxalang"; }
  setTimeout(() => (b.textContent = "Nusxalash"), 1500);
});

// ---------- sozlamalar ----------
async function loadUsers() {
  const { users } = await api("users");
  $("#users").innerHTML = users.length ? users.map((u) => `<div class="u-row"><span><b>${esc(u.name)}</b> <span class="muted">· ${esc(u.login)}</span></span>
    <span><button class="link" data-pass="${u.id}">Parolni o'zgartirish</button> &nbsp; <button class="link" data-del="${u.id}" style="color:var(--red)">O'chirish</button></span></div>`).join("")
    : '<p class="muted">Hali yordamchi qo\'shilmagan.</p>';
}
$("#users").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]"), pass = e.target.closest("[data-pass]");
  if (del && confirm("Bu yordamchi panelga kira olmay qoladi. O'chiraymi?")) { await api("user_del", { body: { id: Number(del.dataset.del) } }); loadUsers(); }
  if (pass) {
    const p = prompt("Yangi parol (kamida 8 belgi):");
    if (p) { try { await api("user_pass", { body: { id: Number(pass.dataset.pass), password: p } }); alert("Parol o'zgartirildi."); } catch { alert("Parol kamida 8 belgi bo'lishi kerak."); } }
  }
});
$("#userAdd").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target; $("#userErr").textContent = "";
  try {
    await api("user_add", { body: { name: f.name.value, login: f.login.value, password: f.password.value } });
    f.reset(); loadUsers();
  } catch (err) {
    $("#userErr").textContent = { bad_login: "Login 3–32 ta lotin harf/raqamdan iborat bo'lsin.", short_password: "Parol kamida 8 belgi.", exists: "Bunday login bor." }[err.code] || "Xatolik.";
  }
});
const trkOff = $("#trkOff");
function syncTrk() { try { trkOff.checked = localStorage.getItem("trk_off") === "1"; } catch {} }
trkOff.addEventListener("change", () => { try { localStorage.setItem("trk_off", trkOff.checked ? "1" : "0"); } catch {} });
$("#purgeMe").addEventListener("click", async (e) => {
  let vid = null; try { vid = localStorage.getItem("trk_vid"); } catch {}
  if (!vid || !confirm("Shu qurilmadan saytga qilingan barcha tashriflar statistikadan butunlay o'chiriladi. Davom etaymi?")) return;
  const r = await api("purge_visitor", { body: { vid } });
  e.target.textContent = `O'chirildi: ${r.deleted} ta yozuv ✓`;
  load(true);
});

boot();
