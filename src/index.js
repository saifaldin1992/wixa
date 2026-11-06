// WIXA — Cloudflare Worker: serves the site (public/) and the API.
//
// Built to stay fast under heavy traffic:
//  • Site content is read from Supabase at most once a minute per edge location
//    (isolate memory + Cloudflare edge cache), never once per visitor.
//  • The homepage HTML gets that content injected, so a visit needs no extra API round trip.
//  • Writes (contact form, page views) are rate limited per IP and go through
//    token-checked database functions, so nobody can write to the database directly.

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
let memo = { at: 0, text: null }; // per-isolate copy

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
    projects, services, partners, testimonials,
  });
}

async function getSiteData(env, ctx) {
  const now = Date.now();
  if (memo.text && now - memo.at < SITE_TTL * 1000) return memo.text;

  const cache = caches.default;
  const key = new Request(`https://wixa-cache.internal/site-data/${env.SITE_ENV || "production"}`);
  const hit = await cache.match(key);
  if (hit) {
    memo = { at: now, text: await hit.text() };
    return memo.text;
  }
  try {
    const text = await loadFromSupabase(env);
    memo = { at: now, text };
    ctx.waitUntil(cache.put(key, new Response(text, { headers: { "content-type": "application/json", "cache-control": `public, max-age=${SITE_TTL}` } })));
    return text;
  } catch (err) {
    console.error("site data", err);
    if (memo.text) return memo.text; // serve the last good copy if Supabase is unavailable
    return JSON.stringify({ env: env.SITE_ENV || "production", turnstile: env.TURNSTILE_SITE_KEY || "", settings: {}, projects: [], services: [], partners: [], testimonials: [] });
  }
}

// Cloudflare Web Analytics: privacy-friendly, cookie-less visit counting that never touches our database.
const beacon = (env) => env.CF_BEACON_TOKEN
  ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${env.CF_BEACON_TOKEN}"}'></script>`
  : "";

// GET / — static HTML with the content embedded (no flash of default text, one request per visit).
async function handleHome(request, env, ctx) {
  const [page, data] = await Promise.all([env.ASSETS.fetch(new Request(new URL("/", request.url), request)), getSiteData(env, ctx)]);
  const safe = data.replace(/</g, "\\u003c");
  // Put the hero text in the HTML itself (same markup the script builds), so the first paint
  // already has it and nothing moves when the script runs.
  let hero = {}, mapOn = true;
  try { const st = JSON.parse(data)?.settings; hero = st?.content?.ar || {}; mapOn = st?.sections?.iraq_map !== false; } catch {}
  const words = (t) => String(t).split(/\s+/).filter(Boolean).map((w, i) => `<span class="word"><span style="transition-delay:${i * 70}ms">${esc(w)}</span></span>`).join(" ");
  const fill = (key, html) => ({ element: (el) => { if (hero[key]) el.setInnerContent(html ? words(hero[key]) : hero[key], { html }); } });
  const res = new HTMLRewriter()
    .on("head", { element: (el) => el.append(`<script id="wixa-data" type="application/json">${safe}</script>`, { html: true }) })
    .on("#heroTitle", fill("hero_title", true))
    .on("svg.iraq", { element: (el) => { if (!mapOn) el.remove(); } })
    .on('[data-c="hero_badge"]', fill("hero_badge", false))
    .on('.hero__sub[data-c="hero_sub"]', fill("hero_sub", false))
    .on("body", { element: (el) => { if (!new URL(request.url).searchParams.has("preview")) el.append(beacon(env), { html: true }); } })
    .transform(page);
  const headers = new Headers(res.headers);
  headers.set("cache-control", "no-cache");
  headers.delete("etag");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
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
async function handleAdminStats(request, env, url) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const asUser = (path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: auth, "content-type": "application/json", ...(init.headers || {}) } });
  const adm = await asUser("rpc/is_admin", { method: "POST", body: "{}" });
  if (!adm.ok || (await adm.json()) !== true) return json({ error: "forbidden" }, 403);
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_SITE_TAG) return json({ error: "analytics_not_configured" }, 503);

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
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query: q, variables: { acc: env.CF_ACCOUNT_ID, tag: env.CF_SITE_TAG, hosts: env.SITE_ENV === "staging" ? ["staging.wixa.dev"] : ["wixa.dev", "www.wixa.dev"], since: day(since), since90: day(since90), today: day(today) } }),
  });
  const g = await r.json().catch(() => ({}));
  const a = g?.data?.viewer?.accounts?.[0];
  if (!a) { console.error("analytics", JSON.stringify(g?.errors || g).slice(0, 500)); return json({ error: "analytics_failed" }, 502); }

  const byDate = new Map((a.byDay || []).map((x) => [x.dimensions.date, x]));
  const by_day = [];
  for (let t = since.getTime(); t <= today.getTime(); t += 864e5) {
    const d = day(new Date(t)), x = byDate.get(d);
    by_day.push({ day: d, views: x?.count || 0, visitors: x?.sum?.visits || 0 });
  }
  const rows = (list, f, v) => (list || []).map((x) => ({ label: f(x), value: v(x) })).filter((x) => x.label);

  // unread messages, read with the admin's own session
  const msg = await asUser("contact_messages?select=id&handled=eq.false", { method: "HEAD", headers: { prefer: "count=exact" } });
  const messages_new = parseInt((msg.headers.get("content-range") || "/0").split("/")[1], 10) || 0;

  return json({
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
  }, 200, { "cache-control": "private, max-age=60" });
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

