// WIXA — Cloudflare Worker: serves the site (public/) and handles the API.
const json = (data, status = 200) => Response.json(data, { status });

async function handleContact(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }

  // Honeypot: bots fill the hidden "website" field.
  if (body.website) return json({ ok: true });

  const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const row = {
    name: clean(body.name, 120),
    email: clean(body.email, 200),
    phone: clean(body.phone, 40) || null,
    message: clean(body.message, 4000),
    services: Array.isArray(body.services) ? body.services.filter((s) => typeof s === "string").slice(0, 10).map((s) => s.slice(0, 80)) : [],
    lang: body.lang === "en" ? "en" : "ar",
  };
  if (!row.name || !row.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    return json({ error: "validation" }, 422);
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/contact_messages`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    console.error("supabase insert failed", res.status, await res.text());
    return json({ error: "storage" }, 502);
  }
  return json({ ok: true }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return handleContact(request, env);
    }

    if (url.pathname === "/health") {
      let supabase = "unreachable";
      try {
        const res = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
        supabase = res.ok ? "ok" : `error ${res.status}`;
      } catch (err) {
        supabase = `error: ${err.message}`;
      }
      return json({ worker: "ok", supabase });
    }

    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
  },
};
