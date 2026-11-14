// WIXA — Cloudflare Worker: serves the site (public/) and the API.
//
// Built to stay fast under heavy traffic:
//  • Site content is read from Supabase at most once a minute per edge location
//    (isolate memory + Cloudflare edge cache), never once per visitor.
//  • The homepage HTML gets that content injected, so a visit needs no extra API round trip.
//  • The contact form is rate limited per IP, checked by Turnstile and written through a
//    token-checked database function, so nobody can write to the database directly.
//  • Visits are counted by Cloudflare Web Analytics, not by this Worker.
//
// The code is split into layers next to this file — lib/ → services/ → jobs/ → routes/ → index.js — and a file
// only imports from layers below it or beside it (tests/structure.mjs checks there are no import cycles).
// See docs/DEVELOPERS.md → «الخادم».

import { runBackup, runBookingReminders, runMonitor, runReminders, runWeeklyReport } from "./jobs/scheduled.js";
import { SECURITY_HEADERS, SITE_TTL, json, notFound, serveBuild } from "./lib/core.js";
import { PATH_RE, STATUS_DEFAULTS, sitePages } from "../public/js/site-pages.js";
import { handleAdminBooking, handleAdminCampaign, handleAdminOrder, handleAdminRestore, handlePayWebhook, handleAdminDevGuide, handleAdminFunnel, handleAdminIntegrations, handleAdminMsgMeta, handleAdminNotify, handleAdminPage, handleAdminRefresh, handleAdminReviewLink, handleAdminStats, handleAdminStatus, handleAdminTeam, handleAdminTest, handleInviteClaim } from "./routes/admin.js";
import { handleAdminPush, handleChat, handleChatRate, handlePushLast } from "./routes/chat.js";
import { handleAdminDiagnose } from "./routes/diagnose.js";
import { handleAdminErrors, handleClientError, recordError } from "./routes/errors.js";
import { handleAdminOrderNotify, handlePortalData, handlePortalLogin, handlePortalPage } from "./routes/portal.js";
import { handleContact, handleEvent, handleOrder, handleOrderFind, handleReview, handleSlots, handleTrack, handleUnsubscribe } from "./routes/forms.js";
import { handleBlog, handleCustomPage, handleHome, handleNotFound, handlePrivacy, handleProjectPage, handleServicePage, handleStatus, handleTeam } from "./routes/pages.js";
import { getConfig, getPosts, getSiteData } from "./services/data.js";

let health = { at: 0, supabase: "unknown" };

