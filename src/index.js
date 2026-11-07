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
import DEV_GUIDE from "../docs/DEVELOPERS.md";

const SITE_TTL = 60; // seconds the site content may be served from cache
// Keep in sync with public/_headers. The sha256 is the inline theme script in index.html.
const CSP = "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://challenges.cloudflare.com 'sha256-NVKT0UrdROLsGcatClpvEhxXytwpjLyEshzIKuByDnE='; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://cloudflareinsights.com https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";
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
    projects: withSlugs(projects), services: withSlugs(services), partners, testimonials,
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
  await caches.default.delete(new Request(`https://wixa-cache.internal/posts/${env.SITE_ENV || "production"}`)).catch(() => {});
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
  reports: { weekly: true, monitor: true, reminders: true },
  backup: { freq: "weekly" }, // daily | weekly | monthly | off
  templates: [
    { title: "شكر واستلام", body: "أهلاً {name}،\nشكراً لتواصلك مع ويكسا. استلمنا طلبك ونراجعه الآن، وسنعود إليك قريباً بالتفاصيل." },
    { title: "طلب موعد اجتماع", body: "أهلاً {name}،\nشكراً لاهتمامك. نود ترتيب اجتماع قصير لفهم متطلباتك بشكل أدق. ما الوقت المناسب لك هذا الأسبوع؟" },
    { title: "إرسال عرض السعر", body: "أهلاً {name}،\nمرفق لك عرض السعر الخاص بمشروعك. يسعدنا الإجابة عن أي سؤال." },
  ],
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
  if (b.backup) next.backup = { freq: ["daily", "weekly", "monthly", "off"].includes(b.backup.freq) ? b.backup.freq : "weekly" };
  if (Array.isArray(b.templates)) next.templates = b.templates.slice(0, 20).map((t) => ({ title: str(t?.title, 60).trim(), body: str(t?.body, 2000) })).filter((t) => t.title || t.body);
  if (b.reports) next.reports = { weekly: b.reports.weekly !== false, monitor: b.reports.monitor !== false, reminders: b.reports.reminders !== false };
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
main{max-width:520px}img{width:84px;height:84px;margin-bottom:18px}h1{font-size:28px;margin:0 0 12px}p{color:var(--mut);line-height:1.9;margin:0 0 18px;font-size:16px}a{color:var(--brand);font-weight:700;text-decoration:none}</style></head>
<body><main><img src="/icons/icon-192.png" alt="WIXA"><h1>${ar ? "نعود قريباً" : "Back soon"}</h1><p>${esc(msg)}</p>${links ? `<p>${links}</p>` : ""}</main></body></html>`;
  return new Response(request.method === "HEAD" ? null : html, { status: 503, headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "3600" } });
}

// GET/PUT /api/admin/integrations — read or change the integrations (admins only)
async function handleAdminIntegrations(request, env) {
  const { error, role } = await adminSession(request, env, request.method === "GET" ? undefined : ["owner"]);
  if (error) return error;
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  cfgMemo.at = 0; // always read the stored copy here
  const cfg = await getConfig(env);
  if (request.method === "GET" && role !== "owner") return json({ templates: cfg.templates }, 200, { "cache-control": "no-store" }); // the team sees only the ready replies
  if (request.method === "GET") {
    const last = await env.PRIVATE.get("backup:last", { type: "json" }).catch(() => null);
    return json({ ...cfg, backup_last: last }, 200, { "cache-control": "no-store" });
  }
  let body = {};
  try { body = await request.json(); } catch {}
  let next;
  try { next = cleanConfig(cfg, body); } catch (e) { return json({ error: e.message, field: e.field }, 422); }
  await saveConfig(env, next);
  return json(next, 200, { "cache-control": "no-store" });
}

// POST /api/admin/integrations/test — send a sample alert or auto-reply to the alerts address
async function handleAdminTest(request, env) {
  const { error } = await adminSession(request, env, ["owner"]);
  if (error) return error;
  let body = {};
  try { body = await request.json(); } catch {}
  const to = await notifyAddress(env);
  if (!env.RESEND_API_KEY || !to) return json({ error: "email_not_configured" }, 503);
  const cfg = await getConfig(env);
  const sample = { name: "زائر تجريبي", email: to, phone: null, message: "هذه رسالة تجريبية من لوحة التحكم.", services: [], lang: body.lang === "en" ? "en" : "ar" };
  if (body.kind === "backup") return (await runBackup(env, true)) ? json({ ok: true, to }) : json({ error: "send_failed" }, 502);
  const ok = body.kind === "weekly" ? await runWeeklyReport(env, true) : body.kind === "autoreply" ? await sendAutoReply(env, cfg, sample, true) : await notifyOwner(env, sample, true);
  return ok ? json({ ok: true, to }) : json({ error: "send_failed" }, 502);
}

// POST /api/admin/refresh — show the latest content on the site now
async function handleAdminRefresh(request, env) {
  const { error } = await adminSession(request, env, ["owner", "editor"]);
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
// /about, /pricing and /careers are the homepage's HTML showing only their own sections (html[data-page])
const PAGE_TITLES = { about: { ar: "من نحن", en: "About us" }, pricing: { ar: "الباقات والأسعار", en: "Packages & pricing" }, careers: { ar: "الوظائف", en: "Careers" }, contact: { ar: "تواصل معنا", en: "Contact us" } };
async function handleHome(request, env, ctx, pageName = "home") {
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
  const seo = st.seo || {};
  const origin = new URL(request.url).origin;
  const abs = (u) => (/^https?:\/\//.test(u) ? u : `${origin}${u.startsWith("/") ? "" : "/"}${u}`);
  const attr = (sel, name, val) => [sel, { element: (el) => { if (val) el.setAttribute(name, val); } }];
  const siteTitle = seo[`title_${lang}`] || (lang === "en" ? SEO_DEFAULTS.en.title : ""), siteDesc = seo[`description_${lang}`] || (lang === "en" ? SEO_DEFAULTS.en.description : ""), img = seo.og_image ? abs(seo.og_image) : "";
  const pc = st.content?.[lang] || {}, brandName = (lang === "en" ? st.brand?.name_en : st.brand?.name_ar) || "WIXA";
  const pageDesc = { about: pc.about_text, pricing: pc.pricing_sub, careers: pc.careers_sub, contact: pc.cta_sub }[pageName];
  const title = pageName === "home" ? siteTitle : `${PAGE_TITLES[pageName][lang]} — ${brandName}`;
  const desc = pageName === "home" ? siteDesc : String(pageDesc || siteDesc || "").replace(/\s+/g, " ").slice(0, 160);
  const pagePath = pageName === "home" ? "/" : `/${pageName}`;
  const headTags = [
    seo.google_verification && `<meta name="google-site-verification" content="${esc(seo.google_verification)}">`,
    seo.bing_verification && `<meta name="msvalidate.01" content="${esc(seo.bing_verification)}">`,
    seo.index === false && `<meta name="robots" content="noindex, nofollow">`,
    faqLd(st, lang),
    // one address, two languages: tell search engines about both versions
    `<link rel="alternate" hreflang="ar" href="${origin}${pagePath}?lang=ar"><link rel="alternate" hreflang="en" href="${origin}${pagePath}?lang=en"><link rel="alternate" hreflang="x-default" href="${origin}${pagePath}">`,
  ].filter(Boolean).join("");
  const words = (t) => String(t).split(/\s+/).filter(Boolean).map((w, i) => `<span class="word"><span style="transition-delay:${i * 70}ms">${esc(w)}</span></span>`).join(" ");
  const fill = (key, html) => ({ element: (el) => { if (hero[key]) el.setInnerContent(html ? words(hero[key]) : hero[key], { html }); } });
  const res = new HTMLRewriter()
    .on("head", { element: (el) => el.append(`${headTags}<script id="wixa-data" type="application/json">${safe}</script>`, { html: true }) })
    .on("html", { element: (el) => { el.setAttribute("lang", lang); el.setAttribute("dir", lang === "ar" ? "rtl" : "ltr"); el.setAttribute("data-page", pageName); } })
    .on(...attr('link[rel="canonical"]', "href", `${origin}${pagePath}`))
    .on(...attr('meta[property="og:url"]', "content", `${origin}${pagePath}`))
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
// Roles: owner (everything) · editor (content and look) · support (messages and appointments).
// `roles` lists who may use an endpoint; omitted = any dashboard user.
async function adminSession(request, env, roles) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return { error: json({ error: "unauthorized" }, 401) };
  const asUser = (path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: auth, "content-type": "application/json", ...(init.headers || {}) } });
  let role = null;
  try {
    const r = await asUser("rpc/admin_role", { method: "POST", body: "{}" });
    if (r.ok) role = await r.json();
    else if (r.status === 404) { // before the team update is applied: every dashboard user is the owner
      const adm = await asUser("rpc/is_admin", { method: "POST", body: "{}" });
      role = adm.ok && (await adm.json()) === true ? "owner" : null;
    }
  } catch { return { error: json({ error: "auth_unavailable" }, 503) }; }
  if (!role) return { error: json({ error: "forbidden" }, 403) };
  if (roles && !roles.includes(role)) return { error: json({ error: "role_forbidden", role }, 403) };
  return { asUser, role };
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
  const { error } = await adminSession(request, env, ["owner"]);
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
  const { error } = await adminSession(request, env, ["owner"]);
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
    body: JSON.stringify({ from: `${cfg.alerts.from_name} <notify@wixa.dev>`, to: [to], reply_to: row.email, subject: `${test ? "[اختبار] " : ""}${staging ? "[تجريبي] " : ""}${/^(طلب توظيف|حجز موعد)/.test(row.services?.[0] || "") ? `${row.services[0]} — ${row.name}` : `رسالة جديدة من ${row.name}`}`, html }),
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
    marketing: body.marketing === true, // agreed to receive offers (unticked by default)
    source: clean(body.source, 60), // where the visitor came from (Google, Instagram…)
  };
  if (body.kind === "booking" && !row.message) row.message = "حجز موعد";
  if (!row.name || !row.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return json({ error: "validation" }, 422);
  if (!row.phone || row.phone.replace(/\D/g, "").length < 7) return json({ error: "phone_required" }, 422);
  if (body.kind === "booking") {
    const date = clean(body.date, 10), time = clean(body.time, 5);
    if (!(await reserveSlot(env, ctx, date, time))) return json({ error: "slot_taken" }, 409);
    const dayName = new Date(`${date}T00:00:00Z`).toLocaleDateString("ar-IQ", { weekday: "long", timeZone: "UTC" });
    row.services = [`حجز موعد: ${dayName} ${date} الساعة ${time}`];
    row.message = row.message || "حجز موعد";
  }
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
${font === "Alexandria" ? '<link rel="preload" href="/fonts/alexandria/alexandria-arabic-800-normal.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/fonts/alexandria.css">' : `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;700;800&display=swap">`}
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
.cat{display:inline-block;font-size:.8rem;font-weight:700;padding:3px 12px;border-radius:99px;background:color-mix(in srgb,var(--p) 12%,transparent);color:var(--p)}
.lead{font-size:1.1rem;color:var(--m)}p,li{color:var(--m)}ul{padding-inline-start:20px}
.gallery{display:grid;gap:12px;margin:24px 0}.gallery img{width:100%;border-radius:18px;border:1px solid var(--l);display:block}
.gallery .mob{max-width:300px;justify-self:center}
.stats{display:flex;flex-wrap:wrap;gap:28px;margin:24px 0;padding:20px 0;border-top:1px solid var(--l);border-bottom:1px solid var(--l)}
.stats b{display:block;font-size:1.6rem;color:var(--t)}.stats span{color:var(--m);font-size:.9rem}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:13px 24px;border-radius:99px;text-decoration:none;font-weight:700;background:var(--p);color:#fff}
.btn--ghost{background:var(--s);color:var(--t);border:1px solid var(--l)}.btn--wa{background:#25D366;color:#fff}
.sub{display:flex;gap:6px;overflow-x:auto;padding:0 0 6px;scrollbar-width:none}.sub a{flex-shrink:0;padding:6px 12px;border-radius:99px;text-decoration:none;color:var(--m);font-size:.85rem}.sub a:hover{color:var(--t);background:var(--s)}
.case{display:grid;gap:12px;margin:24px 0}.case div{padding:18px 20px;border-radius:16px;border:1px solid var(--l);background:var(--s)}.case h3{margin:0 0 6px;font-size:1rem;color:var(--p,#5B21B6)}.case p{margin:0}
.more{margin-top:40px;padding-top:24px;border-top:1px solid var(--l)}.more h2{margin-top:0}.more__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.more__grid a{display:block;padding:16px;border-radius:16px;border:1px solid var(--l);background:var(--s);text-decoration:none;color:var(--t)}.more__grid b{display:block}.more__grid span{color:var(--m);font-size:.85rem}
.btn--wa{background:#25D366}.hp{position:absolute;left:-9999px;opacity:0}
.btn{min-height:48px;padding:0 22px;font-size:.9375rem;line-height:1.2;box-sizing:border-box}
h1{font-size:1.75rem}h2{font-size:1.25rem}.lead{font-size:1rem}header .home{font-size:1.0625rem}header .home img{width:34px;height:34px}
header nav a{min-height:40px;display:inline-flex;align-items:center;padding:0 14px;font-size:.875rem}
.sub a{font-size:.875rem;min-height:40px;display:inline-flex;align-items:center}
.more__grid b{font-size:1.0625rem;line-height:1.5}.more__grid span{font-size:.875rem}p,li{font-size:.9375rem}
@media(min-width:768px){h1{font-size:2.25rem}h2{font-size:1.5rem}.lead{font-size:1.0625rem}p,li{font-size:1rem}}
@media(min-width:1200px){h1{font-size:2.75rem}.lead{font-size:1.125rem}.btn{min-height:50px;padding:0 26px}}
.posts{display:grid;gap:14px;margin-top:20px}.post{display:grid;grid-template-columns:160px 1fr;gap:16px;padding:14px;border-radius:18px;border:1px solid var(--l);background:var(--s);text-decoration:none;color:var(--t)}
.post img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:12px}.post b{display:block;font-size:1.1rem}.post span{font-size:.8rem;color:var(--m)}.post p{margin:6px 0 0;font-size:.92rem}
@media(max-width:560px){.post{grid-template-columns:1fr}}
article h2{margin-top:30px}article p,article li{font-size:1.05rem}
.rv{display:grid;gap:14px;margin-top:20px}.rv label{display:grid;gap:6px;font-weight:700}.rv input,.rv textarea{font:inherit;padding:12px 14px;border-radius:14px;border:1px solid var(--l);background:var(--s);color:var(--t)}
.rv fieldset{border:0;padding:0;margin:0}.rv legend{font-weight:700;margin-bottom:6px}.stars{display:flex;flex-wrap:wrap;gap:6px}
.star input{position:absolute;opacity:0}.star span{display:inline-block;padding:6px 12px;border-radius:99px;border:1px solid var(--l);background:var(--s);color:#D9A441;cursor:pointer}
.star input:checked+span{border-color:var(--p);box-shadow:0 0 0 3px color-mix(in srgb,var(--p) 20%,transparent)}.rv .btn{justify-self:start;border:0;font:inherit;font-weight:700;cursor:pointer}
footer{border-top:1px solid var(--l);padding:22px 0;font-size:.85rem;color:var(--m);display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between}
footer a{color:var(--m)}
</style></head><body><div class="wrap">
<header><a class="home" href="/?lang=${lang}"><img src="/icons/icon-96.png" alt="">${esc(brand)}</a>
<nav><a href="${path}?lang=${other}" hreflang="${other}">${ar ? "English" : "العربية"}</a><a href="/?lang=${lang}">${ar ? "الرئيسية" : "Home"}</a></nav></header>
<nav class="sub">${[["#projects", ar ? "حلولنا" : "Solutions"], ["#services", ar ? "خدماتنا" : "Services"], ["#calculator", ar ? "احسب تكلفة مشروعك" : "Estimate your project"], ["#careers", ar ? "الوظائف" : "Careers"], ["#contact", ar ? "تواصل معنا" : "Contact"]].map(([h, t]) => `<a href="/?lang=${lang}${h}">${t}</a>`).join("")}<a href="/blog?lang=${lang}">${ar ? "المقالات" : "Articles"}</a></nav>
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
  const others = (d.projects || []).filter((x) => x !== p).slice(0, 3);
  const origin = new URL(request.url).origin;
  const body = `${T("category") ? `<span class="cat">${esc(T("category"))}</span>` : ""}<h1>${esc(T("title"))}</h1>
    ${T("summary") ? `<p class="lead">${esc(T("summary"))}</p>` : ""}
    ${imgs.length || mob ? `<div class="gallery">${imgs.map((u) => `<img src="${esc(u)}" alt="${esc(T("title"))}" loading="lazy">`).join("")}${mob ? `<img class="mob" src="${esc(mob)}" alt="" loading="lazy">` : ""}</div>` : ""}
    ${stats.length ? `<div class="stats">${stats.map((x) => `<div><b>${esc(x.value)}</b><span>${esc(x[`label_${lang}`] || x.label_ar || "")}</span></div>`).join("")}</div>` : ""}
    ${(() => { // case study: the challenge → our solution → the result
      const cs = [["problem", lang === "ar" ? "التحدي" : "The challenge"], ["solution", lang === "ar" ? "الحل" : "Our solution"], ["result", lang === "ar" ? "النتيجة" : "The result"]].filter(([f]) => T(f).trim());
      return cs.length ? `<div class="case">${cs.map(([f, h]) => `<div><h3>${h}</h3><p>${esc(T(f)).replace(/\n/g, "<br>")}</p></div>`).join("")}</div>` : "";
    })()}
    ${detailsHtml(T("details"))}
    ${link ? `<p><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link.replace(/^https?:\/\//, "").replace(/\/$/, ""))} ↗</a></p>` : ""}
    ${others.length ? `<section class="more"><h2>${lang === "ar" ? "مشاريع أخرى" : "More projects"}</h2><div class="more__grid">${others.map((o) => {
      const t = (f) => o[`${f}_${lang}`] || o[`${f}_ar`] || o[`${f}_en`] || "";
      return `<a href="/projects/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(t("title"))}</b><span>${esc(t("category") || t("summary").slice(0, 70))}</span></a>`;
    }).join("")}</div></section>` : ""}`;
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

// ---------------------------------------------------------------- service pages
// GET /services/<slug> — one page per service, with a few projects and a ready WhatsApp question
async function handleServicePage(request, env, ctx, slug) {
  const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
  let d = {};
  try { d = JSON.parse(raw); } catch {}
  const st = d.settings || {};
  if (cfg.maintenance.on && !hasBypass(request, cfg)) return maintenancePage(request, cfg, st);
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const sv = (d.services || []).find((x) => x.slug === slug || String(x.id) === slug);
  if (!sv) return notFound(request, env);
  const T = (o, f) => o[`${f}_${lang}`] || o[`${f}_ar`] || o[`${f}_en`] || "";
  const wa = String(st.contact?.whatsapp || "").replace(/\D/g, "");
  const ask = ar ? `مرحباً ويكسا، أريد الاستفسار عن: ${T(sv, "title")}` : `Hello WIXA, I'd like to ask about: ${T(sv, "title")}`;
  const projects = (d.projects || []).slice(0, 3);
  const others = (d.services || []).filter((x) => x !== sv);
  const body = `<span class="cat">${ar ? "خدماتنا" : "Our services"}</span><h1>${esc(T(sv, "title"))}</h1>
    ${T(sv, "summary") ? `<p class="lead">${esc(T(sv, "summary"))}</p>` : ""}
    ${detailsHtml(T(sv, "details"))}
    ${wa ? `<p><a class="btn btn--wa" href="https://wa.me/${wa}?text=${encodeURIComponent(ask)}" target="_blank" rel="noopener">${ar ? "اسأل عن هذه الخدمة عبر واتساب" : "Ask about this service on WhatsApp"}</a></p>` : ""}
    ${projects.length ? `<section class="more"><h2>${ar ? "من أعمالنا" : "From our work"}</h2><div class="more__grid">${projects.map((o) => `<a href="/projects/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(T(o, "title"))}</b><span>${esc(T(o, "category") || T(o, "summary").slice(0, 70))}</span></a>`).join("")}</div></section>` : ""}
    ${others.length ? `<section class="more"><h2>${ar ? "خدمات أخرى" : "Other services"}</h2><div class="more__grid">${others.map((o) => `<a href="/services/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(T(o, "title"))}</b><span>${esc(T(o, "summary").slice(0, 80))}</span></a>`).join("")}</div></section>` : ""}`;
  const origin = new URL(request.url).origin;
  return simplePage(request, st, {
    lang, title: T(sv, "title"), description: (T(sv, "summary") || T(sv, "details")).slice(0, 160), path: `/services/${encodeURIComponent(sv.slug)}`, body,
    jsonld: { "@context": "https://schema.org", "@type": "Service", name: T(sv, "title"), description: T(sv, "summary"), areaServed: "IQ", provider: { "@type": "Organization", name: "WIXA", url: origin } },
  });
}

const notFound = (request, env) => env.ASSETS.fetch(new Request(new URL("/404.html", request.url), request)).then((r) => new Response(r.body, { status: 404, headers: r.headers }));

// ---------------------------------------------------------------- articles (blog)
// Published articles, read at most once a minute per location.
async function getPosts(env) {
  const cache = caches.default;
  const key = new Request(`https://wixa-cache.internal/posts/${env.SITE_ENV || "production"}`);
  const hit = await cache.match(key);
  if (hit && Date.now() - (Number(hit.headers.get("x-saved-at")) || 0) < SITE_TTL * 1000) return hit.json();
  try {
    const r = await sb(env, "posts?select=*&published=eq.true&order=published_at.desc.nullslast,created_at.desc&limit=200");
    if (!r.ok) throw new Error(`posts ${r.status}`);
    const list = await r.json();
    await cache.put(key, new Response(JSON.stringify(list), { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400", "x-saved-at": String(Date.now()) } }));
    return list;
  } catch (e) {
    console.error("posts", e);
    return hit ? hit.json() : [];
  }
}

// Article text: blank lines → paragraphs, "## " → heading, "- " / "• " → list, links become clickable, **bold**.
function articleHtml(raw) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return String(raw || "").split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return "";
    if (lines.length === 1 && /^#{2,3}\s/.test(lines[0])) return `<h2>${inline(lines[0].replace(/^#+\s*/, ""))}</h2>`;
    let html = "";
    if (/^#{2,3}\s/.test(lines[0])) html += `<h2>${inline(lines.shift().replace(/^#+\s*/, ""))}</h2>`;
    const items = lines.filter((l) => /^[-•]\s?/.test(l)), text = lines.filter((l) => !/^[-•]\s?/.test(l));
    if (text.length) html += `<p>${text.map(inline).join("<br>")}</p>`;
    if (items.length) html += `<ul>${items.map((l) => `<li>${inline(l.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul>`;
    return html;
  }).join("");
}

const fmtDate = (d, lang) => { try { return new Date(d).toLocaleDateString(lang === "ar" ? "ar-IQ" : "en-GB", { dateStyle: "long", timeZone: "Asia/Baghdad" }); } catch { return ""; } };

// GET /blog and /blog/<slug>
async function handleBlog(request, env, ctx, slug) {
  const [raw, cfg, posts] = await Promise.all([getSiteData(env, ctx), getConfig(env), getPosts(env)]);
  let st = {};
  try { st = JSON.parse(raw).settings || {}; } catch {}
  if (cfg.maintenance.on && !hasBypass(request, cfg)) return maintenancePage(request, cfg, st);
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const T = (o, f) => o[`${f}_${lang}`] || o[`${f}_ar`] || o[`${f}_en`] || "";
  const origin = new URL(request.url).origin;
  if (!slug) {
    const body = `<h1>${ar ? "المقالات" : "Articles"}</h1><p class="lead">${ar ? "أفكار ونصائح عن المواقع والتطبيقات والأنظمة الرقمية." : "Ideas and advice on websites, apps and digital systems."}</p>
      ${posts.length ? `<div class="posts">${posts.map((p) => `<a class="post" href="/blog/${encodeURIComponent(p.slug)}?lang=${lang}">${safeHref(p.cover_url) ? `<img src="${esc(safeHref(p.cover_url))}" alt="" loading="lazy">` : ""}<div><b>${esc(T(p, "title"))}</b><span>${esc(fmtDate(p.published_at || p.created_at, lang))}</span><p>${esc(T(p, "excerpt"))}</p></div></a>`).join("")}</div>` : `<p>${ar ? "ستُنشر المقالات هنا قريباً." : "Articles will appear here soon."}</p>`}`;
    return simplePage(request, st, { lang, title: ar ? "المقالات" : "Articles", description: ar ? "مقالات ويكسا عن تطوير المواقع والتطبيقات والأنظمة." : "WIXA articles on building websites, apps and systems.", path: "/blog", body });
  }
  const p = posts.find((x) => x.slug === slug);
  if (!p) return notFound(request, env);
  const cover = safeHref(p.cover_url);
  const others = posts.filter((x) => x !== p).slice(0, 3);
  const body = `<span class="cat">${esc(fmtDate(p.published_at || p.created_at, lang))}</span><h1>${esc(T(p, "title"))}</h1>
    ${T(p, "excerpt") ? `<p class="lead">${esc(T(p, "excerpt"))}</p>` : ""}
    ${cover ? `<div class="gallery"><img src="${esc(cover)}" alt=""></div>` : ""}
    <article>${articleHtml(T(p, "body"))}</article>
    ${others.length ? `<section class="more"><h2>${ar ? "مقالات أخرى" : "More articles"}</h2><div class="more__grid">${others.map((o) => `<a href="/blog/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(T(o, "title"))}</b><span>${esc(T(o, "excerpt").slice(0, 80))}</span></a>`).join("")}</div></section>` : ""}`;
  return simplePage(request, st, {
    lang, title: T(p, "title"), description: (T(p, "excerpt") || T(p, "body")).slice(0, 160), path: `/blog/${encodeURIComponent(p.slug)}`, image: cover, body,
    jsonld: { "@context": "https://schema.org", "@type": "Article", headline: T(p, "title"), description: T(p, "excerpt"), datePublished: p.published_at || p.created_at, dateModified: p.updated_at, ...(cover ? { image: cover } : {}), author: { "@type": "Organization", name: "WIXA" }, publisher: { "@type": "Organization", name: "WIXA", url: origin }, mainEntityOfPage: `${origin}/blog/${encodeURIComponent(p.slug)}` },
  });
}

// ---------------------------------------------------------------- appointments
// Opening hours come from the dashboard (settings.booking); booked times are kept in the private store.
const BAGHDAD_OFFSET = 3 * 3600e3; // Iraq: UTC+3, no daylight saving
const baghdadNow = () => new Date(Date.now() + BAGHDAD_OFFSET); // read with getUTC* = Baghdad wall clock
const toMin = (hm) => { const [h, m] = String(hm || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const toHM = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
function bookingRules(st) {
  const b = st.booking || {};
  return { on: b.on === true, days: Array.isArray(b.days) ? b.days.map(Number) : [0, 1, 2, 3, 4], from: b.from || "10:00", to: b.to || "16:00", slot: Math.min(240, Math.max(15, Number(b.slot) || 30)), ahead: Math.min(60, Math.max(1, Number(b.days_ahead) || 14)) };
}
function slotsFor(rules, date) {
  const now = baghdadNow(), today = now.toISOString().slice(0, 10);
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const diff = Math.round((d - new Date(`${today}T00:00:00Z`)) / 864e5);
  if (diff < 0 || diff > rules.ahead || !rules.days.includes(d.getUTCDay())) return [];
  const out = [], nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (let m = toMin(rules.from); m + rules.slot <= toMin(rules.to); m += rules.slot) if (diff > 0 || m > nowMin + 60) out.push(toHM(m));
  return out;
}
// GET /api/slots?date=YYYY-MM-DD → free times that day
async function handleSlots(request, env, ctx, url) {
  let st = {};
  try { st = JSON.parse(await getSiteData(env, ctx)).settings || {}; } catch {}
  const rules = bookingRules(st);
  if (!rules.on) return json({ slots: [] });
  const date = url.searchParams.get("date") || "";
  const all = slotsFor(rules, date);
  const taken = env.PRIVATE ? ((await env.PRIVATE.get(`book:${date}`, { type: "json" }).catch(() => null)) || []) : [];
  return json({ slots: all.filter((t) => !taken.includes(t)) }, 200, { "cache-control": "no-store" });
}
async function reserveSlot(env, ctx, date, time) {
  let st = {};
  try { st = JSON.parse(await getSiteData(env, ctx)).settings || {}; } catch {}
  const rules = bookingRules(st);
  if (!rules.on || !slotsFor(rules, date).includes(time) || !env.PRIVATE) return false;
  const key = `book:${date}`;
  const taken = (await env.PRIVATE.get(key, { type: "json" }).catch(() => null)) || [];
  if (taken.includes(time)) return false;
  taken.push(time);
  await env.PRIVATE.put(key, JSON.stringify(taken), { expirationTtl: 90 * 864e2 });
  return true;
}

// DELETE /api/admin/booking {date, time} — cancel an appointment: its time becomes free to book again
async function handleAdminBooking(request, env) {
  const { error } = await adminSession(request, env);
  if (error) return error;
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  let b = {};
  try { b = await request.json(); } catch {}
  const date = String(b.date || ""), time = String(b.time || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return json({ error: "invalid" }, 422);
  const key = `book:${date}`;
  const taken = ((await env.PRIVATE.get(key, { type: "json" }).catch(() => null)) || []).filter((t) => t !== time);
  await env.PRIVATE.put(key, JSON.stringify(taken), { expirationTtl: 90 * 864e2 });
  return json({ ok: true, free: time });
}

// ---------------------------------------------------------------- client review links
// The owner creates a one-time link in the dashboard; the client's review arrives hidden until published.
async function handleAdminReviewLink(request, env) {
  const { error } = await adminSession(request, env, ["owner", "editor"]);
  if (error) return error;
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  let b = {};
  try { b = await request.json(); } catch {}
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await env.PRIVATE.put(`review:${code}`, JSON.stringify({ name: String(b.name || "").slice(0, 120), at: new Date().toISOString() }), { expirationTtl: 60 * 864e2 });
  const origin = new URL(request.url).origin;
  return json({ url: `${origin}/review?c=${code}${b.lang === "en" ? "&lang=en" : ""}`, days: 60 });
}

async function handleReview(request, env, ctx, url) {
  let st = {};
  try { st = JSON.parse(await getSiteData(env, ctx)).settings || {}; } catch {}
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const page = (body, status = 200) => simplePage(request, st, { lang, title: ar ? "رأيك يهمنا" : "Your feedback", description: "", path: "/review", body, status });
  const done = (msg) => page(`<h1>${ar ? "شكراً لك" : "Thank you"}</h1><p class="lead">${msg}</p>`);
  if (request.method === "POST") {
    if (!(await allowed(env.CONTACT_LIMITER, clientIp(request)))) return page(`<h1>${ar ? "حاول بعد قليل" : "Please try again shortly"}</h1>`, 429);
    const f = await request.formData().catch(() => null);
    if (!f || f.get("website")) return done(ar ? "وصل رأيك." : "We received your review.");
    const code = String(f.get("c") || "").slice(0, 32);
    const link = code && env.PRIVATE ? await env.PRIVATE.get(`review:${code}`) : null;
    if (!link) return page(`<h1>${ar ? "الرابط غير صالح" : "This link is not valid"}</h1><p class="lead">${ar ? "ربما استُخدم من قبل أو انتهت صلاحيته." : "It may have been used already or expired."}</p>`, 410);
    const name = String(f.get("name") || "").trim().slice(0, 120), quote = String(f.get("quote") || "").trim().slice(0, 1500);
    if (!name || !quote) return page(`<h1>${ar ? "يرجى كتابة اسمك ورأيك" : "Please enter your name and review"}</h1><p><a href="/review?c=${esc(code)}&lang=${lang}">${ar ? "رجوع" : "Back"}</a></p>`, 422);
    const p = { name, role: String(f.get("role") || "").trim().slice(0, 120), quote, rating: Math.min(5, Math.max(1, Number(f.get("rating")) || 5)), lang };
    const r = await sb(env, "rpc/submit_testimonial", { method: "POST", body: JSON.stringify({ token: env.WRITE_TOKEN || "", p }) });
    if (!r.ok) { console.error("review", r.status, await r.text()); return page(`<h1>${ar ? "تعذّر الإرسال" : "Couldn't send"}</h1><p class="lead">${ar ? "حاول مرة أخرى لاحقاً." : "Please try again later."}</p>`, 502); }
    await env.PRIVATE.delete(`review:${code}`);
    ctx.waitUntil(sendOwnerMail(env, `رأي جديد من ${name}`, mailBox("رأي عميل جديد بانتظار موافقتك", `<p><b>${esc(name)}</b>${p.role ? ` — ${esc(p.role)}` : ""}</p><p style="color:#D9A441;font-size:20px">${"★".repeat(p.rating)}</p><div style="padding:14px;background:#F8EEF1;border-radius:12px;white-space:pre-wrap">${esc(quote)}</div><p>الرأي مخفي حتى تنشره من لوحة التحكم ← آراء العملاء.</p>`)).catch(() => {}));
    return done(ar ? "وصل رأيك، ونقدّر وقتك وثقتك بنا." : "We've received your review. We appreciate your time and trust.");
  }
  const code = (url.searchParams.get("c") || "").slice(0, 32);
  const link = code && env.PRIVATE ? await env.PRIVATE.get(`review:${code}`, { type: "json" }) : null;
  if (!link) return page(`<h1>${ar ? "الرابط غير صالح" : "This link is not valid"}</h1><p class="lead">${ar ? "ربما استُخدم من قبل أو انتهت صلاحيته. تواصل معنا لنرسل لك رابطاً جديداً." : "It may have been used already or expired. Contact us for a new one."}</p>`, 410);
  const stars = [5, 4, 3, 2, 1].map((n) => `<label class="star"><input type="radio" name="rating" value="${n}" ${n === 5 ? "checked" : ""}><span>${"★".repeat(n)}</span></label>`).join("");
  return page(`<h1>${ar ? "رأيك يهمنا" : "We'd love your feedback"}</h1><p class="lead">${ar ? "شكراً لثقتك بويكسا. اكتب رأيك في تجربتك معنا، وقد نعرضه في موقعنا بعد موافقتك." : "Thank you for trusting WIXA. Tell us about your experience; we may show it on our site."}</p>
    <form class="rv" method="post" action="/review?lang=${lang}">
      <input type="hidden" name="c" value="${esc(code)}"><input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label>${ar ? "اسمك" : "Your name"} *<input name="name" required maxlength="120" value="${esc(link.name || "")}"></label>
      <label>${ar ? "منصبك أو اسم شركتك" : "Your role or company"}<input name="role" maxlength="120"></label>
      <fieldset><legend>${ar ? "تقييمك" : "Your rating"}</legend><div class="stars">${stars}</div></fieldset>
      <label>${ar ? "رأيك" : "Your review"} *<textarea name="quote" required maxlength="1500" rows="5"></textarea></label>
      <button class="btn" type="submit">${ar ? "إرسال" : "Send"}</button>
    </form>`);
}

// ---------------------------------------------------------------- visitor actions (calculator, WhatsApp, forms…)
// Counted per day in the private store. Each visit sends one small batch; counts are merged in memory and saved
// at most every 30 s per instance, so busy days stay far below the store's write limits.
const EVENTS = ["calc_used", "calc_quote", "calc_wa", "calc_pdf", "wa_click", "form_open", "form_sent", "booking_open", "booking_sent", "job_open", "faq_open"];
let evBuf = { day: "", counts: {}, at: 0 };
async function flushEvents(env) {
  if (!env.PRIVATE || !Object.keys(evBuf.counts).length) return;
  const { day, counts } = evBuf;
  evBuf = { day: dayKey(), counts: {}, at: Date.now() };
  const key = `ev:${day}`;
  const cur = (await env.PRIVATE.get(key, { type: "json" }).catch(() => null)) || {};
  for (const [k, v] of Object.entries(counts)) cur[k] = (cur[k] || 0) + v;
  await env.PRIVATE.put(key, JSON.stringify(cur), { expirationTtl: 120 * 864e2 });
}
async function handleEvent(request, env, ctx) {
  if (!(await allowed(env.TRACK_LIMITER, clientIp(request)))) return new Response(null, { status: 204 });
  let b = {};
  try { b = JSON.parse(await request.text()); } catch {}
  const list = Array.isArray(b.e) ? b.e.slice(0, 30) : [];
  const day = dayKey();
  if (evBuf.day && evBuf.day !== day) ctx.waitUntil(flushEvents(env));
  if (!evBuf.day) evBuf.day = day;
  for (const e of new Set(list)) if (EVENTS.includes(e)) evBuf.counts[e] = (evBuf.counts[e] || 0) + 1;
  if (Date.now() - evBuf.at > 30_000) { evBuf.at = Date.now(); ctx.waitUntil(flushEvents(env).catch((e) => console.error("events", e))); }
  return new Response(null, { status: 204 });
}
// GET /api/admin/funnel?days=30 — totals for the dashboard
async function handleAdminFunnel(request, env, url) {
  const { error } = await adminSession(request, env);
  if (error) return error;
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10) || 30));
  const keys = [...Array(days)].map((_, i) => dayKey(new Date(Date.now() - i * 864e5)));
  const rows = await Promise.all(keys.map((d) => (env.PRIVATE ? env.PRIVATE.get(`ev:${d}`, { type: "json" }).catch(() => null) : null)));
  const total = {};
  for (const r of rows) if (r) for (const [k, v] of Object.entries(r)) total[k] = (total[k] || 0) + v;
  for (const [k, v] of Object.entries(evBuf.counts)) total[k] = (total[k] || 0) + v; // not saved yet
  return json({ days, total }, 200, { "cache-control": "no-store" });
}

// ---------------------------------------------------------------- scheduled backup (daily / weekly / monthly / off)
async function runBackup(env, force = false) {
  const cfg = await getConfig(env);
  const freq = cfg.backup.freq;
  const now = baghdadNow();
  const due = force || freq === "daily" || (freq === "weekly" && now.getUTCDay() === 0) || (freq === "monthly" && now.getUTCDate() === 1);
  if (!due || freq === "off" && !force) return false;
  const r = await sb(env, "rpc/export_backup", { method: "POST", body: JSON.stringify({ token: env.WRITE_TOKEN || "" }) });
  if (!r.ok) { console.error("backup export", r.status, await r.text()); return false; }
  const text = await r.text();
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const to = await notifyAddress(env);
  if (!env.RESEND_API_KEY || !to) return false;
  const site = env.SITE_ENV === "staging" ? "staging.wixa.dev" : "wixa.dev";
  const date = now.toISOString().slice(0, 10);
  const label = { daily: "يومية", weekly: "أسبوعية", monthly: "شهرية", off: "يدوية" }[freq] || "";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `${cfg.alerts.from_name} <notify@wixa.dev>`, to: [to],
      subject: `${force ? "[يدوي] " : ""}نسخة احتياطية ${label} — ${site} — ${date}`,
      html: mailBox("نسخة احتياطية من موقع ويكسا", `<p>مرفق ملف فيه كل محتوى الموقع (${(bytes.length / 1024).toFixed(0)} KB): الإعدادات والنصوص والمشاريع والخدمات والشركاء والآراء والمقالات والرسائل.</p><p>احتفظ به في مكان آمن؛ يمكن استرجاع الموقع منه عند الحاجة.</p>`),
      attachments: [{ filename: `wixa-backup-${site}-${date}.json`, content: btoa(bin) }],
    }),
  });
  if (!res.ok) { console.error("backup mail", res.status, await res.text()); return false; }
  if (env.PRIVATE) await env.PRIVATE.put("backup:last", JSON.stringify({ at: new Date().toISOString(), size: bytes.length, manual: force }));
  return true;
}

// ---------------------------------------------------------------- error log (site + server)
// The last 50 problems, kept in the private store: errors in visitors' browsers (sent by the page) and on the server.
// Repeats of the same error are counted instead of stored again. Written at most every 30 s per instance.
let errBuf = { list: [], at: 0 };
const errKey = (e) => `${e.where}|${e.msg}|${e.src || ""}`.slice(0, 300);
async function flushErrors(env) {
  if (!env.PRIVATE || !errBuf.list.length) return;
  const add = errBuf.list; errBuf = { list: [], at: Date.now() };
  const cur = (await env.PRIVATE.get("errors", { type: "json" }).catch(() => null)) || [];
  for (const e of add) {
    const old = cur.find((x) => errKey(x) === errKey(e));
    if (old) { old.count = (old.count || 1) + (e.count || 1); old.last = e.last; old.path = e.path || old.path; }
    else cur.unshift(e);
  }
  cur.sort((a, b) => String(b.last).localeCompare(String(a.last)));
  await env.PRIVATE.put("errors", JSON.stringify(cur.slice(0, 50)));
}
function recordError(env, ctx, e) {
  const item = { where: e.where, msg: String(e.msg || "").slice(0, 300), src: String(e.src || "").slice(0, 200), path: String(e.path || "").slice(0, 200), ua: String(e.ua || "").slice(0, 160), first: new Date().toISOString(), last: new Date().toISOString(), count: 1 };
  const same = errBuf.list.find((x) => errKey(x) === errKey(item));
  if (same) { same.count++; same.last = item.last; } else if (errBuf.list.length < 30) errBuf.list.push(item);
  if (Date.now() - errBuf.at > 30_000) { errBuf.at = Date.now(); ctx.waitUntil(flushErrors(env).catch(() => {})); }
}
// POST /api/client-error — a visitor's browser reports a script error
async function handleClientError(request, env, ctx) {
  if (!(await allowed(env.TRACK_LIMITER, clientIp(request)))) return new Response(null, { status: 204 });
  let b = {};
  try { b = JSON.parse(await request.text()); } catch {}
  if (!b.msg) return new Response(null, { status: 204 });
  // only errors from this site's own scripts (browser extensions and in-app browsers add their own noise)
  const origin = new URL(request.url).origin;
  if (b.src && !String(b.src).startsWith(origin)) return new Response(null, { status: 204 });
  recordError(env, ctx, { where: b.where === "admin" ? "admin" : "site", msg: b.msg, src: `${String(b.src || "").replace(origin, "")}${b.line ? `:${b.line}` : ""}`, path: b.path, ua: request.headers.get("user-agent") });
  return new Response(null, { status: 204 });
}
// GET / DELETE /api/admin/errors
async function handleAdminErrors(request, env) {
  const { error } = await adminSession(request, env, ["owner"]);
  if (error) return error;
  if (!env.PRIVATE) return json([]);
  if (request.method === "DELETE") { await env.PRIVATE.delete("errors"); errBuf = { list: [], at: 0 }; return json({ ok: true }); }
  const saved = (await env.PRIVATE.get("errors", { type: "json" }).catch(() => null)) || [];
  return json([...errBuf.list, ...saved].slice(0, 60), 200, { "cache-control": "no-store" });
}

// ---------------------------------------------------------------- diagnostics
// GET /api/admin/diagnose — checks every part the site depends on and says, for each problem, where it is and what to do.
async function handleAdminDiagnose(request, env, ctx) {
  const { error } = await adminSession(request, env, ["owner"]);
  if (error) return error;
  const origin = new URL(request.url).origin;
  const timed = (p, ms = 8000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("لم يرد خلال 8 ثوانٍ")), ms))]);
  const ms = async (fn) => { const t = Date.now(); const v = await fn(); return [v, Date.now() - t]; };
  const R = [];
  const add = (group, title, state, detail, where = "", fix = "") => R.push({ group, title, state, detail, where, fix });
  const run = async (group, title, fn, where, fix) => {
    try { const r = await timed(fn()); add(group, title, r.state || "ok", r.detail || "", where, r.state && r.state !== "ok" ? r.fix || fix : ""); }
    catch (e) { add(group, title, "fail", e.message, where, fix); }
  };
  const staging = env.SITE_ENV === "staging";
  const worker = staging ? "wixa-staging" : "wixa";
  const dash = `Cloudflare ← Workers & Pages ← ${worker} ← Settings ← Variables and Secrets`;

  // 1. server settings
  const need = [["SUPABASE_URL", "عنوان قاعدة البيانات"], ["SUPABASE_PUBLISHABLE_KEY", "مفتاح قاعدة البيانات العام"], ["WRITE_TOKEN", "مفتاح حفظ الرسائل"], ["RESEND_API_KEY", "مفتاح إرسال البريد"], ["TURNSTILE_SITE_KEY", "مفتاح الحماية (العام)"], ["TURNSTILE_SECRET", "مفتاح الحماية (السري)"], ["CF_ANALYTICS_TOKEN", "مفتاح إحصاءات Cloudflare"], ["CF_SITE_TAG", "معرّف موقع الإحصاءات"], ["CF_ACCOUNT_ID", "معرّف حساب Cloudflare"]];
  const missing = need.filter(([k]) => !env[k]);
  add("الخادم", "الإعدادات والمفاتيح السرية", missing.length ? "fail" : "ok",
    missing.length ? `ناقص: ${missing.map(([k, n]) => `${n} (${k})`).join("، ")}` : `كل المفاتيح التسعة موجودة · النسخة ${env.CF_VERSION?.id?.slice(0, 8) || "—"}`,
    dash, "أضف المفتاح الناقص بنفس الاسم من إعدادات الـ Worker، ثم أعد النشر.");
  const binds = [["PRIVATE", "التخزين الخاص (KV)"], ["CONTACT_LIMITER", "حدّ رسائل النموذج"], ["TRACK_LIMITER", "حدّ الإحصاءات"], ["ASSETS", "ملفات الموقع"]].filter(([k]) => !env[k]);
  add("الخادم", "الربط بخدمات Cloudflare", binds.length ? "fail" : "ok", binds.length ? `غير مربوط: ${binds.map(([, n]) => n).join("، ")}` : "التخزين الخاص وحدود الطلبات وملفات الموقع مربوطة", "ملف wrangler.toml في المشروع", "تأكد أن الربط موجود في wrangler.toml للنسخة الصحيحة (staging أو الرئيسية) ثم أعد النشر.");

  await Promise.all([
    // 2. database
    run("قاعدة البيانات", "الاتصال بـ Supabase", async () => {
      const [r, t] = await ms(() => sb(env, "site_settings?select=id&id=eq.1"));
      if (!r.ok) return { state: "fail", detail: `ترد بخطأ ${r.status}` };
      return { state: t > 1500 ? "warn" : "ok", detail: `ترد خلال ${t}ms`, fix: "بطء غير معتاد: افتح Supabase ← Reports وتأكد أن المشروع غير متوقف (Paused)." };
    }, "Supabase ← المشروع", "افتح لوحة Supabase: إذا كان المشروع متوقفاً (Paused) اضغط Restore. وإلا تحقق من SUPABASE_URL."),
    run("قاعدة البيانات", "الجداول والمحتوى المنشور", async () => {
      const tables = ["projects", "services", "partners", "testimonials", "posts"];
      const counts = await Promise.all(tables.map((tb) => sb(env, `${tb}?select=id&published=eq.true`, { method: "HEAD", headers: { prefer: "count=exact" } }).then((r) => (r.ok ? parseInt((r.headers.get("content-range") || "/0").split("/")[1], 10) || 0 : `خطأ ${r.status}`))));
      const bad = counts.filter((c) => typeof c === "string");
      const names = { projects: "مشاريع", services: "خدمات", partners: "شركاء", testimonials: "آراء", posts: "مقالات" };
      return { state: bad.length ? "fail" : "ok", detail: tables.map((tb, i) => `${names[tb]}: ${counts[i]}`).join(" · "), fix: "جدول لا يُقرأ: غالباً تحديث قاعدة بيانات لم يُطبَّق (ملفات supabase/migrations)." };
    }, "Supabase ← Table Editor", ""),
    run("قاعدة البيانات", "مفتاح حفظ الرسائل والنسخ الاحتياطي", async () => {
      const r = await sb(env, "rpc/export_backup", { method: "POST", body: JSON.stringify({ token: env.WRITE_TOKEN || "" }) });
      if (r.ok) { const n = (await r.text()).length; return { detail: `صالح · حجم المحتوى الكامل ${(n / 1024).toFixed(0)} KB` }; }
      return { state: "fail", detail: r.status === 404 ? "دالة النسخ الاحتياطي غير موجودة" : `مرفوض (${r.status})`, fix: r.status === 404 ? "طبّق ملف التحديث supabase/migrations/20261107000000_posts_reviews_backup.sql في محرر SQL." : "قيمة WRITE_TOKEN في الـ Worker لا تطابق المحفوظة في قاعدة البيانات (private.write_token)." };
    }, `${dash} ← WRITE_TOKEN`, ""),
    run("قاعدة البيانات", "تسجيل الدخول (Auth)", async () => {
      const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
      return r.ok ? { detail: "خدمة الدخول تعمل" } : { state: "fail", detail: `خطأ ${r.status}` };
    }, "Supabase ← Authentication", "إذا تعذّر الدخول للوحة التحكم فالعطل هنا: راجع حالة Supabase من status.supabase.com."),
    // 3. private store
    run("الخادم", "التخزين الخاص (KV)", async () => {
      if (!env.PRIVATE) return { state: "fail", detail: "غير مربوط" };
      const v = String(Date.now());
      await env.PRIVATE.put("diag:ping", v, { expirationTtl: 60 });
      const back = await env.PRIVATE.get("diag:ping");
      return back === v ? { detail: "كتابة وقراءة سليمة" } : { state: "warn", detail: "الكتابة تمت لكن القراءة متأخرة (طبيعي لثوانٍ)" };
    }, "Cloudflare ← Storage & Databases ← KV", "تأكد أن مساحة KV موجودة ومربوطة باسم PRIVATE."),
    // 4. email
    run("البريد", "إرسال البريد (Resend)", async () => {
      if (!env.RESEND_API_KEY) return { state: "fail", detail: "المفتاح غير موجود", fix: "أنشئ مفتاحاً من Resend ← API Keys وضعه في RESEND_API_KEY ضمن إعدادات الـ Worker." };
      const r = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` } });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 && /restricted/i.test(JSON.stringify(d))) return { detail: "المفتاح صالح (صلاحية إرسال فقط — لا يمكن فحص النطاق منه)" };
      if (!r.ok) return { state: "fail", detail: `المفتاح مرفوض (${r.status})`, fix: "أنشئ مفتاحاً جديداً من Resend ← API Keys وضعه في RESEND_API_KEY." };
      const dom = (d.data || []).find((x) => x.name === "wixa.dev");
      if (!dom) return { state: "fail", detail: "نطاق wixa.dev غير مضاف في Resend", fix: "أضف النطاق في Resend ← Domains وأكمل سجلات DNS." };
      return dom.status === "verified" ? { detail: "النطاق wixa.dev موثّق والإرسال يعمل" } : { state: "fail", detail: `النطاق بحالة: ${dom.status}`, fix: "افتح Resend ← Domains واضغط Verify؛ تأكد أن سجلات DKIM وSPF في Cloudflare DNS." };
    }, "Resend ← Domains / API Keys", ""),
    run("البريد", "عنوان استلام التنبيهات", async () => {
      const to = await notifyAddress(env);
      return to ? { detail: `التنبيهات تصل إلى ${to}` } : { state: "fail", detail: "لا يوجد بريد لاستلام التنبيهات", fix: "اكتبه في لوحة التحكم ← الحساب ← بريد تنبيهات الرسائل." };
    }, "لوحة التحكم ← الحساب", ""),
    // 5. bot protection
    run("الحماية", "التحقق من الزوار (Turnstile)", async () => {
      if (!env.TURNSTILE_SECRET) return { state: "warn", detail: "غير مفعّل — النموذج بلا تحقق", fix: "أضف TURNSTILE_SECRET وTURNSTILE_SITE_KEY من Cloudflare ← Turnstile." };
      const f = new FormData(); f.append("secret", env.TURNSTILE_SECRET); f.append("response", "diagnostic-check");
      const d = await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: f })).json().catch(() => ({}));
      const codes = d["error-codes"] || [];
      if (codes.includes("invalid-input-secret")) return { state: "fail", detail: "المفتاح السري مرفوض", fix: "انسخ Secret Key من Cloudflare ← Turnstile ← الموقع وضعه في TURNSTILE_SECRET." };
      const cfg = await getConfig(env);
      return { state: cfg.spam.turnstile ? "ok" : "warn", detail: cfg.spam.turnstile ? "المفتاح صالح والتحقق مفعّل" : "المفتاح صالح لكن التحقق موقوف من التكاملات", fix: "شغّله من لوحة التحكم ← التكاملات ← الحماية من الرسائل المزعجة." };
    }, "Cloudflare ← Turnstile", ""),
    // 5b. live chat and team
    run("الدردشة", "جداول الدردشة ودوالها", async () => {
      const r = await rpcToken(env, "chat_status", {});
      if (r.status === 404) return { state: "fail", detail: "تحديث الدردشة غير مطبّق على قاعدة البيانات", fix: "طبّق ملف supabase/migrations/20261109000000_live_chat.sql في محرر SQL." };
      if (!r.ok) return { state: "fail", detail: `مرفوض (${r.status})` };
      const d = await r.json();
      const site = JSON.parse(await getSiteData(env, ctx)).settings?.chat;
      return { state: site?.on ? "ok" : "warn", detail: `${site?.on ? "الدردشة ظاهرة في الموقع" : "الدردشة موقوفة — الزوار لا يرون زرها"} · ${d.online ? "أحد الفريق متصل الآن" : "لا أحد من الفريق متصل الآن"}`, fix: "فعّلها من لوحة التحكم ← المحادثات ← «تفعيل الدردشة الآن»." };
    }, "لوحة التحكم ← المحادثات", ""),
    run("الدردشة", "إشعارات الأجهزة", async () => {
      if (!env.PRIVATE) return { state: "fail", detail: "التخزين الخاص غير مربوط" };
      const subs = (await env.PRIVATE.get("push_subs", { type: "json" })) || [];
      return subs.length ? { detail: `${subs.length} جهاز يستقبل إشعارات الدردشة (${[...new Set(subs.map((x) => x.user).filter(Boolean))].join("، ")})` }
        : { state: "warn", detail: "لا يوجد جهاز مفعّل لاستقبال الإشعارات — ستصلك الرسائل على البريد فقط", fix: "لوحة التحكم ← المحادثات ← «🔔 فعّل الإشعارات على هذا الجهاز»." };
    }, "لوحة التحكم ← المحادثات", ""),
    run("الفريق", "أعضاء لوحة التحكم", async () => {
      const r = await rpcToken(env, "team_list", {});
      if (r.status === 404) return { state: "fail", detail: "تحديث الفريق غير مطبّق", fix: "طبّق ملف supabase/migrations/20261108000000_team_roles.sql في محرر SQL." };
      if (!r.ok) return { state: "fail", detail: `مرفوض (${r.status})` };
      const list = await r.json();
      const noMfa = list.filter((m) => !m.mfa).map((m) => m.email);
      return { state: noMfa.length ? "warn" : "ok", detail: `${list.length} عضو · ${noMfa.length ? `بدون تحقق بخطوتين: ${noMfa.join("، ")}` : "الجميع مفعّل التحقق بخطوتين"}`, fix: "اطلب من العضو تفعيل التحقق بخطوتين من صفحة الحساب." };
    }, "لوحة التحكم ← الفريق والصلاحيات", ""),
    // 6. analytics
    run("الإحصاءات", "إحصاءات الزوار (Cloudflare)", async () => {
      if (!env.CF_ANALYTICS_TOKEN || !env.CF_SITE_TAG) return { state: "fail", detail: "المفتاح أو معرّف الموقع غير موجود" };
      const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ query: `query($a:String!){viewer{accounts(filter:{accountTag:$a}){accountTag}}}`, variables: { a: env.CF_ACCOUNT_ID } }) });
      const d = await r.json().catch(() => ({}));
      if (/rate limit/i.test(JSON.stringify(d.errors || ""))) return { state: "warn", detail: "Cloudflare مشغول مؤقتاً (حدّ الطلبات) — يعود خلال دقائق" };
      return d?.data?.viewer?.accounts?.length ? { detail: "المفتاح صالح" } : { state: "fail", detail: "المفتاح مرفوض أو منتهي", fix: "أنشئ API Token بصلاحية Account Analytics: Read وضعه في CF_ANALYTICS_TOKEN." };
    }, "Cloudflare ← My Profile ← API Tokens", ""),
    // 7. site files and pages
    run("الموقع", "ملفات الموقع (التصميم والبرمجة والخط)", async () => {
      const files = ["/build/site.js", "/build/site.css", "/build/shared.js", "/build/admin.js", "/fonts/alexandria.css", "/logo.svg"];
      const res = await Promise.all(files.map((f) => env.ASSETS.fetch(new Request(origin + f)).then((r) => [f, r.status, r.headers.get("content-type") || ""])));
      const bad = res.filter(([f, s, ct]) => s !== 200 || (f.endsWith(".js") && !/javascript/.test(ct)) || (f.endsWith(".css") && !/css/.test(ct)));
      return bad.length ? { state: "fail", detail: `مشكلة في: ${bad.map(([f, s]) => `${f} (${s})`).join("، ")}`, fix: "غالباً فشل البناء الأخير: افتح Cloudflare ← Workers ← Deployments وراجع سجل البناء (Build log)." } : { detail: `الملفات الأساسية الستة سليمة` };
    }, "Cloudflare ← Workers ← Deployments", ""),
    run("الموقع", "المحتوى المحفوظ مؤقتاً", async () => {
      const [, t] = await ms(() => loadFromSupabase(env));
      const age = memo.at ? Math.round((Date.now() - memo.at) / 1000) : null;
      return { state: t > 2000 ? "warn" : "ok", detail: `تحميل المحتوى من قاعدة البيانات ${t}ms${age !== null ? ` · عمر النسخة المعروضة ${age} ثانية` : ""}`, fix: "إذا لم تظهر تعديلاتك: لوحة التحكم ← التكاملات ← «تحديث الآن»." };
    }, "", ""),
    run("الموقع", "الصفحة الرئيسية", async () => {
      const [r, t] = await ms(() => handleHome(new Request(origin + "/"), env, ctx));
      const html = await r.text();
      const ok = r.status === 200 && html.includes('id="wixa-data"');
      return ok ? { state: t > 1500 ? "warn" : "ok", detail: `تُبنى خلال ${t}ms`, fix: "بطء: افحص «الاتصال بـ Supabase» أعلاه." } : { state: "fail", detail: `حالة ${r.status}${r.status === 503 ? " — وضع الصيانة مفعّل؟" : ""}`, fix: "إن كان وضع الصيانة مفعّلاً أوقفه من التكاملات؛ وإلا راجع سجل الأعطال أدناه." };
    }, "src/index.js ← handleHome · سجلات Cloudflare ← Workers ← Logs", "راجع سجل الأعطال أدناه وسجلات الخادم في Cloudflare."),
  ]);

  // 8. scheduled jobs, backups, SEO, maintenance
  const [mon, last, cfg] = await Promise.all([
    env.PRIVATE ? env.PRIVATE.get("monitor", { type: "json" }).catch(() => null) : null,
    env.PRIVATE ? env.PRIVATE.get("backup:last", { type: "json" }).catch(() => null) : null,
    getConfig(env),
  ]);
  if (staging) add("المهام المجدولة", "المراقبة والتقارير", "ok", "النسخة التجريبية لا تشغّل مهاماً مجدولة (هذا مقصود)", "", "");
  else {
    const age = mon?.at ? (Date.now() - Date.parse(mon.at)) / 60000 : Infinity;
    add("المهام المجدولة", "المراقبة كل 15 دقيقة", !cfg.reports.monitor ? "warn" : age < 40 ? (mon.state === "down" ? "fail" : "ok") : "fail",
      !cfg.reports.monitor ? "موقوفة من التكاملات" : age < 40 ? `آخر فحص قبل ${Math.round(age)} دقيقة${mon.state === "down" ? ` — رصدت مشكلة: ${(mon.problems || []).join("، ")}` : " — كل شيء سليم"}` : "لم تعمل منذ أكثر من 40 دقيقة",
      "Cloudflare ← Workers ← wixa ← Settings ← Triggers", "تأكد من وجود الجداول الزمنية (Cron Triggers) الثلاثة؛ تُضاف تلقائياً من wrangler.toml عند النشر.");
  }
  const bAge = last?.at ? (Date.now() - Date.parse(last.at)) / 864e5 : Infinity;
  const maxAge = { daily: 1.2, weekly: 7.5, monthly: 32 }[cfg.backup.freq];
  add("المهام المجدولة", "النسخة الاحتياطية", cfg.backup.freq === "off" ? "warn" : !last ? "warn" : bAge > maxAge ? "fail" : "ok",
    cfg.backup.freq === "off" ? "متوقفة" : last ? `آخر نسخة قبل ${bAge < 1 ? `${Math.round(bAge * 24)} ساعة` : `${Math.round(bAge)} يوم`} (${Math.round((last.size || 0) / 1024)} KB)` : "لم تُرسل أي نسخة بعد",
    "لوحة التحكم ← التكاملات", "اضغط «أرسل نسخة الآن» للتأكد؛ إن فشلت فالعطل في البريد (انظر فحص Resend).");
  if (cfg.maintenance.on) add("الموقع", "وضع الصيانة", "warn", "مفعّل — الزوار يرون صفحة «نعود قريباً»", "لوحة التحكم ← التكاملات", "أوقفه عند الانتهاء.");
  let seo = {};
  try { seo = JSON.parse(memo.text || "{}").settings?.seo || {}; } catch {}
  add("محركات البحث", "الظهور في Google", seo.index === false ? "fail" : seo.google_verification ? "ok" : "warn",
    seo.index === false ? "الفهرسة موقوفة — الموقع لن يظهر في البحث" : seo.google_verification ? "الفهرسة مسموحة وGoogle مربوط" : "الفهرسة مسموحة لكن Google Search Console غير مربوط",
    "لوحة التحكم ← البحث والمشاركة", seo.index === false ? "فعّل «السماح لمحركات البحث»." : "اربط Google Search Console من نفس الصفحة.");

  // 9. recent errors
  const errs = [...errBuf.list, ...(((env.PRIVATE && (await env.PRIVATE.get("errors", { type: "json" }).catch(() => null))) || []))];
  const recent = errs.filter((e) => Date.now() - Date.parse(e.last) < 864e5);
  add("الأعطال", "أخطاء آخر 24 ساعة", recent.length ? (recent.some((e) => e.where === "server") ? "fail" : "warn") : "ok",
    recent.length ? `${recent.reduce((a, e) => a + (e.count || 1), 0)} خطأ (${recent.filter((e) => e.where === "server").length} نوع في الخادم، ${recent.filter((e) => e.where !== "server").length} في المتصفح) — التفاصيل في السجل أدناه` : "لا أخطاء مسجّلة",
    "سجل الأعطال أدناه", "أرسل تفاصيل الخطأ (النص والمكان) للمطور؛ دليل المطور يشرح أين يوجد كل جزء.");

  const order = ["الخادم", "قاعدة البيانات", "البريد", "الحماية", "الإحصاءات", "الموقع", "المهام المجدولة", "محركات البحث", "الأعطال"];
  R.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return json({ checked_at: new Date().toISOString(), env: env.SITE_ENV || "production", results: R }, 200, { "cache-control": "no-store" });
}

// GET /api/admin/devguide — the developer guide (docs/DEVELOPERS.md), for signed-in admins only
async function handleAdminDevGuide(request, env) {
  const { error } = await adminSession(request, env, ["owner", "editor"]);
  if (error) return error;
  return new Response(DEV_GUIDE, { headers: { ...SECURITY_HEADERS, "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });
}

// ---------------------------------------------------------------- team: invitations and roles
// owner: everything · editor: content and look · support: messages and appointments
const ROLE_AR = { owner: "مالك", editor: "محرر محتوى", support: "خدمة العملاء" };
const rpcToken = (env, fn, body) => sb(env, `rpc/${fn}`, { method: "POST", body: JSON.stringify({ token: env.WRITE_TOKEN || "", ...body }) });
async function sessionUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: auth } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
const newCode = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("").replace(/(.{4})(?=.)/g, "$1-");

// GET /api/admin/team — members and pending invitations (owner)
// POST /api/admin/team {action: invite|cancel|role|remove, …} (owner)
async function handleAdminTeam(request, env, ctx) {
  const s = await adminSession(request, env, ["owner"]);
  if (s.error) return s.error;
  const origin = new URL(request.url).origin;
  if (request.method === "GET") {
    const r = await rpcToken(env, "team_list", {});
    if (!r.ok) return json({ error: r.status === 404 ? "migration_missing" : "team_failed" }, r.status === 404 ? 503 : 502);
    const members = await r.json();
    const keys = env.PRIVATE ? (await env.PRIVATE.list({ prefix: "invite:" })).keys : [];
    const invites = (await Promise.all(keys.map(async (k) => ({ code: k.name.slice(7), ...((await env.PRIVATE.get(k.name, { type: "json" })) || {}) })))).filter((x) => x.email);
    const me = await sessionUser(request, env);
    return json({ me: me?.id, members, invites }, 200, { "cache-control": "no-store" });
  }
  let b = {};
  try { b = await request.json(); } catch {}
  if (b.action === "invite") {
    const email = String(b.email || "").trim().toLowerCase().slice(0, 200), role = ROLE_AR[b.role] ? b.role : "";
    if (!EMAIL_RE.test(email) || !role) return json({ error: "invalid" }, 422);
    const code = newCode();
    const me = await sessionUser(request, env);
    await env.PRIVATE.put(`invite:${code}`, JSON.stringify({ email, role, by: me?.email || "", at: new Date().toISOString() }), { expirationTtl: 7 * 864e2 });
    const link = `${origin}/admin/#invite=${code}`;
    const cfg = await getConfig(env);
    let sent = false;
    if (env.RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: `${cfg.alerts.from_name} <noreply@wixa.dev>`, to: [email], subject: "دعوة للانضمام إلى لوحة تحكم ويكسا",
          html: mailBox("لديك دعوة إلى لوحة تحكم ويكسا", `<p>دعاك ${esc(me?.email || "مالك الموقع")} لإدارة موقع ويكسا بصلاحية <b>${ROLE_AR[role]}</b>.</p>
            <p>رمز الدعوة:</p><p style="font-size:24px;font-weight:bold;letter-spacing:2px;direction:ltr;text-align:center;background:#F3EEFB;padding:12px;border-radius:12px">${code}</p>
            <p><a href="${link}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 22px;border-radius:99px;text-decoration:none">قبول الدعوة</a></p>
            <p style="color:#625C70;font-size:13px">افتح الرابط، اختر «لدي دعوة»، واكتب بريدك هذا (${esc(email)}) والرمز وكلمة مرور جديدة. الدعوة صالحة 7 أيام ولمرة واحدة.</p>`),
          text: `دعوة إلى لوحة تحكم ويكسا (${ROLE_AR[role]}). الرمز: ${code} — ${link}` }),
      });
      sent = r.ok;
    }
    return json({ code, link, sent, email, role });
  }
  if (b.action === "cancel") { await env.PRIVATE.delete(`invite:${String(b.code || "").slice(0, 20)}`); return json({ ok: true }); }
  if (b.action === "role" || b.action === "remove") {
    const me = await sessionUser(request, env);
    if (b.user_id === me?.id) return json({ error: "self" }, 422);
    const r = b.action === "role"
      ? await rpcToken(env, "team_grant", { p: { user_id: b.user_id, role: b.role } })
      : await rpcToken(env, "team_remove", { uid: b.user_id });
    if (!r.ok) { const t = await r.text(); return json({ error: /last owner/.test(t) ? "last_owner" : "failed" }, 422); }
    // a removed member, or one who no longer answers chats, stops getting chat notifications on their devices
    if ((b.action === "remove" || b.role === "editor") && env.PRIVATE) {
      const list = await rpcToken(env, "team_list", {}).then((x) => (x.ok ? x.json() : [])).catch(() => []);
      const email = b.email || list.find?.((m) => m.user_id === b.user_id)?.email;
      const subs = (await env.PRIVATE.get("push_subs", { type: "json" })) || [];
      if (email && subs.some((x) => x.user === email)) await env.PRIVATE.put("push_subs", JSON.stringify(subs.filter((x) => x.user !== email)));
    }
    return json({ ok: true });
  }
  return json({ error: "unknown_action" }, 400);
}

// POST /api/invite/claim {code} — a signed-in invitee turns the invitation into dashboard access
async function handleInviteClaim(request, env, ctx) {
  if (!(await allowed(env.CONTACT_LIMITER, clientIp(request)))) return json({ error: "rate_limited" }, 429);
  const u = await sessionUser(request, env);
  if (!u?.id) return json({ error: "unauthorized" }, 401);
  let b = {};
  try { b = await request.json(); } catch {}
  const code = String(b.code || "").trim().toUpperCase().slice(0, 20);
  const inv = code && env.PRIVATE ? await env.PRIVATE.get(`invite:${code}`, { type: "json" }) : null;
  if (!inv) return json({ error: "invalid_code" }, 404);
  if (String(u.email || "").toLowerCase() !== inv.email) return json({ error: "email_mismatch" }, 403);
  const r = await rpcToken(env, "team_grant", { p: { user_id: u.id, role: inv.role, email: inv.email } });
  if (!r.ok) return json({ error: "grant_failed" }, 502);
  await env.PRIVATE.delete(`invite:${code}`);
  ctx.waitUntil(sendOwnerMail(env, `${inv.email} قبل الدعوة`, mailBox("عضو جديد في لوحة التحكم", `<p><b>${esc(inv.email)}</b> قبل الدعوة وصار بإمكانه الدخول بصلاحية <b>${ROLE_AR[inv.role]}</b>.</p><p>يمكنك تغيير صلاحيته أو إزالته من لوحة التحكم ← الفريق والصلاحيات.</p>`)).catch(() => {}));
  return json({ ok: true, role: inv.role });
}

// ---------------------------------------------------------------- router
// ---------- live chat ----------
// Visitors talk to the Worker only: each conversation has a random key kept in the visitor's browser
// (the database stores its sha-256). The team reads and replies in the dashboard through Supabase directly.
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256hex = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const cleanText = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, n);
const PHONE_RE = /^\+?[\d\s()-]{6,30}$/;

