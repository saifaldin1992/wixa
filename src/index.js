// WIXA — Cloudflare Worker: serves the site (public/) and the API.
//
// Built to stay fast under heavy traffic:
//  • Site content is read from Supabase at most once a minute per edge location
//    (isolate memory + Cloudflare edge cache), never once per visitor.
//  • The homepage HTML gets that content injected, so a visit needs no extra API round trip.
//  • The contact form is rate limited per IP, checked by Turnstile and written through a
//    token-checked database function, so nobody can write to the database directly.
//  • Visits are counted by Cloudflare Web Analytics, not by this Worker.

import { PRIVACY_DEFAULTS } from "../public/js/privacy-defaults.js";

const SITE_TTL = 60; // seconds the site content may be served from cache
// Keep in sync with public/_headers. The sha256 is the inline theme script in index.html.
const CSP = "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://challenges.cloudflare.com 'sha256-NVKT0UrdROLsGcatClpvEhxXytwpjLyEshzIKuByDnE='; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://cloudflareinsights.com https://*.supabase.co https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";
const SECURITY_HEADERS = {
  "content-security-policy": CSP,
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
};

const json = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers: { ...SECURITY_HEADERS, ...headers } });

function sb(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json", ...(init.headers || {}) },
  });
}

// ---------------------------------------------------------------- site content (cached)
let memo = { at: 0, checked: 0, text: null }; // per-isolate copy
let health = { at: 0, supabase: "unknown" };

async function loadFromSupabase(env) {
  const q = (t) => sb(env, `${t}?select=*&published=eq.true&order=sort.asc,created_at.asc`).then((r) => {
    if (!r.ok) throw new Error(`${t} ${r.status}`);
    return r.json();
  });
  const [settings, projects, services, partners, testimonials] = await Promise.all([
    sb(env, "site_settings?select=data&id=eq.1").then((r) => { if (!r.ok) throw new Error(`settings ${r.status}`); return r.json(); }),
    q("projects"), q("services"), q("partners"), q("testimonials"),
  ]);
  return JSON.stringify({
    env: env.SITE_ENV || "production",
    turnstile: env.TURNSTILE_SITE_KEY || "",
    settings: settings[0]?.data || {},
    projects: withSlugs(projects), services, partners, testimonials,
  });
}

