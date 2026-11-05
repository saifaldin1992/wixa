// wixa — Cloudflare Worker backed by Supabase.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      let supabase = "unreachable";
      try {
        const res = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, {
          headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
        });
        supabase = res.ok ? "ok" : `error ${res.status}`;
      } catch (err) {
        supabase = `error: ${err.message}`;
      }
      return Response.json({ worker: "ok", supabase });
    }

    return new Response("wixa is running. See /health for the Supabase connection status.\n", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