async function chatError(r) {
  const t = await r.text().catch(() => "");
  if (/PGRST202|Could not find the function/.test(t)) return json({ error: "migration_missing" }, 503);
  if (/not found/.test(t)) return json({ error: "gone" }, 404);
  console.error("chat rpc", r.status, t.slice(0, 200));
  return json({ error: "server" }, 502);
}

async function handleChat(request, env, ctx, action) {
  const ip = clientIp(request);
  const limiter = action === "start" ? env.CONTACT_LIMITER : env.TRACK_LIMITER;
  if (!(await allowed(limiter, `chat-${action}:${ip}`))) return json({ error: "rate_limited" }, 429);
  let b = {};
  try { b = await request.json(); } catch {}
  const noStore = { "cache-control": "no-store" };

  if (action === "status") {
    const r = await rpcToken(env, "chat_status", {});
    return r.ok ? json(await r.json(), 200, noStore) : chatError(r);
  }
  if (action === "start") {
    const name = cleanText(b.name, 80), phone = cleanText(b.phone, 30), body = cleanText(b.body, 2000);
    if (!name || !body || !PHONE_RE.test(phone)) return json({ error: "invalid" }, 422);
    const key = hex(crypto.getRandomValues(new Uint8Array(32)));
    const topic = cleanText(b.topic, 120);
    const r = await rpcToken(env, "chat_start", { p: { secret: await sha256hex(key), name, phone, body, topic, marketing: b.marketing === true, source: cleanText(b.source, 60), page: cleanText(b.page, 200) } });
    if (!r.ok) return chatError(r);
    const d = await r.json();
    ctx.waitUntil(notifyChat(env, request, { name, phone, body, topic, isNew: true, push: true, email: true }).catch((e) => console.error("chat notify", e)));
    return json({ id: d.id, key, online: d.online }, 200, noStore);
  }
  const id = cleanText(b.id, 40), key = cleanText(b.key, 64);
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(key)) return json({ error: "invalid" }, 422);
  const secret = await sha256hex(key);
  if (action === "send") {
    const body = cleanText(b.body, 2000);
    if (!body) return json({ error: "invalid" }, 422);
    const r = await rpcToken(env, "chat_send", { p: { id, secret, body } });
    if (!r.ok) return chatError(r);
    const d = await r.json();
    if (d.push || d.email) ctx.waitUntil(notifyChat(env, request, { name: d.name, phone: d.phone, topic: d.topic, body, push: d.push, email: d.email }).catch((e) => console.error("chat notify", e)));
    return json({ id: d.id, online: d.online }, 200, noStore);
  }
  // poll
  const r = await rpcToken(env, "chat_poll", { p: { id, secret, after: Math.max(0, parseInt(b.after, 10) || 0), seen: !!b.seen, typing: !!b.typing } });
  return r.ok ? json(await r.json(), 200, noStore) : chatError(r);
}

