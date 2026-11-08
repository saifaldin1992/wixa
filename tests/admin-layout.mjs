// Dashboard size rules, on a phone and on a computer, for every page:
//  1. nothing is wider than the screen;
//  2. a card on its own fills the page width, and a row of cards starts at the page edge — so every page has the
//     same rectangles (no page sets its own narrower width).
// Usage: BASE=http://localhost:8787 node tests/admin-layout.mjs
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { readFileSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:8787";
const VIEWS = ["overview", "orders", "messages", "chats", "customers", "sales", "campaigns", "content", "appearance", "brand", "projects", "services", "partners", "testimonials", "posts", "seo", "integrations", "notify", "protect", "backup", "diagnose", "audit", "devguide", "team", "account"];

// realistic answers from the server, so every page draws its cards
const src = readFileSync(new URL("../src/services/data.js", import.meta.url), "utf8");
const at = src.indexOf("{", src.indexOf("const CONFIG_DEFAULTS = {"));
let depth = 0, end = at;
for (let k = at; k < src.length; k++) { if (src[k] === "{") depth++; else if (src[k] === "}" && !--depth) { end = k; break; } }
const CONFIG = JSON.stringify({ ...(0, eval)(`(${src.slice(at, end + 1)})`), backup_last: null });
const API = { integrations: CONFIG, team: JSON.stringify({ members: [{ email: "owner@wixa.dev", role: "owner", me: true }], invites: [] }), campaign: JSON.stringify({ audience: 0, log: [] }), errors: "[]" };
const GUIDE = readFileSync(new URL("../docs/DEVELOPERS.md", import.meta.url), "utf8");

const b = await chromium.launch();
let bad = 0;
for (const [name, opts] of [["phone", { ...devices["iPhone 13"] }], ["computer", { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await b.newContext(opts);
  await ctx.route(/supabase-js/, (r) => r.fulfill({ body: readFileSync(new URL("./supabase-stub.js", import.meta.url)), contentType: "application/javascript" }));
  await ctx.route(/\/api\/admin\//, (r) => {
    const last = new URL(r.request().url()).pathname.split("/").pop();
    if (last === "devguide") return r.fulfill({ contentType: "text/markdown; charset=utf-8", body: GUIDE });
    return r.fulfill({ contentType: "application/json", body: API[last] || "{}" });
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/`, { waitUntil: "load" }); await p.waitForTimeout(1200);
  for (const v of VIEWS) {
    await p.evaluate((h) => (location.hash = h), v); await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const view = document.getElementById("view").getBoundingClientRect();
      const vw = innerWidth, problems = [];
      if (document.documentElement.scrollWidth > vw + 1) problems.push(`page ${document.documentElement.scrollWidth}px wide`);
      // the blocks of the page: cards, number tiles, the preview pane, empty states — not ones inside another block
      const sel = ".card, .kpi, .preview, .empty";
      const blocks = [...document.querySelectorAll(`#view :is(${sel})`)].filter((e) => e.offsetParent && !e.parentElement.closest(sel) && e.getBoundingClientRect().width);
      const rows = new Map();
      for (const e of blocks) { const x = e.getBoundingClientRect(), k = Math.round(x.top / 4); (rows.get(k) || rows.set(k, []).get(k)).push(x); }
      const rtl = document.documentElement.dir === "rtl";
      for (const row of rows.values()) {
        const left = Math.min(...row.map((x) => x.left)), right = Math.max(...row.map((x) => x.right));
        const startOk = rtl ? Math.abs(right - view.right) <= 2 : Math.abs(left - view.left) <= 2;
        const full = Math.abs(left - view.left) <= 2 && Math.abs(right - view.right) <= 2;
        if (!startOk || (row.length === 1 && !full)) problems.push(`a card ${Math.round(right - left)}px wide on a ${Math.round(view.width)}px page`);
      }
      return [...new Set(problems)].slice(0, 3);
    });
    if (r.length) { bad++; console.log(`✗ ${name} ${v}: ${r.join(" · ")}`); }
    else console.log(`✓ ${name} ${v}`);
  }
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
