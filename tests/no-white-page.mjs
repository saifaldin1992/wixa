// Never a white page, even when the connection breaks:
//  1. home page whose script never arrives → after 4 s the content is shown without animations;
//  2. home page normally → the script reveals it (and the safety net stays out of the way);
//  3. dashboard whose database never answers → a loading screen at once, then «إعادة المحاولة» after 10 s;
//  4. dashboard normally → the loading screen is gone.
// Usage: BASE=http://localhost:8787 node tests/no-white-page.mjs
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { readFileSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:8787";
const b = await chromium.launch();
let bad = 0;
const check = (ok, name, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`); if (!ok) bad++; };
const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const c = getComputedStyle(e), r = e.getBoundingClientRect(); return c.display !== "none" && c.visibility !== "hidden" && +c.opacity > 0.5 && r.height > 0; }, sel);

// 1 + 2: home page
for (const blocked of [true, false]) {
  const ctx = await b.newContext({ ...devices["Galaxy S9+"] });
  if (blocked) await ctx.route(/\/build\/site\.js/, () => {}); // the request never finishes
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`, { waitUntil: "commit" });
  await p.waitForTimeout(blocked ? 5000 : 2500);
  const title = await visible(p, ".hero__title, .hero h1");
  const cls = await p.evaluate(() => document.documentElement.className);
  if (blocked) check(title && /no-anim/.test(cls), "home page without its script: content shown after 4 s", cls);
  else check(title && /site-ready/.test(cls), "home page normally: shown by its script", cls);
  await ctx.close();
}

// 3 + 4: dashboard
for (const hang of [true, false]) {
  const ctx = await b.newContext({ ...devices["Galaxy S9+"] });
  let stub = readFileSync(new URL("./supabase-stub.js", import.meta.url), "utf8");
  if (hang) stub = stub.replace("getSession: () => ok({ session })", "getSession: () => new Promise(() => {})"); // the database never answers
  await ctx.route(/supabase-js/, (r) => r.fulfill({ body: stub, contentType: "application/javascript" }));
  await ctx.route(/\/api\/admin\//, (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(800);
  const early = await visible(p, "#boot");
  if (hang) {
    await p.waitForTimeout(10500);
    const retry = await visible(p, "#bootRetry");
    check(early && retry, "dashboard without a database answer: loading screen at once, retry after 10 s");
  } else {
    await p.waitForTimeout(1500);
    const gone = !(await visible(p, "#boot")) && (await visible(p, "#app"));
    check(gone, "dashboard normally: the loading screen gives way to the dashboard");
  }
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} check(s) failed` : "no white page: all checks passed");
process.exit(bad ? 1 : 0);
