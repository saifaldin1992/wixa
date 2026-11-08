// Dashboard on a phone: no page may be wider than the screen. Usage: BASE=http://localhost:8787 node tests/admin-phone.mjs [shots-dir]
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { readFileSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:8787", OUT = process.argv[2] || "";
const VIEWS = ["overview", "orders", "messages", "chats", "customers", "sales", "campaigns", "content", "appearance", "brand", "projects", "services", "partners", "testimonials", "posts", "seo", "integrations", "notify", "protect", "backup", "diagnose", "audit", "devguide", "team", "account"];
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 13"] });
await ctx.route(/supabase-js/, (r) => r.fulfill({ body: readFileSync(new URL("./supabase-stub.js", import.meta.url)), contentType: "application/javascript" }));
await ctx.route(/\/api\/admin\//, (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
const p = await ctx.newPage();
await p.goto(`${BASE}/admin/`, { waitUntil: "load" }); await p.waitForTimeout(1200);
let bad = 0;
for (const v of VIEWS) {
  await p.evaluate((h) => (location.hash = h), v); await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const vw = window.visualViewport ? Math.round(visualViewport.width * visualViewport.scale) : innerWidth, wide = [];
    for (const el of document.querySelectorAll("#view *, .top *")) { const x = el.getBoundingClientRect(); if (x.width && (x.right > vw + 1 || x.left < -1) && !el.closest(".seg, .tabs, .table-wrap, [data-scroll], .side, .scrim")) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`); }
    return { sw: Math.max(document.documentElement.scrollWidth, innerWidth), vw, wide: [...new Set(wide)].slice(0, 6) };
  });
  const ok = r.sw <= r.vw + 1 && !r.wide.length;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${v}${ok ? "" : ` page ${r.sw}px > ${r.vw}px · ${r.wide.join(" ")}`}`);
  if (OUT) await p.screenshot({ path: `${OUT}/adm-${v}.png` });
}
await b.close();
process.exit(bad ? 1 : 0);