// ---------------------------------------------------------------- POST /api/contact
// Email the site owner about a new message (needs RESEND_API_KEY and NOTIFY_EMAIL secrets on the Worker).
async function notifyOwner(env, row) {
  if (!env.RESEND_API_KEY) return;
  const to = env.NOTIFY_EMAIL || ""; // private Worker secret, never stored in the public site settings
  if (!to) return;
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
    body: JSON.stringify({ from: "WIXA <notify@wixa.dev>", to: [to], reply_to: row.email, subject: `${staging ? "[تجريبي] " : ""}رسالة جديدة من ${row.name}`, html }),
  });
  if (!res.ok) console.error("notify failed", res.status, await res.text());
}

async function handleContact(request, env, ctx) {
  const ip = clientIp(request);
  if (!(await allowed(env.CONTACT_LIMITER, ip))) return json({ error: "rate_limited" }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (body.website) return json({ ok: true }); // honeypot
  if (!(await turnstileOk(env, body.turnstile, ip))) return json({ error: "captcha" }, 403);

  const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const row = {
    name: clean(body.name, 120),
    email: clean(body.email, 200),
    phone: clean(body.phone, 40) || null,
    message: clean(body.message, 4000),
    services: Array.isArray(body.services) ? body.services.filter((s) => typeof s === "string").slice(0, 10).map((s) => s.slice(0, 80)) : [],
    lang: body.lang === "en" ? "en" : "ar",
  };
  if (!row.name || !row.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return json({ error: "validation" }, 422);

  const res = await rpc(env, "submit_contact", row);
  if (!res.ok) {
    console.error("contact insert failed", res.status, await res.text());
    return json({ error: "storage" }, 502);
  }
  ctx.waitUntil(notifyOwner(env, row).catch((e) => console.error("notify", e)));
  return json({ ok: true }, 201);
}

// ---------------------------------------------------------------- router
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    try {
      switch (route) {
        case "GET /":
        case "GET /index.html":
          return await handleHome(request, env, ctx);
        case "GET /api/site":
          return new Response(await getSiteData(env, ctx), {
            headers: { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${SITE_TTL}` },
          });
        case "POST /api/track": return new Response(null, { status: 204 }); // replaced by Cloudflare Web Analytics
        case "GET /api/admin/stats": return await handleAdminStats(request, env, url);
        case "POST /api/contact": return await handleContact(request, env, ctx);
        case "GET /api/config":
          // Public values the admin dashboard needs to talk to Supabase.
          return json({ env: env.SITE_ENV || "production", supabaseUrl: env.SUPABASE_URL, supabaseKey: env.SUPABASE_PUBLISHABLE_KEY });
        case "GET /sitemap.xml": {
          const today = new Date().toISOString().slice(0, 10);
          const urls = ["/"].map((p) => `<url><loc>https://wixa.dev${p}</loc><lastmod>${today}</lastmod></url>`).join("");
          return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`, {
            headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
          });
        }
        case "GET /robots.txt":
          // Keep the staging copy out of search engines.
          return new Response(env.SITE_ENV === "staging" ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nDisallow: /admin/\nSitemap: https://wixa.dev/sitemap.xml\n", {
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
          });
        case "GET /health": {
          let supabase = "unreachable";
          try {
            const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
            supabase = r.ok ? "ok" : `error ${r.status}`;
          } catch (err) { supabase = `error: ${err.message}`; }
          return json({ worker: "ok", env: env.SITE_ENV || "production", supabase }, 200, { "cache-control": "no-store" });
        }
      }
      if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "server" }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