// Stale-while-revalidate: a visit never waits for the database if any copy exists. Copies younger than
// SITE_TTL are served as they are; older ones are served at once and refreshed in the background.
let refreshing = null;
async function getSiteData(env, ctx) {
  const now = Date.now();
  if (memo.text && now - memo.checked < 5000 && now - memo.at < SITE_TTL * 1000) return memo.text;

  const cache = caches.default;
  const key = new Request(`https://wixa-cache.internal/site-data/${env.SITE_ENV || "production"}`);
  const refresh = () => (refreshing ??= loadFromSupabase(env)
    .then((text) => {
      memo = { at: Date.now(), checked: Date.now(), text };
      return cache.put(key, new Response(text, { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400", "x-saved-at": String(Date.now()) } })).then(() => text);
    })
    .finally(() => { refreshing = null; }));

  const hit = await cache.match(key);
  if (hit) {
    const at = Number(hit.headers.get("x-saved-at")) || 0;
    if (!memo.text || at > memo.at) memo = { at, checked: now, text: await hit.text() };
  }
  memo.checked = now;
  if (memo.text) {
    if (now - memo.at >= SITE_TTL * 1000) ctx.waitUntil(refresh().catch((err) => console.error("site data refresh", err)));
    return memo.text;
  }
  try {
    return await refresh();
  } catch (err) {
    console.error("site data", err);
    return JSON.stringify({ env: env.SITE_ENV || "production", turnstile: env.TURNSTILE_SITE_KEY || "", settings: {}, projects: [], services: [], partners: [], testimonials: [] });
  }
}

// Reload the content from the database now and replace the shared copy at this location (dashboard "publish now").
async function publishNow(env) {
  const text = await loadFromSupabase(env);
  memo = { at: Date.now(), checked: Date.now(), text };
  await caches.default.put(new Request(`https://wixa-cache.internal/site-data/${env.SITE_ENV || "production"}`),
    new Response(text, { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400", "x-saved-at": String(Date.now()) } }));
}

// ---------------------------------------------------------------- integrations (private settings)
// Set from the dashboard (Integrations page) and kept in the private Cloudflare store, never sent to visitors as a whole.
const CONFIG_DEFAULTS = {
  alerts: { on: true, from_name: "WIXA" },
  autoreply: {
    on: false,
    subject_ar: "وصلتنا رسالتك — ويكسا",
    body_ar: "أهلاً {name}،\n\nشكراً لتواصلك مع ويكسا. وصلتنا رسالتك وسيتواصل معك أحد أفراد فريقنا في أقرب وقت.\n\nمع التحية،\nفريق ويكسا",
    subject_en: "We got your message — WIXA",
    body_en: "Hi {name},\n\nThank you for contacting WIXA. We have received your message and a member of our team will get back to you soon.\n\nBest regards,\nThe WIXA team",
  },
  spam: { turnstile: true, blocked: "" },
  tags: { ga4: "", meta_pixel: "", clarity: "", tiktok: "" },
  reports: { weekly: true, monitor: true },
  maintenance: {
    on: false,
    message_ar: "نعمل على تحديث الموقع وسنعود قريباً. للتواصل العاجل راسلنا عبر البريد أو واتساب.",
    message_en: "We are updating the site and will be back shortly. For anything urgent, reach us by email or WhatsApp.",
    bypass: "",
  },
};
const TAG_RULES = { ga4: /^G-[A-Z0-9]{4,15}$/, meta_pixel: /^\d{8,20}$/, clarity: /^[a-z0-9]{6,20}$/, tiktok: /^[A-Z0-9]{10,30}$/ };
const deepMerge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" ? deepMerge(a[k], v) : v;
  return out;
};
let cfgMemo = { at: 0, v: null };
async function getConfig(env) {
  if (cfgMemo.v && Date.now() - cfgMemo.at < 15_000) return cfgMemo.v;
  const raw = env.PRIVATE ? await env.PRIVATE.get("config", { type: "json", cacheTtl: 30 }).catch(() => null) : null;
  cfgMemo = { at: Date.now(), v: deepMerge(CONFIG_DEFAULTS, raw || {}) };
  return cfgMemo.v;
}
// Keep only known fields, with safe lengths and formats.
function cleanConfig(prev, body) {
  const str = (v, max) => String(v ?? "").replace(/\r/g, "").slice(0, max);
  const next = deepMerge(prev, {});
  const b = body || {};
  if (b.alerts) next.alerts = { on: b.alerts.on !== false, from_name: str(b.alerts.from_name, 40).replace(/[<>"@,;\n]/g, "").trim() || "WIXA" };
  if (b.autoreply) {
    const a = b.autoreply, d = CONFIG_DEFAULTS.autoreply;
    next.autoreply = { on: a.on === true,
      subject_ar: str(a.subject_ar, 120).replace(/\n/g, " ").trim() || d.subject_ar, body_ar: str(a.body_ar, 2000).trim() || d.body_ar,
      subject_en: str(a.subject_en, 120).replace(/\n/g, " ").trim() || d.subject_en, body_en: str(a.body_en, 2000).trim() || d.body_en };
  }
  if (b.reports) next.reports = { weekly: b.reports.weekly !== false, monitor: b.reports.monitor !== false };
  if (b.spam) next.spam = { turnstile: b.spam.turnstile !== false, blocked: str(b.spam.blocked, 3000) };
  if (b.tags) {
    next.tags = {};
    for (const [k, re] of Object.entries(TAG_RULES)) {
      let v = str(b.tags[k], 40).trim();
      if (k === "clarity") v = v.toLowerCase(); else if (k !== "meta_pixel") v = v.toUpperCase();
      if (v && !re.test(v)) throw Object.assign(new Error("bad_tag"), { field: k });
      next.tags[k] = v;
    }
  }
  if (b.maintenance) {
    const m = b.maintenance, d = CONFIG_DEFAULTS.maintenance;
    next.maintenance = { on: m.on === true, message_ar: str(m.message_ar, 500).trim() || d.message_ar, message_en: str(m.message_en, 500).trim() || d.message_en,
      bypass: prev.maintenance.bypass || crypto.randomUUID().replace(/-/g, "") };
  }
  return next;
}
async function saveConfig(env, cfg) {
  await env.PRIVATE.put("config", JSON.stringify(cfg));
  cfgMemo = { at: Date.now(), v: cfg };
}

// Analytics and ad pixels switched on in the dashboard: the extra hosts the page may load from.
const TAG_HOSTS = {
  ga4: { script: "https://www.googletagmanager.com", connect: "https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com", img: "https://*.google-analytics.com https://www.googletagmanager.com" },
  meta_pixel: { script: "https://connect.facebook.net", connect: "https://www.facebook.com https://connect.facebook.net", img: "https://www.facebook.com" },
  clarity: { script: "https://www.clarity.ms https://*.clarity.ms", connect: "https://*.clarity.ms https://c.bing.com", img: "https://*.clarity.ms https://c.bing.com" },
  tiktok: { script: "https://analytics.tiktok.com", connect: "https://analytics.tiktok.com https://*.tiktok.com", img: "https://analytics.tiktok.com" },
};
function cspWithTags(tags) {
  const on = Object.keys(TAG_HOSTS).filter((k) => tags[k]);
  if (!on.length) return CSP;
  const add = (kind) => on.map((k) => TAG_HOSTS[k][kind]).join(" ");
  return CSP.replace("script-src 'self'", `script-src 'self' ${add("script")}`)
    .replace("connect-src 'self'", `connect-src 'self' ${add("connect")}`)
    .replace("img-src 'self'", `img-src 'self' ${add("img")}`);
}

const hasBypass = (request, cfg) => !!cfg.maintenance.bypass && (request.headers.get("cookie") || "").includes(`wixa-bypass=${cfg.maintenance.bypass}`);

// "Back soon" page while maintenance mode is on (the owner, with the dashboard cookie, still sees the site).
function maintenancePage(request, cfg, st) {
  const lang = pickLang(request, st.default_lang);
  const ar = lang === "ar";
  const msg = cfg.maintenance[`message_${lang}`];
  const c = st.contact || {};
  const wa = String(c.whatsapp || "").replace(/\D/g, "");
  const links = [c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`, wa && `<a href="https://wa.me/${wa}">${ar ? "واتساب" : "WhatsApp"}</a>`].filter(Boolean).join(" · ");
  const html = `<!doctype html><html lang="${lang}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ar ? "ويكسا — نعود قريباً" : "WIXA — Back soon"}</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg">
<style>:root{color-scheme:light dark;--bg:#F7F5FB;--fg:#1B1530;--mut:#5E5873;--brand:#5B21B6}@media(prefers-color-scheme:dark){:root{--bg:#0F0B1A;--fg:#F1EEF8;--mut:#A9A3BC;--brand:#A574F1}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
main{max-width:520px}img{width:84px;height:84px;margin-bottom:18px}h1{font-size:28px;margin:0 0 12px}p{color:var(--mut);line-height:1.9;margin:0 0 18px;font-size:16px}a{color:var(--brand);font-weight:600;text-decoration:none}</style></head>
<body><main><img src="/icons/icon-192.png" alt="WIXA"><h1>${ar ? "نعود قريباً" : "Back soon"}</h1><p>${esc(msg)}</p>${links ? `<p>${links}</p>` : ""}</main></body></html>`;
  return new Response(request.method === "HEAD" ? null : html, { status: 503, headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "3600" } });
}

// GET/PUT /api/admin/integrations — read or change the integrations (admins only)
async function handleAdminIntegrations(request, env) {
  const { error } = await adminSession(request, env);
  if (error) return error;
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  cfgMemo.at = 0; // always read the stored copy here
  const cfg = await getConfig(env);
  if (request.method === "GET") return json(cfg, 200, { "cache-control": "no-store" });
  let body = {};
  try { body = await request.json(); } catch {}
  let next;
  try { next = cleanConfig(cfg, body); } catch (e) { return json({ error: e.message, field: e.field }, 422); }
  await saveConfig(env, next);
  return json(next, 200, { "cache-control": "no-store" });
}

// POST /api/admin/integrations/test — send a sample alert or auto-reply to the alerts address
async function handleAdminTest(request, env) {
  const { error } = await adminSession(request, env);
  if (error) return error;
  let body = {};
  try { body = await request.json(); } catch {}
  const to = await notifyAddress(env);
  if (!env.RESEND_API_KEY || !to) return json({ error: "email_not_configured" }, 503);
  const cfg = await getConfig(env);
  const sample = { name: "زائر تجريبي", email: to, phone: null, message: "هذه رسالة تجريبية من لوحة التحكم.", services: [], lang: body.lang === "en" ? "en" : "ar" };
  const ok = body.kind === "weekly" ? await runWeeklyReport(env, true) : body.kind === "autoreply" ? await sendAutoReply(env, cfg, sample, true) : await notifyOwner(env, sample, true);
  return ok ? json({ ok: true, to }) : json({ error: "send_failed" }, 502);
}

// POST /api/admin/refresh — show the latest content on the site now
async function handleAdminRefresh(request, env) {
  const { error } = await adminSession(request, env);
  if (error) return error;
  try { await publishNow(env); } catch (e) { console.error("refresh", e); return json({ error: "refresh_failed" }, 502); }
  return json({ ok: true });
}

// Cloudflare Web Analytics: privacy-friendly, cookie-less visit counting that never touches our database.
const beacon = (env) => env.CF_BEACON_TOKEN
  ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${env.CF_BEACON_TOKEN}"}'></script>`
  : "";

// Hero text used when the dashboard has not changed it (the HTML itself ships the Arabic version).
const HERO_DEFAULTS = {
  ar: { hero_badge: "الشريك التقني لمشاريعك", hero_title: "نبني المستقبل الرقمي", hero_sub: "ويكسا تصمم وتطور منصات وتطبيقات وأنظمة رقمية سريعة وآمنة تختصر الوقت على عملائك — من الفكرة حتى التشغيل." },
  en: { hero_badge: "Your technology partner", hero_title: "Building the digital future", hero_sub: "WIXA designs and builds fast, secure platforms, apps and digital systems that save your customers time — from idea to launch." },
};
const SEO_DEFAULTS = {
  en: { title: "WIXA — Websites, apps & software development in Iraq", description: "WIXA designs and builds websites, digital platforms, mobile apps and custom business systems in Iraq — from idea to launch." },
};

// Which language a visit opens in: ?lang= link → the visitor's saved choice (cookie) → dashboard setting →
// the device language or the visitor's country. No header at all (most crawlers) → Arabic.
const ARAB_COUNTRIES = new Set(["IQ", "SA", "AE", "KW", "QA", "BH", "OM", "JO", "SY", "LB", "PS", "EG", "LY", "TN", "DZ", "MA", "SD", "YE", "MR"]);

function pickLang(request, setting) {
  const q = new URL(request.url).searchParams.get("lang");
  if (q === "ar" || q === "en") return q;
  const c = (request.headers.get("cookie") || "").match(/(?:^|;\s*)wixa-lang=(ar|en)/);
  if (c) return c[1];
  if (setting === "ar" || setting === "en") return setting;
  // Arabic anywhere in the device languages, or a visitor in an Arab country → Arabic; otherwise English.
  // (Many phones and in-app browsers send English first even when the phone itself is in Arabic.)
  const al = (request.headers.get("accept-language") || "").toLowerCase();
  if (!al.trim() || /(^|,)\s*ar\b/.test(al)) return "ar";
  if (ARAB_COUNTRIES.has(request.cf?.country)) return "ar";
  return "en";
}

// Questions & answers for search engines (only when the FAQ section is shown)
function faqLd(st, lang) {
  const list = (st.content?.[lang]?.faq || []).filter((x) => x?.q && x?.a);
  if (st.sections?.faq === false || !list.length) return "";
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: list.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) };
  return `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
}

// GET / — static HTML with the content embedded (no flash of default text, one request per visit).
async function handleHome(request, env, ctx) {
  const [page, raw, cfg] = await Promise.all([env.ASSETS.fetch(new Request(new URL("/", request.url), request)), getSiteData(env, ctx), getConfig(env)]);
  const data = cfg.spam.turnstile ? raw : raw.replace(/"turnstile":"[^"]*"/, '"turnstile":""');
  const owner = hasBypass(request, cfg);
  if (cfg.maintenance.on && !owner) { let st0 = {}; try { st0 = JSON.parse(data)?.settings || {}; } catch {} return maintenancePage(request, cfg, st0); }
  const preview = new URL(request.url).searchParams.has("preview");
  const tags = preview ? {} : Object.fromEntries(Object.entries(cfg.tags).filter(([, v]) => v));
  const safe = data.replace(/</g, "\\u003c");
  // Put the hero text in the HTML itself (same markup the script builds), so the first paint
  // already has it and nothing moves when the script runs.
  let st = {};
  try { st = JSON.parse(data)?.settings || {}; } catch {}
  const lang = pickLang(request, st.default_lang);
  const hero = { ...HERO_DEFAULTS[lang], ...Object.fromEntries(Object.entries(st.content?.[lang] || {}).filter(([, v]) => v)) };
  const mapOn = st.sections?.iraq_map !== false;
  const seo = st.seo || {};
  const origin = new URL(request.url).origin;
  const abs = (u) => (/^https?:\/\//.test(u) ? u : `${origin}${u.startsWith("/") ? "" : "/"}${u}`);
  const attr = (sel, name, val) => [sel, { element: (el) => { if (val) el.setAttribute(name, val); } }];
  const title = seo[`title_${lang}`] || (lang === "en" ? SEO_DEFAULTS.en.title : ""), desc = seo[`description_${lang}`] || (lang === "en" ? SEO_DEFAULTS.en.description : ""), img = seo.og_image ? abs(seo.og_image) : "";
  const headTags = [
    seo.google_verification && `<meta name="google-site-verification" content="${esc(seo.google_verification)}">`,
    seo.bing_verification && `<meta name="msvalidate.01" content="${esc(seo.bing_verification)}">`,
    seo.index === false && `<meta name="robots" content="noindex, nofollow">`,
    faqLd(st, lang),
    // one address, two languages: tell search engines about both versions
    `<link rel="alternate" hreflang="ar" href="${origin}/?lang=ar"><link rel="alternate" hreflang="en" href="${origin}/?lang=en"><link rel="alternate" hreflang="x-default" href="${origin}/">`,
  ].filter(Boolean).join("");
  const words = (t) => String(t).split(/\s+/).filter(Boolean).map((w, i) => `<span class="word"><span style="transition-delay:${i * 70}ms">${esc(w)}</span></span>`).join(" ");
  const fill = (key, html) => ({ element: (el) => { if (hero[key]) el.setInnerContent(html ? words(hero[key]) : hero[key], { html }); } });
  const res = new HTMLRewriter()
    .on("head", { element: (el) => el.append(`${headTags}<script id="wixa-data" type="application/json">${safe}</script>`, { html: true }) })
    .on("html", { element: (el) => { el.setAttribute("lang", lang); el.setAttribute("dir", lang === "ar" ? "rtl" : "ltr"); } })
    .on("title", { element: (el) => { if (title) el.setInnerContent(title); } })
    .on(...attr('meta[property="og:locale"]', "content", lang === "en" ? "en_US" : "ar_IQ"))
    .on(...attr('meta[name="description"]', "content", desc))
    .on(...attr('meta[name="keywords"]', "content", seo.keywords))
    .on(...attr('meta[property="og:title"]', "content", title))
    .on(...attr('meta[name="twitter:title"]', "content", title))
    .on(...attr('meta[property="og:description"]', "content", desc))
    .on(...attr('meta[name="twitter:description"]', "content", desc))
    .on(...attr('meta[property="og:image"]', "content", img))
    .on(...attr('meta[name="twitter:image"]', "content", img))
    .on(...attr('link[rel="icon"][type="image/svg+xml"]', "href", seo.icon_url))
    .on(...attr('link[rel="icon"][sizes]', "href", seo.icon_url))
    .on(...attr('link[rel="apple-touch-icon"]', "href", seo.icon_url))
    .on("#heroTitle", fill("hero_title", true))
    .on("svg.iraq", { element: (el) => { if (!mapOn) el.remove(); } })
    .on('[data-c="hero_badge"]', fill("hero_badge", false))
    .on('.hero__sub[data-c="hero_sub"]', fill("hero_sub", false))
    .on("body", { element: (el) => {
      if (!preview) el.append(beacon(env), { html: true });
      if (Object.keys(tags).length) el.append(`<script id="wixa-tags" type="application/json">${JSON.stringify(tags)}</script><script type="module" src="/build/tags.js"></script>`, { html: true });
      if (cfg.maintenance.on && owner && !preview) el.append('<div style="position:fixed;inset:auto 12px 12px auto;z-index:99999;background:#B45309;color:#fff;padding:8px 14px;border-radius:10px;font:600 13px system-ui,Tahoma,sans-serif">وضع الصيانة مفعّل — الزوار يرون صفحة «نعود قريباً»</div>', { html: true });
    } })
    .transform(page);
  const headers = new Headers(res.headers);
  headers.set("cache-control", "no-cache");
  headers.set("vary", "Accept-Language, Cookie");
  headers.set("content-language", lang);
  headers.delete("etag");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  headers.set("content-security-policy", cspWithTags(tags));
  return new Response(res.body, { status: res.status, headers });
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- protection helpers
const clientIp = (request) => request.headers.get("cf-connecting-ip") || "0.0.0.0";

async function allowed(limiter, key) {
  if (!limiter) return true; // binding not configured (local dev)
  try { return (await limiter.limit({ key })).success; } catch { return true; }
}

async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // not configured (local dev)
  if (!token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const d = await r.json().catch(() => ({}));
  return d.success === true;
}

const rpc = (env, fn, p) => sb(env, `rpc/${fn}`, { method: "POST", body: JSON.stringify({ token: env.WRITE_TOKEN || "", p }) });

// ---------------------------------------------------------------- GET /api/admin/stats
// Visitor numbers for the dashboard, read from Cloudflare Web Analytics.
// Counts only this environment's public pages: the dashboard itself (/admin) is excluded.
// Only signed-in admins (checked against Supabase with their own session) can read it;
// the Cloudflare token stays on the server.
// GET /admin/ — the dashboard page with its public config built in (saves a round trip on every open)
async function handleAdminPage(request, env) {
  const page = await env.ASSETS.fetch(new Request(new URL("/admin/", request.url), request));
  const cfg = JSON.stringify({ env: env.SITE_ENV || "production", supabaseUrl: env.SUPABASE_URL, supabaseKey: env.SUPABASE_PUBLISHABLE_KEY }).replace(/</g, "\\u003c");
  const res = new HTMLRewriter().on("head", { element: (el) => el.append(`<link rel="preconnect" href="${esc(env.SUPABASE_URL)}" crossorigin><script id="wixa-config" type="application/json">${cfg}</script>`, { html: true }) }).transform(page);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  headers.set("cache-control", "no-cache");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(res.body, { status: res.status, headers });
}

// Admin-only endpoints: the caller's own Supabase session must belong to an admin.
async function adminSession(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return { error: json({ error: "unauthorized" }, 401) };
  const asUser = (path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: auth, "content-type": "application/json", ...(init.headers || {}) } });
  let isAdmin = false;
  try {
    const adm = await asUser("rpc/is_admin", { method: "POST", body: "{}" });
    isAdmin = adm.ok && (await adm.json()) === true;
  } catch { return { error: json({ error: "auth_unavailable" }, 503) }; }
  if (!isAdmin) return { error: json({ error: "forbidden" }, 403) };
  return { asUser };
}

async function handleAdminStats(request, env, url, ctx) {
  const auth = adminSession(request, env); // checked in parallel with the work below
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_SITE_TAG) { const { error } = await auth; return error || json({ error: "analytics_not_configured" }, 503); }

  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10) || 30));
  const day = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const since = new Date(today.getTime() - (days - 1) * 864e5);
  const since90 = new Date(today.getTime() - 89 * 864e5);
  const q = `query($acc: String!, $tag: String!, $hosts: [string!], $since: Date!, $since90: Date!, $today: Date!) { viewer { accounts(filter: {accountTag: $acc}) {
    byDay: rumPageloadEventsAdaptiveGroups(limit: 100, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since}, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    today: rumPageloadEventsAdaptiveGroups(limit: 1, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date: $today}) { count sum { visits } }
    total90: rumPageloadEventsAdaptiveGroups(limit: 1, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since90}) { count }
    countries: rumPageloadEventsAdaptiveGroups(limit: 6, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since}, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { countryName } }
    devices: rumPageloadEventsAdaptiveGroups(limit: 5, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since}, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { deviceType } }
    pages: rumPageloadEventsAdaptiveGroups(limit: 6, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since}, orderBy: [count_DESC]) { count dimensions { requestPath } }
    refs: rumPageloadEventsAdaptiveGroups(limit: 6, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since, refererHost_neq: ""}, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { refererHost } }
    vitals: rumWebVitalsEventsAdaptiveGroups(limit: 1, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since}) {
      count
      quantiles { largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 }
      sum { lcpGood lcpNeedsImprovement lcpPoor inpGood inpNeedsImprovement inpPoor clsGood clsNeedsImprovement clsPoor }
    }
    load: rumPerformanceEventsAdaptiveGroups(limit: 1, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since}) { count quantiles { pageLoadTimeP75 } }
  } } }`;
  const cache = caches.default;
  const key = new Request(`https://wixa-cache.internal/stats/${env.SITE_ENV || "production"}/${days}`);
  const loadAnalytics = async () => {
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query: q, variables: { acc: env.CF_ACCOUNT_ID, tag: env.CF_SITE_TAG, hosts: env.SITE_ENV === "staging" ? ["staging.wixa.dev"] : ["wixa.dev", "www.wixa.dev"], since: day(since), since90: day(since90), today: day(today) } }),
  });
  const g = await r.json().catch(() => ({}));
  const a = g?.data?.viewer?.accounts?.[0];
  if (!a) throw new Error(JSON.stringify(g?.errors || g).slice(0, 300));

  const byDate = new Map((a.byDay || []).map((x) => [x.dimensions.date, x]));
  const by_day = [];
  for (let t = since.getTime(); t <= today.getTime(); t += 864e5) {
    const d = day(new Date(t)), x = byDate.get(d);
    by_day.push({ day: d, views: x?.count || 0, visitors: x?.sum?.visits || 0 });
  }
  const rows = (list, f, v) => (list || []).map((x) => ({ label: f(x), value: v(x) })).filter((x) => x.label);

  return {
    source: "cloudflare",
    views: by_day.reduce((n, x) => n + x.views, 0),
    visitors: by_day.reduce((n, x) => n + x.visitors, 0),
    today_views: a.today?.[0]?.count || 0,
    today_visitors: a.today?.[0]?.sum?.visits || 0,
    views_90d: a.total90?.[0]?.count || 0,
    messages_new,
    by_day,
    top_pages: rows(a.pages, (x) => x.dimensions.requestPath, (x) => x.count),
    countries: rows(a.countries, (x) => x.dimensions.countryName, (x) => x.sum.visits),
    devices: rows(a.devices, (x) => x.dimensions.deviceType, (x) => x.sum.visits),
    referrers: rows(a.refs, (x) => x.dimensions.refererHost, (x) => x.sum.visits),
    speed: speedReport(a.vitals?.[0], a.load?.[0]),
  };
  };

  // the admin check and the cache read run together; Cloudflare is only asked after the check passes
  const [session, hit] = await Promise.all([auth, cache.match(key)]);
  if (session.error) return session.error;
  const age = hit ? Date.now() - (Number(hit.headers.get("x-saved-at")) || 0) : Infinity;
  let data = null;
  if (hit && age < 5 * 60e3) data = await hit.json();
  else {
    try {
      data = await loadAnalytics();
      ctx.waitUntil(cache.put(key, new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400", "x-saved-at": String(Date.now()) } })));
    } catch (err) {
      console.error("analytics", err.message);
      if (hit) data = { ...(await hit.json()), stale: true }; // Cloudflare busy: show the last numbers
    }
  }
  if (!data) return json({ error: "analytics_failed" }, 502);
  // unread messages, read with the admin's own session
  const msg = await session.asUser("contact_messages?select=id&handled=eq.false", { method: "HEAD", headers: { prefer: "count=exact" } });
  const messages_new = parseInt((msg.headers.get("content-range") || "/0").split("/")[1], 10) || 0;
  return json({ ...data, messages_new }, 200, { "cache-control": "private, no-store" });
}

// ---------------------------------------------------------------- GET /api/admin/status
// Live check of everything the site is connected to, for the dashboard's "Connections" page.
async function handleAdminStatus(request, env, ctx) {
  const { error } = await adminSession(request, env);
  if (error) return error;
  const host = new URL(request.url).host;
  const staging = env.SITE_ENV === "staging";
  const acc = env.CF_ACCOUNT_ID;
  const timed = (p, ms = 6000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const code = (v) => `<code dir="ltr">${esc(v)}</code>`;
  const fmtDate = (t) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");

  const [ver, supa, resend, analytics] = await Promise.allSettled([
    timed(env.ASSETS.fetch(new Request(new URL("/build/version.json", request.url))).then((r) => (r.ok ? r.json() : null))),
    timed(Promise.all([
      fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } }).then((r) => r.ok),
      sb(env, "site_settings?select=updated_at&id=eq.1").then((r) => (r.ok ? r.json() : null)),
    ])),
    env.RESEND_API_KEY ? timed(fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` } }).then(async (r) => ({ status: r.status, body: r.ok ? await r.json() : null }))) : Promise.resolve(null),
    env.CF_ANALYTICS_TOKEN ? timed(fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST", headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ query: "query($a: String!) { viewer { accounts(filter: {accountTag: $a}) { accountTag } } }", variables: { a: acc } }),
    }).then((r) => r.json())) : Promise.resolve(null),
  ]);
  const v = ver.status === "fulfilled" ? ver.value : null;
  const site = JSON.parse(await getSiteData(env, ctx));
  const seo = site.settings?.seo || {};
  const items = [];

  items.push({ name: "النطاق", role: "عنوان موقعك على الإنترنت", state: "ok",
    rows: [["العنوان", code(host)], ["إدارة النطاق (DNS)", "Cloudflare"], ["الاتصال الآمن", "HTTPS مفعّل"], ["عناوين أخرى", staging ? code("wixa.dev") + " (الرئيسية)" : code("www.wixa.dev") + " · " + code("staging.wixa.dev") + " (تجريبية)"]],
    link: `https://dash.cloudflare.com/${acc}/wixa.dev/dns/records`, linkText: "إعدادات النطاق" });

  items.push({ name: "Cloudflare — الاستضافة", role: "يشغّل الموقع ويوزّعه من أقرب خادم للزائر", state: "ok",
    rows: [["الخدمة", `Workers · ${code(staging ? "wixa-staging" : "wixa")}`], ["آخر نشر", fmtDate(env.CF_VERSION?.timestamp)], ["رقم النسخة", env.CF_VERSION?.id ? code(env.CF_VERSION.id.slice(0, 8)) : "—"], ["حماية النموذج", env.TURNSTILE_SECRET ? "Turnstile مفعّل" : "غير مفعّلة"]],
    link: `https://dash.cloudflare.com/${acc}/workers/services/view/${staging ? "wixa-staging" : "wixa"}/production`, linkText: "لوحة Cloudflare" });

  items.push({ name: "GitHub — الكود", role: "يحفظ كود الموقع؛ كل تحديث يُنشر تلقائياً", state: v?.commit ? "ok" : "info",
    rows: [["المستودع", code("saifaldin1992/wixa")], ["الفرع", code(v?.branch || (staging ? "staging" : "main"))], ["آخر تحديث", v?.commit ? `${code(v.commit.slice(0, 7))} · ${esc(v.message || "")}` : "—"], ["وقت البناء", fmtDate(v?.built_at)]],
    link: v?.commit ? `https://github.com/saifaldin1992/wixa/commit/${v.commit}` : "https://github.com/saifaldin1992/wixa", linkText: "فتح على GitHub" });

  const sOk = supa.status === "fulfilled" && supa.value[0] && Array.isArray(supa.value[1]);
  const ref = (env.SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1] || "";
  items.push({ name: "Supabase — قاعدة البيانات", role: "المحتوى والرسائل وحساب الدخول", state: sOk ? "ok" : "err",
    rows: [["المشروع", code(ref)], ["الحالة", sOk ? "متصلة وتعمل" : "تعذّر الاتصال"], ["آخر حفظ للمحتوى", sOk ? fmtDate(supa.value[1][0]?.updated_at) : "—"]],
    link: `https://supabase.com/dashboard/project/${ref}`, linkText: "لوحة Supabase" });

  let rState = "err", rRows = [["المفتاح", "غير مضاف"]];
  if (env.RESEND_API_KEY && resend.status === "fulfilled" && resend.value) {
    const { status, body } = resend.value;
    const dom = body?.data?.find?.((x) => x.name === "wixa.dev");
    if (dom) { rState = dom.status === "verified" ? "ok" : "warn"; rRows = [["النطاق", `${code("wixa.dev")} · ${dom.status === "verified" ? "موثّق" : esc(dom.status)}`]]; }
    else if (status === 401 || status === 403) { rState = "ok"; rRows = [["المفتاح", "مفتاح إرسال فقط (آمن)"]]; }
    else { rState = "warn"; rRows = [["الحالة", `رد غير متوقع (${status})`]]; }
  } else if (env.RESEND_API_KEY) { rState = "warn"; rRows = [["الحالة", "لم يرد في الوقت المحدد"]]; }
  const to = await notifyAddress(env);
  rRows.push(["المرسِل", code("notify@wixa.dev")], ["التنبيهات تصل إلى", to ? code(to.replace(/^(.{2}).*(@.*)$/, "$1•••$2")) : "غير محدد"]);
  items.push({ name: "Resend — البريد الصادر", role: "يرسل لك تنبيه كل رسالة جديدة من الموقع", state: rState, rows: rRows, link: "https://resend.com/domains", linkText: "لوحة Resend" });

  items.push({ name: "البريد الوارد", role: "عناوين الشركة تُحوَّل إلى بريدك", state: "info",
    rows: [["العناوين", `${code("info@")} ${code("sales@")} ${code("support@")}`], ["الخدمة", "Cloudflare Email Routing"], ["يُحوَّل إلى", "Gmail الخاص بالشركة"]],
    link: `https://dash.cloudflare.com/${acc}/wixa.dev/email/routing/overview`, linkText: "إعدادات البريد" });

  const aOk = analytics.status === "fulfilled" && analytics.value?.data?.viewer?.accounts?.length > 0;
  items.push({ name: "Cloudflare — الإحصائيات", role: "عدد الزيارات وسرعة الموقع في «نظرة عامة»", state: aOk ? "ok" : "err",
    rows: [["الخدمة", "Web Analytics"], ["الحالة", aOk ? "متصلة" : env.CF_ANALYTICS_TOKEN ? "المفتاح لا يعمل" : "المفتاح غير مضاف"]],
    link: `https://dash.cloudflare.com/${acc}/web-analytics`, linkText: "الإحصائيات في Cloudflare" });

  const gState = staging ? "info" : seo.index === false ? "err" : seo.google_verification ? "ok" : "warn";
  items.push({ name: "Google — البحث", role: "ظهور موقعك في نتائج البحث", state: gState,
    rows: [["الفهرسة", staging ? "متوقفة عمداً (نسخة تجريبية)" : seo.index === false ? "متوقفة" : "مسموحة"], ["Search Console", seo.google_verification ? "مربوط برمز تحقق" : "غير مربوط بعد"], ["خريطة الموقع", code("/sitemap.xml")]],
    link: "https://search.google.com/search-console", linkText: "Google Search Console" });

  return json({ env: env.SITE_ENV || "production", checked_at: new Date().toISOString(), items }, 200, { "cache-control": "no-store" });
}

// Core Web Vitals from real visitors (75th percentile, the value Google uses).
// Cloudflare reports times in microseconds; we return milliseconds.
function speedReport(v, load) {
  if (!v?.count) return null;
  const q = v.quantiles || {}, n = v.sum || {};
  const share = (k) => { const g = n[`${k}Good`] || 0, m = n[`${k}NeedsImprovement`] || 0, p = n[`${k}Poor`] || 0, t = g + m + p; return t ? { good: g / t, mid: m / t, poor: p / t, samples: t } : null; };
  return {
    samples: v.count,
    load_ms: load?.quantiles?.pageLoadTimeP75 != null ? Math.round(load.quantiles.pageLoadTimeP75 / 1000) : null,
    lcp_ms: q.largestContentfulPaintP75 != null ? Math.round(q.largestContentfulPaintP75 / 1000) : null,
    inp_ms: q.interactionToNextPaintP75 != null ? Math.round(q.interactionToNextPaintP75 / 1000) : null,
    cls: q.cumulativeLayoutShiftP75 ?? null,
    lcp: share("lcp"), inp: share("inp"), cls_share: share("cls"),
  };
}

// ---------------------------------------------------------------- alerts address (private)
// Kept in a private Cloudflare store, not in the public site settings, so it is never exposed to visitors.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function notifyAddress(env) {
  const v = env.PRIVATE ? await env.PRIVATE.get("notify_email").catch(() => null) : null;
  return v || env.NOTIFY_EMAIL || "";
}
// GET/PUT /api/admin/notify — read or change where new-message alerts are sent (admins only)
async function handleAdminNotify(request, env) {
  const { error } = await adminSession(request, env);
  if (error) return error;
  if (request.method === "GET") {
    const custom = env.PRIVATE ? await env.PRIVATE.get("notify_email") : null;
    return json({ email: await notifyAddress(env), source: custom ? "dashboard" : "default", editable: !!env.PRIVATE }, 200, { "cache-control": "no-store" });
  }
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  let body = {};
  try { body = await request.json(); } catch {}
  const email = String(body.email || "").trim().slice(0, 200);
  if (!email) { await env.PRIVATE.delete("notify_email"); return json({ email: env.NOTIFY_EMAIL || "", source: "default" }); }
  if (!EMAIL_RE.test(email)) return json({ error: "invalid_email" }, 422);
  await env.PRIVATE.put("notify_email", email);
  return json({ email, source: "dashboard" });
}

// ---------------------------------------------------------------- POST /api/contact
// Email the site owner about a new message (needs RESEND_API_KEY and NOTIFY_EMAIL secrets on the Worker).
async function notifyOwner(env, row, test = false) {
  if (!env.RESEND_API_KEY) return false;
  const cfg = await getConfig(env);
  if (!cfg.alerts.on && !test) return false;
  const to = (await notifyAddress(env)) || ""; // dashboard setting (private store) or the NOTIFY_EMAIL secret
  if (!to) return false;
  const staging = env.SITE_ENV === "staging";
  const admin = staging ? "https://staging.wixa.dev/admin/#messages" : "https://wixa.dev/admin/#messages";
  const wa = row.phone ? `https://wa.me/${row.phone.replace(/\D/g, "")}` : "";
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F6F3F2;padding:24px">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ECE6E8">
      <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">رسالة جديدة من موقع ويكسا${staging ? " (النسخة التجريبية)" : ""}</div>
      <div style="padding:22px;color:#1A0E12;font-size:15px;line-height:1.8">
        <p style="margin:0 0 6px"><b>الاسم:</b> ${esc(row.name)}</p>
        <p style="margin:0 0 6px"><b>البريد:</b> <a href="mailto:${esc(row.email)}">${esc(row.email)}</a></p>
        ${row.phone ? `<p style="margin:0 0 6px"><b>الهاتف:</b> ${esc(row.phone)}</p>` : ""}
        ${row.services?.length ? `<p style="margin:0 0 6px"><b>الخدمة:</b> ${esc(row.services.join("، "))}</p>` : ""}
        <div style="margin:14px 0;padding:14px;background:#F8EEF1;border-radius:12px;white-space:pre-wrap">${esc(row.message)}</div>
        <a href="mailto:${esc(row.email)}" style="display:inline-block;background:#5B21B6;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;margin-left:6px">رد بالبريد</a>
        ${wa ? `<a href="${wa}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;margin-left:6px">واتساب</a>` : ""}
        <a href="${admin}" style="display:inline-block;color:#5B21B6;padding:10px 4px">فتح لوحة التحكم ←</a>
      </div></div></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `${cfg.alerts.from_name} <notify@wixa.dev>`, to: [to], reply_to: row.email, subject: `${test ? "[اختبار] " : ""}${staging ? "[تجريبي] " : ""}${row.services?.[0]?.startsWith("طلب توظيف") ? `${row.services[0]} — ${row.name}` : `رسالة جديدة من ${row.name}`}`, html }),
  });
  if (!res.ok) console.error("notify failed", res.status, await res.text());
  return res.ok;
}

