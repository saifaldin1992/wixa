// Site content and settings: read from Supabase, cached at the edge and in KV, republished after a dashboard change.

import { CSP, SECURITY_HEADERS, SITE_TTL, deepMerge, esc, pickLang, sb } from "../lib/core.js";

// ---------------------------------------------------------------- site content (cached)
export let memo = { at: 0, checked: 0, text: null }; // per-isolate copy

export async function loadFromSupabase(env) {
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
export let refreshing = null;
export async function getSiteData(env, ctx) {
  const now = Date.now();
  if (memo.text && now - memo.checked < 5000 && now - memo.at < SITE_TTL * 1000) return memo.text;

  const cache = caches.default;
  const key = new Request(`https://wixa-cache.internal/site-data/${env.SITE_ENV || "production"}`);
  const refresh = () => (refreshing ??= loadFromSupabase(env)
    .then((text) => {
      memo = { at: Date.now(), checked: Date.now(), text };
      ctx.waitUntil(saveGlobalCopy(env, text));
      return cache.put(key, new Response(text, { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400", "x-saved-at": String(Date.now()) } })).then(() => text);
    })
    .finally(() => { refreshing = null; }));

  const hit = await cache.match(key);
  if (hit) {
    const at = Number(hit.headers.get("x-saved-at")) || 0;
    if (!memo.text || at > memo.at) memo = { at, checked: now, text: await hit.text() };
  }
  memo.checked = now;
  if (!memo.text && env.PRIVATE) {
    // a quiet edge location with nothing cached: serve the global copy (KV, a few ms) instead of waiting on the database
    const kv = await env.PRIVATE.get("site-data").catch(() => null);
    if (kv) memo = { at: 0, checked: now, text: kv };
  }
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

// The last good content, kept in KV so any edge location can open the site at once; written only when it changed.
export async function saveGlobalCopy(env, text) {
  if (!env.PRIVATE) return;
  try { if ((await env.PRIVATE.get("site-data")) !== text) await env.PRIVATE.put("site-data", text); } catch (err) { console.error("site data copy", err); }
}

// Reload the content from the database now and replace the shared copy at this location (dashboard "publish now").
export async function publishNow(env) {
  await caches.default.delete(new Request(`https://wixa-cache.internal/posts/${env.SITE_ENV || "production"}`)).catch(() => {});
  const text = await loadFromSupabase(env);
  memo = { at: Date.now(), checked: Date.now(), text };
  await saveGlobalCopy(env, text);
  await caches.default.put(new Request(`https://wixa-cache.internal/site-data/${env.SITE_ENV || "production"}`),
    new Response(text, { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400", "x-saved-at": String(Date.now()) } }));
}

// ---------------------------------------------------------------- integrations (private settings)
// Set from the dashboard (Integrations page) and kept in the private Cloudflare store, never sent to visitors as a whole.
export const CONFIG_DEFAULTS = {
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
export const TAG_RULES = { ga4: /^G-[A-Z0-9]{4,15}$/, meta_pixel: /^\d{8,20}$/, clarity: /^[a-z0-9]{6,20}$/, tiktok: /^[A-Z0-9]{10,30}$/ };
export let cfgMemo = { at: 0, v: null };
export async function getConfig(env) {
  if (cfgMemo.v && Date.now() - cfgMemo.at < 60_000) return cfgMemo.v;
  const raw = env.PRIVATE ? await env.PRIVATE.get("config", { type: "json", cacheTtl: 60 }).catch(() => null) : null;
  cfgMemo = { at: Date.now(), v: deepMerge(CONFIG_DEFAULTS, raw || {}) };
  return cfgMemo.v;
}
// Keep only known fields, with safe lengths and formats.
export function cleanConfig(prev, body) {
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
export async function saveConfig(env, cfg) {
  await env.PRIVATE.put("config", JSON.stringify(cfg));
  cfgMemo = { at: Date.now(), v: cfg };
}

// Analytics and ad pixels switched on in the dashboard: the extra hosts the page may load from.
export const TAG_HOSTS = {
  ga4: { script: "https://www.googletagmanager.com", connect: "https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com", img: "https://*.google-analytics.com https://www.googletagmanager.com" },
  meta_pixel: { script: "https://connect.facebook.net", connect: "https://www.facebook.com https://connect.facebook.net", img: "https://www.facebook.com" },
  clarity: { script: "https://www.clarity.ms https://*.clarity.ms", connect: "https://*.clarity.ms https://c.bing.com", img: "https://*.clarity.ms https://c.bing.com" },
  tiktok: { script: "https://analytics.tiktok.com", connect: "https://analytics.tiktok.com https://*.tiktok.com", img: "https://analytics.tiktok.com" },
};
export function cspWithTags(tags) {
  const on = Object.keys(TAG_HOSTS).filter((k) => tags[k]);
  if (!on.length) return CSP;
  const add = (kind) => on.map((k) => TAG_HOSTS[k][kind]).join(" ");
  return CSP.replace("script-src 'self'", `script-src 'self' ${add("script")}`)
    .replace("connect-src 'self'", `connect-src 'self' ${add("connect")}`)
    .replace("img-src 'self'", `img-src 'self' ${add("img")}`);
}

export const hasBypass = (request, cfg) => !!cfg.maintenance.bypass && (request.headers.get("cookie") || "").includes(`wixa-bypass=${cfg.maintenance.bypass}`);

// "Back soon" page while maintenance mode is on (the owner, with the dashboard cookie, still sees the site).
export function maintenancePage(request, cfg, st) {
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

// ---------------------------------------------------------------- simple pages (project pages, privacy policy)
// Readable URLs for each project: from the English title (or the Arabic one), unique within the list.
export function withSlugs(projects) {
  const seen = new Set();
  return projects.map((p) => {
    let base = String(p.title_en || p.title_ar || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || String(p.id);
    let slug = base, n = 2;
    while (seen.has(slug)) slug = `${base}-${n++}`;
    seen.add(slug);
    return { ...p, slug };
  });
}

// ---------------------------------------------------------------- articles (blog)
// Published articles, read at most once a minute per location.
export async function getPosts(env) {
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