export default {
  // "*/15 * * * *" → health check; "17 6 * * SUN" → weekly report (Sunday 09:17 Baghdad)
  async scheduled(event, env, ctx) {
    if (event.cron === "17 6 * * SUN") ctx.waitUntil(runWeeklyReport(env).catch((e) => console.error("weekly", e)));
    else if (event.cron === "23 3 * * *") {
      ctx.waitUntil(runBackup(env).catch((e) => console.error("backup", e)));
      ctx.waitUntil(runReminders(env).catch((e) => console.error("reminders", e))); // 06:23 Baghdad
    }
    else {
      ctx.waitUntil(runMonitor(env).catch((e) => console.error("monitor", e)));
      ctx.waitUntil(runBookingReminders(env).catch((e) => console.error("booking reminders", e)));
    }
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // one address for search engines: www.wixa.dev → wixa.dev (permanent)
    if (url.hostname === "www.wixa.dev") { url.hostname = "wixa.dev"; return Response.redirect(url.toString(), 301); }
    const route = `${request.method} ${url.pathname}`;
    if (url.pathname.startsWith("/build/") && (request.method === "GET" || request.method === "HEAD")) return serveBuild(request, env, url);

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
        case "POST /api/order": return await handleOrder(request, env, ctx);
        case "POST /api/order-status": return await handleTrack(request, env);
        case "POST /api/order-find": return await handleOrderFind(request, env);
        case "POST /api/portal/login": return await handlePortalLogin(request, env);
        case "POST /api/portal": return await handlePortalData(request, env);
        case "GET /portal":
        case "HEAD /portal": return await handlePortalPage(request, env, ctx);
        case "POST /api/admin/order-notify": return await handleAdminOrderNotify(request, env);
        case "GET /api/push/last": return await handlePushLast(request, env, url);
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
        case "POST /api/admin/order": return await handleAdminOrder(request, env, ctx);
        case "POST /api/admin/restore": return await handleAdminRestore(request, env);
        case "POST /api/admin/review-link": return await handleAdminReviewLink(request, env);
        // the hub pages: all services, all our work, packages + the cost calculator (built from sections, like /about)
        case "GET /services":
        case "GET /projects":
        case "GET /pricing":
        case "GET /about":
        case "GET /careers":
        case "GET /order":
        case "GET /track":
        case "GET /contact":
        case "GET /faq":
          return await handleHome(request, env, ctx, url.pathname.slice(1));
        case "GET /privacy":
        case "HEAD /privacy":
          return await handlePrivacy(request, env, ctx);
        case "GET /team":
        case "HEAD /team":
          return await handleTeam(request, env, ctx);
        case "GET /status":
        case "HEAD /status":
          return await handleStatus(request, env, ctx);
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
        case "GET /sitemap.xml": {
          const today = new Date().toISOString().slice(0, 10);
          let projects = [], services = [], st = {};
          try { const d = JSON.parse(await getSiteData(env, ctx)); projects = d.projects || []; services = d.services || []; st = d.settings || {}; } catch {}
          const posts = await getPosts(env);
          const extra = [...sitePages(st).filter((p) => p.published).map((p) => p.path), ...(st.team?.on ? ["/team"] : []), ...({ ...STATUS_DEFAULTS, ...(st.status_page || {}) }.on ? ["/status"] : [])];
          const urls = ["/", "/services", "/projects", "/pricing", "/about", "/careers", "/contact", "/faq", "/order", "/privacy", "/terms", "/payment", ...(posts.length ? ["/blog"] : []), ...extra, ...services.map((x) => `/services/${encodeURIComponent(x.slug)}`), ...projects.map((x) => `/projects/${encodeURIComponent(x.slug)}`), ...posts.map((x) => `/blog/${encodeURIComponent(x.slug)}`)].filter((p, i, all) => all.indexOf(p) === i)
            // both language versions of every page, each naming the other (and the bare address as x-default)
            .flatMap((p) => ["ar", "en"].map((l) => `<url><loc>https://wixa.dev${p}?lang=${l}</loc><lastmod>${today}</lastmod>${["ar", "en"].map((h) => `<xhtml:link rel="alternate" hreflang="${h}" href="https://wixa.dev${p}?lang=${h}"/>`).join("")}<xhtml:link rel="alternate" hreflang="x-default" href="https://wixa.dev${p}"/></url>`)).join("");
          return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>\n`, {
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
        case "HEAD /health": // uptime monitors and the CI wait (wait-on) ask with HEAD
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
          const res = json({ worker: "ok", env: env.SITE_ENV || "production", supabase: health.supabase }, 200, { "cache-control": "no-store" });
          return request.method === "HEAD" ? new Response(null, { status: 200, headers: res.headers }) : res;
        }
      }
      const hook = url.pathname.match(/^\/api\/pay\/wayl\/([a-f0-9]{32})$/);
      if (hook && request.method === "POST") return await handlePayWebhook(request, env, hook[1]);
      const svc = url.pathname.match(/^\/services\/([^/]+)\/?$/);
      if (svc && (request.method === "GET" || request.method === "HEAD")) return await handleServicePage(request, env, ctx, decodeURIComponent(svc[1]));
      const post = url.pathname.match(/^\/blog\/([^/]+)\/?$/);
      if (post && (request.method === "GET" || request.method === "HEAD")) return await handleBlog(request, env, ctx, decodeURIComponent(post[1]));
      const proj = url.pathname.match(/^\/projects\/([^/]+)\/?$/);
      if (proj && (request.method === "GET" || request.method === "HEAD")) return await handleProjectPage(request, env, ctx, decodeURIComponent(proj[1]));
      if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
      // pages added from the dashboard (/terms, /payment…) and extra addresses for existing pages
      if ((request.method === "GET" || request.method === "HEAD") && PATH_RE.test(url.pathname)) {
        const page = await handleCustomPage(request, env, ctx, url.pathname);
        if (page) return page;
        let st = {};
        try { st = JSON.parse(await getSiteData(env, ctx)).settings || {}; } catch {}
        const alias = (Array.isArray(st.aliases) ? st.aliases : []).find((a) => a?.from === url.pathname && typeof a.to === "string" && /^\/[^/\\]/.test(a.to + "x") && !a.to.startsWith("//"));
        if (alias) return new Response(null, { status: 301, headers: { location: `${alias.to}${url.search}`, "cache-control": "public, max-age=300" } });
      }
    } catch (err) {
      console.error(err);
      recordError(env, ctx, { where: "server", msg: `${err?.name || "Error"}: ${err?.message || err}`, src: String(err?.stack || "").split("\n")[1]?.trim() || "", path: `${request.method} ${url.pathname}` });
      return json({ error: "server" }, 500);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    // a missing page gets the site's 404 page (header, footer, links); a missing file (image, script…) the plain one
    const isPage = request.method === "GET" && !/\.[a-z0-9]{1,5}$/i.test(url.pathname) && (request.headers.get("accept") || "").includes("text/html");
    return isPage ? handleNotFound(request, env, ctx) : notFound(request, env);
  },
};