// Thank-you email to the visitor (switched on in the dashboard). The name is shortened and stripped of links,
// so the form cannot be used to send someone else a message of the sender's choosing.
async function sendAutoReply(env, cfg, row, test = false) {
  if (!env.RESEND_API_KEY || (!cfg.autoreply.on && !test)) return false;
  const lang = row.lang === "en" ? "en" : "ar";
  const name = row.name.replace(/https?:\/\/\S+|www\.\S+|\S+\.(com|net|org|io|dev|me|ly|xyz)\S*/gi, "").replace(/[<>]/g, "").trim().slice(0, 40) || (lang === "ar" ? "بك" : "there");
  const text = cfg.autoreply[`body_${lang}`].split("{name}").join(name);
  let contact = "";
  try { contact = JSON.parse(memo.text || (await loadFromSupabase(env)))?.settings?.contact?.email || ""; } catch {}
  const site = env.SITE_ENV === "staging" ? "https://staging.wixa.dev" : "https://wixa.dev";
  const html = `<div dir="${lang === "ar" ? "rtl" : "ltr"}" style="font-family:Tahoma,Arial,sans-serif;background:#F6F3F2;padding:24px">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ECE6E8">
      <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">${lang === "ar" ? "ويكسا" : "WIXA"}</div>
      <div style="padding:22px;color:#1A0E12;font-size:15px;line-height:1.9;white-space:pre-wrap">${esc(text)}</div>
      <div style="padding:0 22px 20px"><a href="${site}" style="color:#5B21B6;text-decoration:none">${site.replace("https://", "")}</a></div></div></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `${cfg.alerts.from_name} <noreply@wixa.dev>`, to: [row.email], ...(EMAIL_RE.test(contact) ? { reply_to: contact } : {}),
      subject: `${test ? "[اختبار] " : ""}${cfg.autoreply[`subject_${lang}`]}`, html, text }),
  });
  if (!res.ok) console.error("autoreply failed", res.status, await res.text());
  return res.ok;
}

async function handleContact(request, env, ctx) {
  const ip = clientIp(request);
  if (!(await allowed(env.CONTACT_LIMITER, ip))) return json({ error: "rate_limited" }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (body.website) return json({ ok: true }); // honeypot
  const cfg = await getConfig(env);
  if (cfg.spam.turnstile && !(await turnstileOk(env, body.turnstile, ip))) return json({ error: "captcha" }, 403);

  const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const isJob = body.kind === "job";
  const row = {
    name: clean(body.name, 120),
    email: clean(body.email, 200),
    phone: clean(body.phone, 40) || null,
    message: clean(body.message, 4000),
    services: Array.isArray(body.services) ? body.services.filter((s) => typeof s === "string").slice(0, 10).map((s) => s.slice(0, 80)) : [],
    lang: body.lang === "en" ? "en" : "ar",
  };
  if (!row.name || !row.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return json({ error: "validation" }, 422);
  if (!row.phone || row.phone.replace(/\D/g, "").length < 7) return json({ error: "phone_required" }, 422);
  if (isJob) {
    const cv = safeHref(clean(body.cv, 300));
    row.services = [`طلب توظيف: ${clean(body.job, 120) || "تقديم عام"}`];
    row.message = `${row.message}${cv ? `\n\nالسيرة الذاتية / الأعمال: ${cv}` : ""}`.slice(0, 4300);
  }
  // words or addresses blocked in the dashboard: accepted quietly, never stored
  const blocked = cfg.spam.blocked.split(/[\n,،]/).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2);
  const hay = `${row.name} ${row.email} ${row.phone || ""} ${row.message}`.toLowerCase();
  if (blocked.some((w) => hay.includes(w))) return json({ ok: true }, 201);

  const res = await rpc(env, "submit_contact", row);
  if (!res.ok) {
    console.error("contact insert failed", res.status, await res.text());
    return json({ error: "storage" }, 502);
  }
  ctx.waitUntil(notifyOwner(env, row).catch((e) => console.error("notify", e)));
  ctx.waitUntil(sendAutoReply(env, cfg, row).catch((e) => console.error("autoreply", e)));
  ctx.waitUntil(countMessage(env, row, isJob).catch((e) => console.error("count", e)));
  return json({ ok: true }, 201);
}

// ---------------------------------------------------------------- simple pages (project pages, privacy policy)
// Readable URLs for each project: from the English title (or the Arabic one), unique within the list.
function withSlugs(projects) {
  const seen = new Set();
  return projects.map((p) => {
    let base = String(p.title_en || p.title_ar || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || String(p.id);
    let slug = base, n = 2;
    while (seen.has(slug)) slug = `${base}-${n++}`;
    seen.add(slug);
    return { ...p, slug };
  });
}

// Project details text: blank-line separated blocks; a short first line becomes a heading, "•" lines a list (same as the site's window).
function detailsHtml(raw) {
  return String(raw || "").split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let html = "";
    if (lines.length > 1 && lines[0].length < 40 && !lines[0].startsWith("•")) html += `<h2>${esc(lines.shift())}</h2>`;
    const bullets = lines.filter((l) => /^[•\-–]/.test(l)), text = lines.filter((l) => !/^[•\-–]/.test(l));
    if (text.length) html += `<p>${text.map(esc).join("<br>")}</p>`;
    if (bullets.length) html += `<ul>${bullets.map((l) => `<li>${esc(l.replace(/^[•\-–]\s*/, ""))}</li>`).join("")}</ul>`;
    return html;
  }).join("");
}

const safeHref = (u) => { try { const x = new URL(String(u || "")); return ["http:", "https:"].includes(x.protocol) ? x.href : ""; } catch { return ""; } };

// One light page layout shared by project pages and the privacy policy: brand colours and font from the dashboard.
function simplePage(request, st, { lang, title, description, path, image, body, jsonld, status = 200 }) {
  const ar = lang === "ar";
  const origin = new URL(request.url).origin;
  const t = st.theme || {};
  const color = /^#[0-9a-f]{3,8}$/i.test(t.primary || "") ? t.primary : "#5B21B6";
  const font = String(st.font?.family || "Alexandria").replace(/[^\w\s-]/g, "");
  const brand = (ar ? st.brand?.name_ar : st.brand?.name_en) || (ar ? "ويكسا" : "WIXA");
  const c = st.contact || {};
  const wa = String(c.whatsapp || "").replace(/\D/g, "");
  const other = ar ? "en" : "ar";
  const html = `<!doctype html><html lang="${lang}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(brand)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${origin}${path}?lang=${lang}"><link rel="alternate" hreflang="ar" href="${origin}${path}?lang=ar"><link rel="alternate" hreflang="en" href="${origin}${path}?lang=en">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${origin}${path}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600;800&display=swap">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
<style>
:root{--p:${color};--bg:#FBFAFE;--s:#fff;--t:#140F1F;--m:#625C70;--l:#ECE8F3;color-scheme:light dark}
@media(prefers-color-scheme:dark){:root{--bg:#0F0B1A;--s:#17122A;--t:#F1EEF8;--m:#A9A3BC;--l:#2A2340;--p:#A574F1}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font-family:"${font}",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;line-height:1.8}
a{color:var(--p)}.wrap{max-width:900px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 0}
header .home{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--t);font-weight:800;font-size:1.15rem}header .home img{width:38px;height:38px}
header nav{display:flex;gap:8px}header nav a{padding:8px 14px;border-radius:99px;border:1px solid var(--l);text-decoration:none;color:var(--t);font-size:.9rem;background:var(--s)}
main{padding:20px 0 60px}h1{font-size:clamp(1.7rem,4vw,2.5rem);line-height:1.3;margin:6px 0 12px}h2{font-size:1.2rem;margin:28px 0 8px}
.cat{display:inline-block;font-size:.8rem;font-weight:600;padding:3px 12px;border-radius:99px;background:color-mix(in srgb,var(--p) 12%,transparent);color:var(--p)}
.lead{font-size:1.1rem;color:var(--m)}p,li{color:var(--m)}ul{padding-inline-start:20px}
.gallery{display:grid;gap:12px;margin:24px 0}.gallery img{width:100%;border-radius:18px;border:1px solid var(--l);display:block}
.gallery .mob{max-width:300px;justify-self:center}
.stats{display:flex;flex-wrap:wrap;gap:28px;margin:24px 0;padding:20px 0;border-top:1px solid var(--l);border-bottom:1px solid var(--l)}
.stats b{display:block;font-size:1.6rem;color:var(--t)}.stats span{color:var(--m);font-size:.9rem}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:13px 24px;border-radius:99px;text-decoration:none;font-weight:600;background:var(--p);color:#fff}
.btn--ghost{background:var(--s);color:var(--t);border:1px solid var(--l)}.btn--wa{background:#25D366;color:#fff}
footer{border-top:1px solid var(--l);padding:22px 0;font-size:.85rem;color:var(--m);display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between}
footer a{color:var(--m)}
</style></head><body><div class="wrap">
<header><a class="home" href="/?lang=${lang}"><img src="/icons/icon-96.png" alt="">${esc(brand)}</a>
<nav><a href="${path}?lang=${other}" hreflang="${other}">${ar ? "English" : "العربية"}</a><a href="/?lang=${lang}">${ar ? "الرئيسية" : "Home"}</a></nav></header>
<main>${body}
<div class="actions"><a class="btn" href="/?lang=${lang}#contact">${ar ? "تواصل معنا" : "Contact us"}</a>${wa ? `<a class="btn btn--wa" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ar ? "واتساب" : "WhatsApp"}</a>` : ""}</div></main>
<footer><span>© ${new Date().getFullYear()} ${esc(brand)}</span><span><a href="/privacy?lang=${lang}">${ar ? "سياسة الخصوصية" : "Privacy policy"}</a> · <a href="/?lang=${lang}">${origin.replace(/^https?:\/\//, "")}</a></span></footer>
</div></body></html>`;
  return new Response(request.method === "HEAD" ? null : html, { status, headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "content-language": lang, vary: "Accept-Language, Cookie" } });
}

// GET /projects/<slug> — one page per project (shareable, and findable in search engines)
async function handleProjectPage(request, env, ctx, slug) {
  const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
  let d = {};
  try { d = JSON.parse(raw); } catch {}
  const st = d.settings || {};
  if (cfg.maintenance.on && !hasBypass(request, cfg)) return maintenancePage(request, cfg, st);
  const lang = pickLang(request, st.default_lang);
  const p = (d.projects || []).find((x) => x.slug === slug || String(x.id) === slug);
  if (!p) return env.ASSETS.fetch(new Request(new URL("/404.html", request.url), request)).then((r) => new Response(r.body, { status: 404, headers: r.headers }));
  const T = (f) => p[`${f}_${lang}`] || p[`${f}_ar`] || p[`${f}_en`] || "";
  const imgs = [p.image_url, ...(Array.isArray(p.gallery) ? p.gallery : [])].map(safeHref).filter(Boolean);
  const mob = safeHref(p.mobile_image_url);
  const stats = Array.isArray(p.stats) ? p.stats.filter((x) => String(x.value || "").trim()) : [];
  const link = safeHref(p.link);
  const origin = new URL(request.url).origin;
  const body = `${T("category") ? `<span class="cat">${esc(T("category"))}</span>` : ""}<h1>${esc(T("title"))}</h1>
    ${T("summary") ? `<p class="lead">${esc(T("summary"))}</p>` : ""}
    ${imgs.length || mob ? `<div class="gallery">${imgs.map((u) => `<img src="${esc(u)}" alt="${esc(T("title"))}" loading="lazy">`).join("")}${mob ? `<img class="mob" src="${esc(mob)}" alt="" loading="lazy">` : ""}</div>` : ""}
    ${stats.length ? `<div class="stats">${stats.map((x) => `<div><b>${esc(x.value)}</b><span>${esc(x[`label_${lang}`] || x.label_ar || "")}</span></div>`).join("")}</div>` : ""}
    ${detailsHtml(T("details"))}
    ${link ? `<p><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link.replace(/^https?:\/\//, "").replace(/\/$/, ""))} ↗</a></p>` : ""}`;
  return simplePage(request, st, {
    lang, title: T("title"), description: (T("summary") || T("details")).slice(0, 160), path: `/projects/${encodeURIComponent(p.slug)}`,
    image: imgs[0] || mob || "", body,
    jsonld: { "@context": "https://schema.org", "@type": "CreativeWork", name: T("title"), description: T("summary"), url: `${origin}/projects/${encodeURIComponent(p.slug)}`, ...(imgs[0] ? { image: imgs[0] } : {}), creator: { "@type": "Organization", name: "WIXA", url: origin } },
  });
}

// GET /privacy — privacy policy (Arabic / English)
async function handlePrivacy(request, env, ctx) {
  const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
  let st = {};
  try { st = JSON.parse(raw).settings || {}; } catch {}
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const email = st.contact?.email || "info@wixa.dev";
  const tagsOn = Object.values(cfg.tags || {}).some(Boolean);
  // text from the dashboard (المحتوى ← سياسة الخصوصية), or the default wording
  const pv = st.privacy || {};
  const list = (Array.isArray(pv[lang]) && pv[lang].some((x) => x?.h || x?.p) ? pv[lang] : PRIVACY_DEFAULTS[lang]).filter((x) => x?.h || x?.p);
  const updated = pv.updated || PRIVACY_DEFAULTS.updated;
  const mail = `<a href="mailto:${esc(email)}">${esc(email)}</a>`;
  const para = (t) => esc(t).split("{email}").join(mail).replace(/\n/g, "<br>");
  const S = list.map((x) => [esc(x.h || ""), para(x.p || "")]);
  // analytics or ad pixels switched on in the dashboard: say so automatically
  if (tagsOn) S.push([ar ? "أدوات القياس والإعلانات" : "Analytics and advertising tools", ar
    ? "نستخدم أيضاً أدوات قياس وإعلانات من جهات أخرى (مثل Google أو Meta أو Microsoft أو TikTok) لفهم أداء الموقع وحملاتنا، وقد تستخدم هذه الأدوات ملفات تعريف الارتباط وفق سياساتها."
    : "We also use third-party analytics and advertising tools (such as Google, Meta, Microsoft or TikTok) to understand how the site and our campaigns perform; these tools may use cookies under their own policies."]);
  const body = `<h1>${ar ? "سياسة الخصوصية" : "Privacy policy"}</h1><p class="lead">${ar ? "آخر تحديث:" : "Last updated:"} ${esc(updated)}</p>${S.map(([h, p]) => `${h ? `<h2>${h}</h2>` : ""}<p>${p}</p>`).join("")}`;
  return simplePage(request, st, { lang, title: ar ? "سياسة الخصوصية" : "Privacy policy", description: ar ? "كيف تجمع ويكسا بياناتك وتستخدمها وتحميها." : "How WIXA collects, uses and protects your data.", path: "/privacy", body });
}

// ---------------------------------------------------------------- message counters (for the weekly report)
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
async function countMessage(env, row, isJob) {
  if (!env.PRIVATE) return;
  const key = `count:${dayKey()}`;
  const c = (await env.PRIVATE.get(key, { type: "json" }).catch(() => null)) || { total: 0, jobs: 0, services: {} };
  c.total++;
  if (isJob) c.jobs++;
  else { const s = row.services?.[0] || "استشارة عامة"; c.services[s] = (c.services[s] || 0) + 1; }
  await env.PRIVATE.put(key, JSON.stringify(c), { expirationTtl: 60 * 864e2 });
}

// ---------------------------------------------------------------- message status + notes (dashboard)
// Kept in the private store by message id: { status: new|working|won|lost, note }.
async function handleAdminMsgMeta(request, env) {
  const { error } = await adminSession(request, env);
  if (error) return error;
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  const all = (await env.PRIVATE.get("msgmeta", { type: "json" })) || {};
  if (request.method === "GET") return json(all, 200, { "cache-control": "no-store" });
  let b = {};
  try { b = await request.json(); } catch {}
  const id = String(b.id || "").slice(0, 64);
  if (!id) return json({ error: "missing_id" }, 422);
  if (b.remove) delete all[id];
  else all[id] = { status: ["new", "working", "won", "lost"].includes(b.status) ? b.status : "new", note: String(b.note || "").slice(0, 2000), at: new Date().toISOString() };
  await env.PRIVATE.put("msgmeta", JSON.stringify(all));
  return json(all[id] || { ok: true });
}

// ---------------------------------------------------------------- scheduled jobs: monitoring + weekly report
async function sendOwnerMail(env, subject, html) {
  const to = await notifyAddress(env);
  if (!env.RESEND_API_KEY || !to) return false;
  const cfg = await getConfig(env);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `${cfg.alerts.from_name} <notify@wixa.dev>`, to: [to], subject, html }),
  });
  if (!r.ok) console.error("owner mail failed", r.status, await r.text());
  return r.ok;
}
const mailBox = (title, inner, color = "#5B21B6") => `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F6F3F2;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ECE6E8">
  <div style="background:${color};color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">${title}</div><div style="padding:22px;color:#1A0E12;font-size:15px;line-height:1.9">${inner}</div></div></div>`;

// Every 15 minutes: is the database answering, and does the site have its content? Emails only when the state changes
// (two failed checks in a row before "down", to ignore a single hiccup).
async function runMonitor(env) {
  const cfg = await getConfig(env);
  if (!cfg.reports.monitor || !env.PRIVATE) return;
  const problems = [];
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/site_settings?select=id&id=eq.1`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) problems.push(`قاعدة البيانات (Supabase) ترد بخطأ ${r.status}`);
  } catch (e) { problems.push(`قاعدة البيانات (Supabase) لا ترد: ${e.message}`); }
  try {
    const page = await env.ASSETS.fetch(new Request("https://wixa.dev/index.html"));
    if (!page.ok) problems.push(`ملفات الموقع ترد بخطأ ${page.status}`);
  } catch (e) { problems.push(`ملفات الموقع لا ترد: ${e.message}`); }
  const prev = (await env.PRIVATE.get("monitor", { type: "json" })) || { state: "ok", fails: 0 };
  const fails = problems.length ? prev.fails + 1 : 0;
  const state = problems.length ? (fails >= 2 ? "down" : prev.state) : "ok";
  const site = env.SITE_ENV === "staging" ? "staging.wixa.dev" : "wixa.dev";
  const when = new Date().toLocaleString("ar-IQ", { timeZone: "Asia/Baghdad", dateStyle: "medium", timeStyle: "short" });
  if (state === "down" && prev.state !== "down") {
    await sendOwnerMail(env, `⚠️ مشكلة في ${site}`, mailBox(`⚠️ تنبيه: مشكلة في ${site}`, `<p>رصد الفحص التلقائي مشكلة (${when} بتوقيت بغداد):</p><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul><p>الموقع يعرض آخر نسخة محفوظة من المحتوى قدر الإمكان. سيصلك بريد آخر عند عودة كل شيء للعمل.</p>`, "#B42318"));
  } else if (state === "ok" && prev.state === "down") {
    await sendOwnerMail(env, `✅ عاد ${site} للعمل`, mailBox(`✅ عاد ${site} للعمل`, `<p>عادت كل الفحوص سليمة (${when} بتوقيت بغداد).</p>`, "#067647"));
  }
  await env.PRIVATE.put("monitor", JSON.stringify({ state, fails, at: new Date().toISOString(), problems }));
}

// Visits in the last 7 days from Cloudflare Web Analytics (public pages only)
async function weeklyVisits(env, since) {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_SITE_TAG) return null;
  const q = `query($acc: String!, $tag: String!, $hosts: [string!], $since: Date!) { viewer { accounts(filter: {accountTag: $acc}) {
    total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since}) { count sum { visits } }
    countries: rumPageloadEventsAdaptiveGroups(limit: 3, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since}, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { countryName } }
  } } }`;
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ query: q, variables: { acc: env.CF_ACCOUNT_ID, tag: env.CF_SITE_TAG, hosts: env.SITE_ENV === "staging" ? ["staging.wixa.dev"] : ["wixa.dev", "www.wixa.dev"], since } }) });
    const a = (await r.json())?.data?.viewer?.accounts?.[0];
    if (!a) return null;
    return { views: a.total?.[0]?.count || 0, visitors: a.total?.[0]?.sum?.visits || 0, countries: (a.countries || []).map((x) => [x.dimensions.countryName, x.sum.visits]) };
  } catch { return null; }
}

