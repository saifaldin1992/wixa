// WIXA — Cloudflare Worker: serves the site (public/) and the API.
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });

function sb(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json", ...(init.headers || {}) },
  });
}

// GET /api/site — everything the public page needs, in one request.
async function handleSite(env) {
  const q = (t) => sb(env, `${t}?select=*&published=eq.true&order=sort.asc,created_at.asc`).then((r) => (r.ok ? r.json() : []));
  const [settings, projects, services, partners, testimonials] = await Promise.all([
    sb(env, "site_settings?select=data&id=eq.1").then((r) => (r.ok ? r.json() : [])),
    q("projects"), q("services"), q("partners"), q("testimonials"),
  ]);
  return json(
    { env: env.SITE_ENV || "production", settings: settings[0]?.data || {}, projects, services, partners, testimonials },
    200,
    { "cache-control": "public, max-age=10" },
  );
}

// POST /api/track — anonymous page view. The visitor id is a daily-rotating hash, never the raw IP.
async function handleTrack(request, env) {
  let body = {};
  try { body = await request.json(); } catch {}
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const ua = request.headers.get("user-agent") || "";
  if (/bot|crawl|spider|slurp|preview|headless/i.test(ua)) return new Response(null, { status: 204 });

  const day = new Date().toISOString().slice(0, 10);
  const salt = env.VISITOR_SALT || "wixa";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${day}|${ip}|${ua}`));
  const visitor_hash = [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");

  let referrer = null;
  try {
    const r = new URL(body.referrer);
    if (r.host && r.host !== new URL(request.url).host) referrer = r.host.slice(0, 300);
  } catch {}

  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "mobile" : "desktop";
  const country = (request.cf && request.cf.country && /^[A-Z]{2}$/.test(request.cf.country)) ? request.cf.country : null;
  const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 300) : "/";

  const res = await sb(env, "page_views", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ path, visitor_hash, referrer, country, device, lang: body.lang === "en" ? "en" : "ar" }),
  });
  if (!res.ok) console.error("track failed", res.status, await res.text());
  return new Response(null, { status: 204 });
}

// POST /api/contact — contact form.
// Email the site owner about a new message (needs RESEND_API_KEY and NOTIFY_EMAIL secrets on the Worker).
async function notifyOwner(env, row) {
  if (!env.RESEND_API_KEY) return;
  // Recipient is a private Worker secret (NOTIFY_EMAIL), never stored in the public site settings.
  const to = env.NOTIFY_EMAIL || "";
  if (!to) return;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const staging = env.SITE_ENV === "staging";
  const admin = staging ? "https://staging.wixa.dev/admin/#messages" : "https://wixa.dev/admin/#messages";
  const wa = row.phone ? `https://wa.me/${row.phone.replace(/\D/g, "")}` : "";
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F6F3F2;padding:24px">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ECE6E8">
      <div style="background:#570622;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">رسالة جديدة من موقع ويكسا${staging ? " (النسخة التجريبية)" : ""}</div>
      <div style="padding:22px;color:#1A0E12;font-size:15px;line-height:1.8">
        <p style="margin:0 0 6px"><b>الاسم:</b> ${esc(row.name)}</p>
        <p style="margin:0 0 6px"><b>البريد:</b> <a href="mailto:${esc(row.email)}">${esc(row.email)}</a></p>
        ${row.phone ? `<p style="margin:0 0 6px"><b>الهاتف:</b> ${esc(row.phone)}</p>` : ""}
        ${row.services?.length ? `<p style="margin:0 0 6px"><b>الخدمة:</b> ${esc(row.services.join("، "))}</p>` : ""}
        <div style="margin:14px 0;padding:14px;background:#F8EEF1;border-radius:12px;white-space:pre-wrap">${esc(row.message)}</div>
        <a href="mailto:${esc(row.email)}" style="display:inline-block;background:#570622;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;margin-left:6px">رد بالبريد</a>
        ${wa ? `<a href="${wa}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;margin-left:6px">واتساب</a>` : ""}
        <a href="${admin}" style="display:inline-block;color:#570622;padding:10px 4px">فتح لوحة التحكم ←</a>
      </div></div></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: "WIXA <notify@wixa.dev>", to: [to], reply_to: row.email, subject: `${staging ? "[تجريبي] " : ""}رسالة جديدة من ${row.name}`, html }),
  });
  if (!res.ok) console.error("notify failed", res.status, await res.text());
}

async function handleContact(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (body.website) return json({ ok: true }); // honeypot

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

  const res = await sb(env, "contact_messages", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(row) });
  if (!res.ok) {
    console.error("contact insert failed", res.status, await res.text());
    return json({ error: "storage" }, 502);
  }
  ctx?.waitUntil(notifyOwner(env, row).catch((e) => console.error("notify", e)));
  return json({ ok: true }, 201);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    try {
      switch (route) {
        case "GET /api/site": return await handleSite(env);
        case "POST /api/track": return await handleTrack(request, env);
        case "POST /api/contact": return await handleContact(request, env, ctx);
        case "GET /api/config":
          // Public values the admin dashboard needs to talk to Supabase.
          return json({ env: env.SITE_ENV || "production", supabaseUrl: env.SUPABASE_URL, supabaseKey: env.SUPABASE_PUBLISHABLE_KEY });
        case "GET /sitemap.xml": {
          const today = new Date().toISOString().slice(0, 10);
          return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://wixa.dev/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>\n`, {
            headers: { "content-type": "application/xml; charset=utf-8" },
          });
        }
        case "GET /robots.txt":
          // Keep the staging copy out of search engines.
          return new Response(env.SITE_ENV === "staging" ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nDisallow: /admin/\nSitemap: https://wixa.dev/sitemap.xml\n", {
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        case "GET /health": {
          let supabase = "unreachable";
          try {
            const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
            supabase = r.ok ? "ok" : `error ${r.status}`;
          } catch (err) { supabase = `error: ${err.message}`; }
          return json({ worker: "ok", env: env.SITE_ENV || "production", supabase });
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
