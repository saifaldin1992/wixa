// Smoke tests: start `wrangler dev` first (see .github/workflows/test.yml), then `npm test`.
// Checks every page loads without JS errors or CSP violations and the key flows work.
// Set WIXA_LIB_DIR to a node_modules folder with gsap + lenis to serve CDN files locally (offline runs).
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.WIXA_URL || "http://localhost:8787";
const LIB = process.env.WIXA_LIB_DIR;
const libs = LIB && {
  "gsap.min.js": join(LIB, "gsap/dist/gsap.min.js"),
  "ScrollTrigger.min.js": join(LIB, "gsap/dist/ScrollTrigger.min.js"),
  "lenis.min.js": join(LIB, "lenis/dist/lenis.min.js"),
  "supabase.min.js": join(LIB, "@supabase/supabase-js/dist/umd/supabase.js"),
};

let failed = 0;
const check = (ok, name, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

async function page(browser, url, opts = {}) {
  const ctx = await browser.newContext(opts);
  if (libs) await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, (r) => {
    const f = Object.keys(libs).find((k) => r.request().url().endsWith(k));
    return f ? r.fulfill({ body: readFileSync(libs[f]), contentType: "application/javascript" }) : r.abort();
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: "", contentType: "text/css" }));
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.goto(BASE + url, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  return { p, ctx, errors };
}