async function runWeeklyReport(env, force = false) {
  const cfg = await getConfig(env);
  if (!cfg.reports.weekly && !force) return false;
  const days = [...Array(7)].map((_, i) => dayKey(new Date(Date.now() - (i + 1) * 864e5)));
  const counts = await Promise.all(days.map((d) => (env.PRIVATE ? env.PRIVATE.get(`count:${d}`, { type: "json" }).catch(() => null) : null)));
  const sum = { total: 0, jobs: 0, services: {} };
  for (const c of counts) if (c) { sum.total += c.total || 0; sum.jobs += c.jobs || 0; for (const [k, v] of Object.entries(c.services || {})) sum.services[k] = (sum.services[k] || 0) + v; }
  const v = await weeklyVisits(env, days[6]);
  const top = Object.entries(sum.services).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const site = env.SITE_ENV === "staging" ? "https://staging.wixa.dev" : "https://wixa.dev";
  const row = (k, val) => `<tr><td style="padding:8px 0;color:#625C70">${k}</td><td style="padding:8px 0;text-align:left;font-weight:bold">${val}</td></tr>`;
  const inner = `<p style="margin-top:0">ملخص آخر ٧ أيام (${days[6]} — ${days[0]}):</p>
    <table style="width:100%;border-collapse:collapse">
      ${v ? row("الزوار", v.visitors.toLocaleString("en")) + row("مشاهدات الصفحات", v.views.toLocaleString("en")) : row("الزوار", "غير متاح")}
      ${row("رسائل جديدة", sum.total - sum.jobs)}${row("طلبات توظيف", sum.jobs)}
    </table>
    ${top.length ? `<p style="margin-bottom:4px"><b>أكثر ما طُلب:</b></p><ul style="margin-top:0">${top.map(([k, n]) => `<li>${esc(k)} — ${n}</li>`).join("")}</ul>` : ""}
    ${v?.countries?.length ? `<p style="margin-bottom:4px"><b>أكثر الدول زيارة:</b></p><ul style="margin-top:0">${v.countries.map(([k, n]) => `<li>${esc(k)} — ${n}</li>`).join("")}</ul>` : ""}
    <p><a href="${site}/admin/" style="color:#5B21B6">فتح لوحة التحكم ←</a></p>`;
  return sendOwnerMail(env, `${force ? "[اختبار] " : ""}تقرير ويكسا الأسبوعي`, mailBox("تقرير ويكسا الأسبوعي", inner));
}

