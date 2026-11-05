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
  const [settings, projects, services, partners] = await Promise.all([
    sb(env, "site_settings?select=data&id=eq.1").then((r) => (r.ok ? r.json() : [])),
    q("projects"), q("services"), q("partners"),
  ]);
  return json(
    { settings: settings[0]?.data || {}, projects, services, partners },
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
async function handleContact(request, env) {
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
  return json({ ok: true }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    try {
      switch (route) {
        case "GET /api/site": return await handleSite(env);
        case "POST /api/track": return await handleTrack(request, env);
        case "POST /api/contact": return await handleContact(request, env);
        case "GET /api/config":
          // Public values the admin dashboard needs to talk to Supabase.
          return json({ supabaseUrl: env.SUPABASE_URL, supabaseKey: env.SUPABASE_PUBLISHABLE_KEY });
        case "GET /health": {
          let supabase = "unreachable";
          try {
            const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
            supabase = r.ok ? "ok" : `error ${r.status}`;
          } catch (err) { supabase = `error: ${err.message}`; }
          return json({ worker: "ok", supabase });
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