async function notifyChat(env, request, m) {
  const origin = new URL(request.url).origin;
  const jobs = [];
  if (m.push) jobs.push(pushTeam(env));
  if (m.email) jobs.push(sendOwnerMail(env, m.isNew ? `محادثة جديدة في الموقع — ${m.name}` : `رسالة جديدة في الدردشة — ${m.name}`,
    mailBox(m.isNew ? "محادثة جديدة في الموقع" : "رسالة جديدة في الدردشة", `<p><b>${esc(m.name)}</b> · <span dir="ltr">${esc(m.phone)}</span>${m.topic ? `<br>الموضوع: <b>${esc(m.topic)}</b>` : ""}</p>
      <p style="background:#F3EEFB;padding:12px 14px;border-radius:12px;white-space:pre-wrap">${esc(m.body)}</p>
      <p>الزبون ينتظر ردك في نافذة الدردشة على الموقع.</p>
      <p><a href="${origin}/admin/#chats" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 22px;border-radius:99px;text-decoration:none">الرد من لوحة التحكم</a></p>`)));
  await Promise.allSettled(jobs);
}

// Web Push to the team's devices. The notification carries no content (the service worker shows a fixed text),
// so no payload encryption is needed — only a VAPID signature. The key pair is created once and kept in KV.
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
async function vapidKeys(env) {
  let v = await env.PRIVATE.get("vapid", { type: "json" });
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    v = { pub: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), jwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
    await env.PRIVATE.put("vapid", JSON.stringify(v));
  }
  return v;
}
async function webPush(env, endpoint) {
  const v = await vapidKeys(env);
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:info@wixa.dev" })}`;
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  const r = await fetch(endpoint, { method: "POST", headers: { authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${v.pub}`, ttl: "3600", urgency: "high", "content-length": "0" } });
  return r.status;
}
async function pushTeam(env) {
  if (!env.PRIVATE) return;
  const subs = (await env.PRIVATE.get("push_subs", { type: "json" })) || [];
  if (!subs.length) return;
  const res = await Promise.all(subs.map((x) => webPush(env, x.endpoint).catch(() => 0)));
  const keep = subs.filter((x, i) => res[i] !== 404 && res[i] !== 410); // the device unsubscribed
  if (keep.length !== subs.length) await env.PRIVATE.put("push_subs", JSON.stringify(keep));
}
async function handleAdminPush(request, env) {
  const s = await adminSession(request, env, ["owner", "support"]);
  if (s.error) return s.error;
  if (!env.PRIVATE) return json({ error: "kv_missing" }, 503);
  if (request.method === "GET") return json({ key: (await vapidKeys(env)).pub }, 200, { "cache-control": "no-store" });
  let b = {};
  try { b = await request.json(); } catch {}
  const endpoint = String(b.endpoint || "");
  let host = "";
  try { host = new URL(endpoint).hostname; } catch {}
  if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !PUSH_HOSTS.test(host)) return json({ error: "invalid" }, 422);
  let subs = ((await env.PRIVATE.get("push_subs", { type: "json" })) || []).filter((x) => x.endpoint !== endpoint);
  if (request.method === "POST") {
    const me = await sessionUser(request, env);
    subs = [...subs, { endpoint, user: me?.email || "", at: new Date().toISOString() }].slice(-30);
  }
  await env.PRIVATE.put("push_subs", JSON.stringify(subs));
  const status = request.method === "POST" && b.test ? await webPush(env, endpoint).catch(() => 0) : null;
  return json({ ok: true, devices: subs.length, test: status });
}

// ---------- sales: chat ratings, email campaigns, unsubscribe links, daily reminders ----------
const STAGE_AR = { new: "جديد", contacted: "تواصلنا", quoted: "أُرسل العرض", won: "تم البيع", lost: "خسرناه" };
async function handleChatRate(request, env) {
  if (!(await allowed(env.TRACK_LIMITER, `chat-rate:${clientIp(request)}`))) return json({ error: "rate_limited" }, 429);
  let b = {};
  try { b = await request.json(); } catch {}
  const id = cleanText(b.id, 40), key = cleanText(b.key, 64), rating = parseInt(b.rating, 10);
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(key) || !(rating >= 1 && rating <= 5)) return json({ error: "invalid" }, 422);
  const r = await rpcToken(env, "chat_rate", { p: { id, secret: await sha256hex(key), rating, note: cleanText(b.note, 500) } });
  return r.ok ? json({ ok: true }) : chatError(r);
}

// unsubscribe links carry a signature, so nobody can unsubscribe someone else
async function unsubSig(env, email) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(`unsub:${env.WRITE_TOKEN || ""}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(email.toLowerCase()))).slice(0, 32);
}
async function handleUnsubscribe(request, env, url) {
  const email = String(url.searchParams.get("e") || "").trim().toLowerCase().slice(0, 200), sig = url.searchParams.get("s") || "";
  const ok = EMAIL_RE.test(email) && sig === (await unsubSig(env, email));
  let done = false;
  if (ok) { const r = await rpcToken(env, "campaign_optout", { email }); done = r.ok; }
  const msg = done ? ["تم إلغاء اشتراكك", "لن تصلك رسائل العروض من ويكسا بعد الآن. إذا كان هذا خطأً راسلنا وسنعيد اشتراكك."]
    : ok ? ["تعذّر الإلغاء الآن", "حدث خطأ مؤقت، حاول بعد دقائق أو راسلنا وسنلغيه لك."] : ["الرابط غير صالح", "تأكد أنك فتحت الرابط كاملاً من البريد."];
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${msg[0]} — WIXA</title>
    <style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,Tahoma,sans-serif;background:#F6F3FB;color:#1A1424}main{max-width:440px;margin:16px;background:#fff;border-radius:20px;padding:32px;text-align:center;box-shadow:0 20px 60px -30px rgba(91,33,182,.4)}h1{font-size:22px;margin:0 0 10px;color:#5B21B6}p{line-height:1.9;color:#5E5670;margin:0 0 18px}a{color:#5B21B6;font-weight:700}</style></head>
    <body><main><h1>${msg[0]}</h1><p>${msg[1]}</p><a href="/">العودة إلى الموقع</a></main></body></html>`, { status: ok ? 200 : 400, headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// GET: audience size + sent campaigns · POST {subject, body, test}: send (test → only to the alerts address)
async function handleAdminCampaign(request, env) {
  const s = await adminSession(request, env, ["owner"]);
  if (s.error) return s.error;
  const aud = await rpcToken(env, "campaign_audience", {});
  if (aud.status === 404) return json({ error: "migration_missing" }, 503);
  const audience = aud.ok ? await aud.json() : [];
  const log = env.PRIVATE ? (await env.PRIVATE.get("campaigns", { type: "json" })) || [] : [];
  if (request.method === "GET") return json({ audience: audience.length, log }, 200, { "cache-control": "no-store" });
  if (!env.RESEND_API_KEY) return json({ error: "no_email_key" }, 503);
  let b = {};
  try { b = await request.json(); } catch {}
  const subject = cleanText(b.subject, 150), body = String(b.body || "").replace(/\r/g, "").trim().slice(0, 8000);
  if (!subject || !body) return json({ error: "invalid" }, 422);
  const cfg = await getConfig(env), origin = new URL(request.url).origin;
  const list = b.test ? [{ email: await notifyAddress(env), name: "تجربة" }].filter((x) => x.email) : audience;
  if (!list.length) return json({ error: "no_audience" }, 422);
  const mails = await Promise.all(list.map(async (r) => {
    const link = `${origin}/unsubscribe?e=${encodeURIComponent(r.email)}&s=${await unsubSig(env, r.email)}`;
    const text = body.replace(/\{name\}/g, r.name || "");
    return { from: `${cfg.alerts.from_name} <offers@wixa.dev>`, to: [r.email], subject: b.test ? `[تجربة] ${subject}` : subject,
      headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      html: mailBox(esc(subject), `<div style="white-space:pre-wrap">${esc(text)}</div>
        <p style="margin-top:24px;font-size:12px;color:#8A8296">وصلتك هذه الرسالة لأنك وافقت على استلام عروض ويكسا. <a href="${link}" style="color:#8A8296">إلغاء الاشتراك</a></p>`) };
  }));
  let sent = 0, failed = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(mails.slice(i, i + 100)) });
    if (r.ok) sent += Math.min(100, mails.length - i); else { failed += Math.min(100, mails.length - i); console.error("campaign", r.status, await r.text()); }
  }
  if (!b.test && env.PRIVATE) await env.PRIVATE.put("campaigns", JSON.stringify([{ at: new Date().toISOString(), subject, sent, failed }, ...log].slice(0, 30)));
  return json({ ok: failed === 0, sent, failed, test: !!b.test });
}

// Every morning (production): follow-ups due today and chats waiting for a reply → one email to the owner
async function runReminders(env) {
  const cfg = await getConfig(env);
  if (cfg.reports.reminders === false) return;
  const r = await rpcToken(env, "sales_due", {});
  if (!r.ok) return;
  const d = await r.json();
  if (!d.follow.length && !d.waiting.length) return;
  const site = env.SITE_ENV === "staging" ? "https://staging.wixa.dev" : "https://wixa.dev";
  const li = (x) => `<li style="margin-bottom:8px">${x}</li>`;
  const html = mailBox("متابعات اليوم", `
    ${d.follow.length ? `<p><b>زبائن موعد متابعتهم اليوم (${d.follow.length}):</b></p><ul>${d.follow.map((f) => li(`<b>${esc(d.names[f.key] || f.key.slice(2))}</b> — ${STAGE_AR[f.stage] || ""}${f.note ? `<br><span style="color:#6B6478">${esc(f.note)}</span>` : ""}`)).join("")}</ul>` : ""}
    ${d.waiting.length ? `<p><b>محادثات تنتظر ردك منذ أكثر من يوم (${d.waiting.length}):</b></p><ul>${d.waiting.map((w) => li(`<b>${esc(w.name)}</b> <span dir="ltr">${esc(w.phone)}</span><br><span style="color:#6B6478">${esc(w.text)}</span>`)).join("")}</ul>` : ""}
    <p><a href="${site}/admin/#customers" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 22px;border-radius:99px;text-decoration:none">فتح لوحة التحكم</a></p>`);
  await sendOwnerMail(env, `متابعات اليوم: ${d.follow.length + d.waiting.length} — ويكسا`, html);
}

export default {
  // "*/15 * * * *" → health check; "17 6 * * SUN" → weekly report (Sunday 09:17 Baghdad)
  async scheduled(event, env, ctx) {
    if (event.cron === "17 6 * * SUN") ctx.waitUntil(runWeeklyReport(env).catch((e) => console.error("weekly", e)));
    else if (event.cron === "23 3 * * *") {
      ctx.waitUntil(runBackup(env).catch((e) => console.error("backup", e)));
      ctx.waitUntil(runReminders(env).catch((e) => console.error("reminders", e))); // 06:23 Baghdad
    }
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
        case "GET /blog":
        case "HEAD /blog":
          return await handleBlog(request, env, ctx, "");
        case "GET /review":
        case "POST /review":
          return await handleReview(request, env, ctx, url);
        case "GET /api/slots": return await handleSlots(request, env, ctx, url);
        case "POST /api/event": return await handleEvent(request, env, ctx);
        case "GET /api/admin/funnel": return await handleAdminFunnel(request, env, url);
        case "GET /api/admin/team":
        case "POST /api/admin/team":
          return await handleAdminTeam(request, env, ctx);
        case "POST /api/invite/claim": return await handleInviteClaim(request, env, ctx);
        case "POST /api/chat/status": return await handleChat(request, env, ctx, "status");
        case "POST /api/chat/start": return await handleChat(request, env, ctx, "start");
        case "POST /api/chat/send": return await handleChat(request, env, ctx, "send");
        case "POST /api/chat/poll": return await handleChat(request, env, ctx, "poll");
        case "POST /api/chat/rate": return await handleChatRate(request, env);
        case "GET /unsubscribe":
        case "POST /unsubscribe":
          return await handleUnsubscribe(request, env, url);
        case "GET /api/admin/campaign":
        case "POST /api/admin/campaign":
          return await handleAdminCampaign(request, env);
        case "GET /api/admin/push":
        case "POST /api/admin/push":
        case "DELETE /api/admin/push":
          return await handleAdminPush(request, env);
        case "DELETE /api/admin/booking": return await handleAdminBooking(request, env);
        case "POST /api/admin/review-link": return await handleAdminReviewLink(request, env);
        case "GET /about":
        case "GET /pricing":
        case "GET /careers":
        case "GET /contact":
          return await handleHome(request, env, ctx, url.pathname.slice(1));
        case "GET /privacy":
        case "HEAD /privacy":
          return await handlePrivacy(request, env, ctx);
        case "GET /api/admin/msgmeta":
        case "PUT /api/admin/msgmeta":
          return await handleAdminMsgMeta(request, env);
        case "POST /api/client-error": return await handleClientError(request, env, ctx);
        case "GET /api/admin/diagnose": return await handleAdminDiagnose(request, env, ctx);
        case "GET /api/admin/errors":
        case "DELETE /api/admin/errors":
          return await handleAdminErrors(request, env);
        case "GET /api/admin/devguide": return await handleAdminDevGuide(request, env);
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
          let projects = [], services = [];
          try { const d = JSON.parse(await getSiteData(env, ctx)); projects = d.projects || []; services = d.services || []; } catch {}
          const posts = await getPosts(env);
          const urls = ["/", "/about", "/pricing", "/careers", "/contact", "/privacy", "/blog", ...services.map((x) => `/services/${encodeURIComponent(x.slug)}`), ...projects.map((x) => `/projects/${encodeURIComponent(x.slug)}`), ...posts.map((x) => `/blog/${encodeURIComponent(x.slug)}`)].map((p) => `<url><loc>https://wixa.dev${p}</loc><lastmod>${today}</lastmod></url>`).join("");
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
      const svc = url.pathname.match(/^\/services\/([^/]+)\/?$/);
      if (svc && (request.method === "GET" || request.method === "HEAD")) return await handleServicePage(request, env, ctx, decodeURIComponent(svc[1]));
      const post = url.pathname.match(/^\/blog\/([^/]+)\/?$/);
      if (post && (request.method === "GET" || request.method === "HEAD")) return await handleBlog(request, env, ctx, decodeURIComponent(post[1]));
      const proj = url.pathname.match(/^\/projects\/([^/]+)\/?$/);
      if (proj && (request.method === "GET" || request.method === "HEAD")) return await handleProjectPage(request, env, ctx, decodeURIComponent(proj[1]));
      if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    } catch (err) {
      console.error(err);
      recordError(env, ctx, { where: "server", msg: `${err?.name || "Error"}: ${err?.message || err}`, src: String(err?.stack || "").split("\n")[1]?.trim() || "", path: `${request.method} ${url.pathname}` });
      return json({ error: "server" }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