// ---------------------------------------------------------------- router
export default {
  // "*/15 * * * *" → health check; "17 6 * * 0" → weekly report (Sunday 09:17 Baghdad)
  async scheduled(event, env, ctx) {
    if (event.cron === "17 6 * * 0") ctx.waitUntil(runWeeklyReport(env).catch((e) => console.error("weekly", e)));
    else ctx.waitUntil(runMonitor(env).catch((e) => console.error("monitor", e)));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // one address for search engines: www.wixa.dev → wixa.dev (permanent)
    if (url.hostname === "www.wixa.dev") { url.hostname = "wixa.dev"; return Response.redirect(url.toString(), 301); }
    const route = `${request.method} ${url.pathname}`;

    try {
      switch (route) {
        case "GET /":
        case "GET /index.html":
          return await handleHome(request, env, ctx);
        case "HEAD /":
        case "HEAD /index.html": {
          const r = await handleHome(new Request(request.url, { method: "GET", headers: request.headers }), env, ctx);
          return new Response(null, { status: r.status, headers: r.headers });
        }
        case "GET /api/site": {
          const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
          return new Response(cfg.spam.turnstile ? raw : raw.replace(/"turnstile":"[^"]*"/, '"turnstile":""'), {
            headers: { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${SITE_TTL}` },
          });
        }
        case "POST /api/track": return new Response(null, { status: 204 }); // replaced by Cloudflare Web Analytics
        case "GET /admin/":
        case "GET /admin/index.html":
          return await handleAdminPage(request, env);
        case "GET /api/admin/stats": return await handleAdminStats(request, env, url, ctx);
        case "GET /api/admin/notify":
        case "PUT /api/admin/notify":
          return await handleAdminNotify(request, env);
        case "GET /privacy":
        case "HEAD /privacy":
          return await handlePrivacy(request, env, ctx);
        case "GET /api/admin/msgmeta":
        case "PUT /api/admin/msgmeta":
          return await handleAdminMsgMeta(request, env);
        case "GET /api/admin/integrations":
        case "PUT /api/admin/integrations":
          return await handleAdminIntegrations(request, env);
        case "POST /api/admin/integrations/test": return await handleAdminTest(request, env);
        case "POST /api/admin/refresh": return await handleAdminRefresh(request, env);
        case "GET /api/admin/status": return await handleAdminStatus(request, env, ctx);
        case "POST /api/contact": return await handleContact(request, env, ctx);
        case "GET /api/config":
          // Public values the admin dashboard needs to talk to Supabase.
          return json({ env: env.SITE_ENV || "production", supabaseUrl: env.SUPABASE_URL, supabaseKey: env.SUPABASE_PUBLISHABLE_KEY });
        case "GET /sitemap.xml": {
          const today = new Date().toISOString().slice(0, 10);
          let projects = [];
          try { projects = JSON.parse(await getSiteData(env, ctx)).projects || []; } catch {}
          const urls = ["/", "/privacy", ...projects.map((x) => `/projects/${encodeURIComponent(x.slug)}`)].map((p) => `<url><loc>https://wixa.dev${p}</loc><lastmod>${today}</lastmod></url>`).join("");
          return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`, {
            headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
          });
        }
        case "GET /robots.txt": {
          // Keep the staging copy (and the site, if indexing is switched off in the dashboard) out of search engines.
          let indexOff = false;
          try { indexOff = JSON.parse(await getSiteData(env, ctx))?.settings?.seo?.index === false; } catch {}
          return new Response(env.SITE_ENV === "staging" || indexOff ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nDisallow: /admin/\nSitemap: https://wixa.dev/sitemap.xml\n", {
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
          });
        }
        case "GET /health": {
          // the database check is remembered for 30 s, so a flood of /health calls never reaches Supabase
          if (Date.now() - health.at > 30_000) {
            let supabase = "unreachable";
            try {
              const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
              supabase = r.ok ? "ok" : `error ${r.status}`;
            } catch (err) { supabase = `error: ${err.message}`; }
            health = { at: Date.now(), supabase };
          }
          return json({ worker: "ok", env: env.SITE_ENV || "production", supabase: health.supabase }, 200, { "cache-control": "no-store" });
        }
      }
      const proj = url.pathname.match(/^\/projects\/([^/]+)\/?$/);
      if (proj && (request.method === "GET" || request.method === "HEAD")) return await handleProjectPage(request, env, ctx, decodeURIComponent(proj[1]));
      if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "server" }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
