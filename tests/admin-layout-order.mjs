// Dashboard → صفحات الموقع → «ترتيب الأقسام»: the rows follow the page's layout, the arrows move a section, the switch hides
// it, the change is marked unsaved, and the live preview shows the new order before saving.
// Usage: BASE=http://localhost:8787 node tests/admin-layout-order.mjs
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { readFileSync } from "node:fs";
const { DEFAULT_LAYOUTS } = await import("../public/js/site-structure.js");
const BASE = process.env.BASE || "http://localhost:8787";
let bad = 0;
const check = (ok, label) => { if (!ok) bad++; console.log(`${ok ? "✓" : "✗"} ${label}`); };
const b = await chromium.launch();
for (const [name, opts] of [["phone", devices["Galaxy S9+"]], ["computer", { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await b.newContext(opts);
  await ctx.route(/supabase-js/, (r) => r.fulfill({ body: readFileSync(new URL("./supabase-stub.js", import.meta.url)), contentType: "application/javascript" }));
  await ctx.route(/\/api\/admin\//, (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${BASE}/admin/#content`, { waitUntil: "load" }); await p.waitForTimeout(1200);
  await p.click('#ctBranch button[data-b="layout"]'); await p.waitForTimeout(600);
  const rows = await p.$$eval("#lyList .ly__row", (r) => r.map((x) => x.dataset.k));
  check(rows.join(" ") === DEFAULT_LAYOUTS.home.join(" "), `${name}: the home page's sections are listed in order`);
  // move «القصة» (2nd) down one place
  await p.click('#lyList .ly__row[data-k="story"] [data-down]'); await p.waitForTimeout(300);
  const moved = await p.$$eval("#lyList .ly__row", (r) => r.map((x) => x.dataset.k));
  check(moved[1] === "partners" && moved[2] === "story", `${name}: the arrow moves a section down`);
  check(await p.$eval("#saveBtn", (b) => !b.disabled), `${name}: the change is marked unsaved («حفظ ونشر» is active)`);
  // switch «الأرقام» off
  await p.click('#lyList .ly__row[data-k="stats"] .switch'); await p.waitForTimeout(300);
  check(await p.$eval('#lyList .ly__row[data-k="stats"]', (e) => e.classList.contains("is-off")), `${name}: the switch hides a section`);
  // the preview follows (it receives the unsaved settings)
  const frame = p.frame({ url: /preview=1/ });
  await p.waitForTimeout(1200);
  const pv = frame ? await frame.$$eval("main > section[data-s]", (s) => s.filter((e) => e.dataset.pages === "home").map((e) => e.dataset.s)) : [];
  check(pv.slice(0, 3).join(" ") === "hero partners story" && !pv.includes("stats"), `${name}: the live preview shows the new order (${pv.slice(0, 4).join(" ")})`);
  // another page: the list and the preview change to it
  await p.click('#lyPage button[data-p="about"]'); await p.waitForTimeout(1500);
  const aboutRows = await p.$$eval("#lyList .ly__row", (r) => r.map((x) => x.dataset.k));
  check(aboutRows.join(" ") === DEFAULT_LAYOUTS.about.join(" "), `${name}: «من نحن» lists its own sections`);
  check(/\/about\?preview=1/.test(await p.$eval("#pvFrame", (f) => f.getAttribute("src"))), `${name}: the preview opens «من نحن»`);
  // the row is no wider than the screen
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!wide, `${name}: nothing wider than the screen`);
  check(!errors.length, `${name}: no script errors${errors.length ? " — " + errors[0] : ""}`);
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