const browser = await chromium.launch();
try {
  // API basics
  const health = await fetch(`${BASE}/health`);
  check(health.ok, "/health responds");
  const bad = await fetch(`${BASE}/api/contact`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "" }) });
  check(bad.status === 422 || bad.status === 403, "contact form rejects invalid input", String(bad.status));
  const trap = await fetch(`${BASE}/api/contact`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website: "spam" }) });
  check(trap.status === 200, "honeypot silently accepts bots", String(trap.status));
  check((await fetch(`${BASE}/api/admin/integrations`)).status === 401, "integrations require sign-in");
  const noPhone = await fetch(`${BASE}/api/contact`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Test", email: "t@example.com", message: "hello", phone: "" }) });
  check(noPhone.status === 422 || noPhone.status === 403, "contact form requires a phone number", String(noPhone.status));
  const priv = await fetch(`${BASE}/privacy?lang=ar`);
  check(priv.status === 200 && (await priv.text()).includes("سياسة الخصوصية"), "privacy page responds", String(priv.status));
  check((await fetch(`${BASE}/projects/no-such-project`)).status === 404, "unknown project pages return 404");
  check((await (await fetch(`${BASE}/sitemap.xml`)).text()).includes("/privacy"), "sitemap lists the privacy page");
  check((await fetch(`${BASE}/api/admin/msgmeta`)).status === 401, "message notes require sign-in");
  check((await fetch(`${BASE}/api/admin/diagnose`)).status === 401, "diagnostics require sign-in");
  check((await fetch(`${BASE}/api/admin/team`)).status === 401, "team management requires sign-in");
  check((await fetch(`${BASE}/api/invite/claim`, { method: "POST", body: "{}" })).status === 401, "accepting an invitation requires an account");
  check((await fetch(`${BASE}/api/admin/devguide`)).status === 401, "developer guide requires sign-in");
  const chatPost = (path, body) => fetch(`${BASE}/api/chat/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  check((await chatPost("start", { name: "", phone: "", body: "" })).status === 422, "chat: a conversation needs a name, phone and message");
  check((await chatPost("poll", { id: "x", key: "y" })).status === 422, "chat: a conversation can only be read with its key");
  check((await fetch(`${BASE}/api/admin/push`)).status === 401, "chat notifications require sign-in");
  check((await fetch(`${BASE}/api/client-error`, { method: "POST", body: JSON.stringify({ msg: "test" }) })).status === 204, "browser errors are accepted");
  check((await fetch(`${BASE}/blog`)).status === 200, "articles page responds");
  check((await fetch(`${BASE}/blog/no-such-article`)).status === 404, "unknown articles return 404");
  check((await fetch(`${BASE}/services/no-such-service`)).status === 404, "unknown service pages return 404");
  check((await fetch(`${BASE}/review?c=nope`)).status === 410, "invalid review links are refused");
  check((await fetch(`${BASE}/api/slots?date=2026-01-01`)).status === 200, "booking times respond");
  check((await fetch(`${BASE}/api/event`, { method: "POST", body: JSON.stringify({ e: ["calc_used"] }) })).status === 204, "visitor actions are accepted");
  check((await fetch(`${BASE}/api/admin/funnel`)).status === 401, "visitor action totals require sign-in");
  check((await fetch(`${BASE}/api/admin/review-link`, { method: "POST" })).status === 401, "review links require sign-in");
  check((await fetch(`${BASE}/api/admin/refresh`, { method: "POST" })).status === 401, "publish-now requires sign-in");
  const stats = await fetch(`${BASE}/api/admin/stats`);
  check(stats.status === 401, "admin stats require sign-in", String(stats.status));
  const home = await (await fetch(`${BASE}/`)).text();
  check(home.includes('id="wixa-data"'), "homepage embeds site data");
  check((await fetch(`${BASE}/no-such-page`)).status === 404, "unknown pages return 404");
  const built = await Promise.all(["/build/site.js", "/build/site.css", "/build/shared.js", "/build/admin.js"].map((u) => fetch(BASE + u).then((r) => r.ok && !/html/.test(r.headers.get("content-type") || ""))));
  check(built.every(Boolean), "bundled front end is served");
  const h = (await fetch(`${BASE}/`)).headers;
  check(/frame-ancestors 'self'/.test(h.get("content-security-policy") || ""), "homepage sends CSP");

  // Homepage, desktop + mobile
  for (const [name, opts] of [["desktop", { viewport: { width: 1440, height: 900 } }], ["mobile", devices["iPhone 13"]]]) {
    const { p, ctx, errors } = await page(browser, "/", opts);
    check(errors.length === 0, `home (${name}) has no errors`, errors.slice(0, 3).join(" | "));
    check((await p.textContent("#heroTitle"))?.trim().length > 0, `home (${name}) renders hero title`);
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `home (${name}) has no horizontal scroll`);
    if (name === "desktop") {
      const before = await p.getAttribute("html", "data-theme");
      await p.click("#themeBtn");
      check((await p.getAttribute("html", "data-theme")) !== before, "dark-mode toggle works");
      await p.click("#langBtn"); await p.waitForTimeout(800);
      check((await p.getAttribute("html", "lang")) === "en", "language toggle works");
      // cost calculator: picking a type changes the estimate, the button prefills the contact form
      const price0 = await p.textContent("#calcPrice");
      await p.click("#calcTypes .ctype:last-child"); await p.click("#calcFeats .cfeat"); await p.waitForTimeout(900);
      check((await p.textContent("#calcPrice")) !== price0, "calculator updates the estimate");
      await p.click("#calcCta"); await p.waitForTimeout(1200);
      check((await p.inputValue("#contactForm [name=message]")).length > 10, "calculator prefills the contact form");
      if (await p.$("#projectsList [data-open]")) {
        await p.click("#projectsList .project__more"); await p.waitForTimeout(400);
        check(!(await p.$eval("#pmodal", (m) => m.hidden)), "project details open");
      }
    }
    await ctx.close();
  }

  // Other pages
  for (const [url, sel, min] of [["/admin/", "#authForm", 1]]) {
    const { p, ctx, errors } = await page(browser, url, { viewport: { width: 1280, height: 800 } });
    check(errors.length === 0, `${url} has no errors`, errors.slice(0, 3).join(" | "));
    check((await p.$$(sel)).length >= min, `${url} renders ${sel}`);
    await ctx.close();
  }
  // Dashboard views, signed in against a stand-in Supabase (no real data involved)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route(/supabase-js/, (r) => r.fulfill({ body: readFileSync(new URL("./supabase-stub.js", import.meta.url)), contentType: "application/javascript" }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: "", contentType: "text/css" }));
    // the Worker's admin endpoints would check the stand-in session against the real Supabase: answer them here
    await ctx.route(/\/api\/admin\/team/, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ me: "u1", members: [{ user_id: "u1", email: "owner@example.com", role: "owner", mfa: true }, { user_id: "u2", email: "help@example.com", role: "support", mfa: false }], invites: [{ code: "ABCD-EFGH-JKLM", email: "new@example.com", role: "editor", at: new Date().toISOString() }] }) }));
    await ctx.route(/\/api\/admin\/diagnose/, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ checked_at: new Date().toISOString(), env: "staging", results: [{ group: "الخادم", title: "test", state: "ok", detail: "ok" }, { group: "البريد", title: "test", state: "fail", detail: "x", where: "y", fix: "z" }] }) }));
    await ctx.route(/\/api\/admin\/errors/, (r) => r.fulfill({ contentType: "application/json", body: '[{"where":"site","msg":"TypeError: x","src":"/build/site.js:1","path":"/","count":2,"last":"2026-11-07T00:00:00Z"}]' }));
    await ctx.route(/\/api\/admin\/devguide/, (r) => r.fulfill({ contentType: "text/markdown", body: "# Guide\n\n## One\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nnpm test\n```" }));
    await ctx.route(/\/api\/admin\/status/, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ checked_at: new Date().toISOString(), env: "staging", items: [] }) }));
    await ctx.route(/\/api\/admin\/funnel/, (r) => r.fulfill({ contentType: "application/json", body: '{"days":30,"total":{"calc_used":3}}' }));
    await ctx.route(/\/api\/admin\/msgmeta$/, (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
    await ctx.route(/\/api\/admin\/integrations$/, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({
      alerts: { on: true, from_name: "WIXA" }, autoreply: { on: false, subject_ar: "", body_ar: "", subject_en: "", body_en: "" },
      spam: { turnstile: true, blocked: "" }, tags: { ga4: "", meta_pixel: "", clarity: "", tiktok: "" }, maintenance: { on: false, message_ar: "", message_en: "", bypass: "" } }) }));
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${BASE}/admin/`, { waitUntil: "load" });
    await p.waitForTimeout(1200);
    for (const v of ["overview", "appearance", "brand", "content", "projects", "services", "partners", "testimonials", "messages", "chats", "customers", "posts", "seo", "integrations", "diagnose", "devguide", "team", "account"]) {
      await p.evaluate((h) => (location.hash = h), v);
      await p.waitForTimeout(600);
      const ok = await p.evaluate(() => document.querySelector("#view")?.children.length > 0);
      check(ok && errors.length === 0, `dashboard: ${v} view opens`, errors.splice(0).slice(0, 2).join(" | "));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
