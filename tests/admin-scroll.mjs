// Dashboard on a phone: scrolling must not make the top bar flip between large and compact over and over
// (it used to: the bar got shorter, the browser pulled the scroll back, the bar grew again — the page shook).
// Each page is scrolled down slowly and back up; the bar may change at most once each way, and nothing under it may jump.
// Usage: BASE=http://localhost:8787 node tests/admin-scroll.mjs
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { readFileSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:8787";
const VIEWS = ["sales", "content", "overview", "orders", "appearance", "brand", "integrations"];
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["Galaxy S9+"] });
await ctx.route(/supabase-js/, (r) => r.fulfill({ body: readFileSync(new URL("./supabase-stub.js", import.meta.url)), contentType: "application/javascript" }));
await ctx.route(/\/api\/admin\//, (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
const p = await ctx.newPage();
await p.goto(`${BASE}/admin/`, { waitUntil: "load" }); await p.waitForTimeout(1200);
let bad = 0;
for (const v of VIEWS) {
  await p.evaluate((h) => { scrollTo(0, 0); location.hash = h; }, v); await p.waitForTimeout(900);
  const r = await p.evaluate(async () => {
    const top = document.querySelector(".top"), view = document.querySelector("#view");
    let flips = 0, last = top.classList.contains("top--compact"), jumps = 0;
    const max = Math.min(260, document.documentElement.scrollHeight - innerHeight);
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const dir of [1, -1]) {
      for (let i = 0; i <= max; i += 4) {
        const y = dir > 0 ? i : max - i;
        const before = view.getBoundingClientRect().top + scrollY;   // where the content sits in the page
        scrollTo(0, y); await frame();
        const after = view.getBoundingClientRect().top + scrollY;
        if (Math.abs(after - before) > 2 || Math.abs(scrollY - y) > 2) jumps++;   // content moved, or the browser pulled the scroll
        const c = top.classList.contains("top--compact"); if (c !== last) { flips++; last = c; }
      }
    }
    return { flips, jumps, max };
  });
  const ok = r.flips <= 2 && r.jumps === 0;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${v} (scrolled ${r.max}px: bar changed ${r.flips}×, content jumped ${r.jumps}×)`);
}
await b.close();
process.exit(bad ? 1 : 0);
