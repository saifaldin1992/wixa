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
  const stats = await fetch(`${BASE}/api/admin/stats`);
  check(stats.status === 401, "admin stats require sign-in", String(stats.status));
  const home = await (await fetch(`${BASE}/`)).text();
  check(home.includes('id="wixa-data"'), "homepage embeds site data");
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
  for (const [url, sel, min] of [["/admin/", "#authForm", 1], ["/brand/", "#logos .card", 16]]) {
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
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${BASE}/admin/`, { waitUntil: "load" });
    await p.waitForTimeout(1200);
    for (const v of ["overview", "appearance", "content", "projects", "services", "partners", "testimonials", "messages", "account"]) {
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
