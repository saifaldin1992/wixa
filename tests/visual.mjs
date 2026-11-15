// Visual safety net: photographs every site page and every dashboard page, then compares a later run with the saved
// one pixel by pixel. Any difference fails. Use it around changes that must not change what anyone sees.
//   BASE=http://localhost:8787 node tests/visual.mjs save <dir>      → saves the reference pictures
//   BASE=http://localhost:8787 node tests/visual.mjs compare <dir>   → compares; differences are written to <dir>/diff
// Site: 15 pages × phone / tablet / computer × light / dark × Arabic / English. Dashboard: its pages × phone / computer
// × light / dark, with sample data (tests/supabase-stub.js). Motion is stopped for the pictures (animations disabled,
// reduced motion), so only what is drawn is compared.
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:8787";
const [mode, DIR] = process.argv.slice(2);
if (!["save", "compare"].includes(mode) || !DIR) { console.log("usage: node tests/visual.mjs save|compare <dir>"); process.exit(2); }
mkdirSync(DIR, { recursive: true });
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const PAGES = ["/", "/services", "/services/mobile-apps", "/projects", "/projects/unified-e-services-portal", "/pricing", "/about", "/careers", "/faq", "/contact", "/order", "/portal", "/blog", "/privacy", "/nope"];
const VIEWS = ["overview", "inbox", "orders", "chats", "customers", "sales", "visits", "campaigns", "seo", "content", "menus", "services", "projects", "testimonials", "partners", "posts", "media", "appearance", "brand", "account", "team", "notify", "integrations", "protect", "backup", "diagnose", "audit", "devguide"];
const DEV = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: devices["iPhone 13"].userAgent },
  tablet: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
  computer: { viewport: { width: 1440, height: 900 } },
};
const stub = readFileSync(new URL("./supabase-stub.js", import.meta.url));
const b = await chromium.launch();
const shots = [];
const shoot = async (p, name) => {
  if (ONLY && !ONLY.test(name)) return;
  // let fonts, images and late layout settle; then a still picture of the whole page
  await p.evaluate(() => document.fonts?.ready).catch(() => {});
  await p.waitForTimeout(500);
  const buf = await p.screenshot({ fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
  shots.push([name, buf]);
};

for (const [dev, opts] of Object.entries(DEV)) for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: "reduce" });
  await ctx.route(/challenges\.cloudflare\.com|cloudflareinsights|googletagmanager|fonts\.g/, (r) => r.abort());
  const p = await ctx.newPage();
  for (const path of PAGES) for (const lang of ["ar", "en"]) {
    const url = `${BASE}${path}${lang === "en" ? (path.includes("?") ? "&" : "?") + "lang=en" : ""}`;
    await p.goto(url, { waitUntil: "networkidle" }).catch(() => {});
    await shoot(p, `site ${dev} ${scheme} ${lang} ${path}`);
  }
  await ctx.close();
}
for (const dev of ["phone", "computer"]) for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ ...DEV[dev], deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: "reduce" });
  await ctx.route(/supabase-js/, (r) => r.fulfill({ body: stub, contentType: "application/javascript" }));
  await ctx.route(/\/api\/admin\//, (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  await ctx.route(/challenges\.cloudflare\.com|cloudflareinsights/, (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/`, { waitUntil: "load" }); await p.waitForTimeout(1500);
  for (const v of VIEWS) {
    await p.evaluate((h) => (location.hash = h), v); await p.waitForTimeout(1200);
    await shoot(p, `admin ${dev} ${scheme} ${v}`);
  }
  await ctx.close();
}

const file = (name) => `${DIR}/${name.replace(/[^\w-]+/g, "_")}.png`;
if (mode === "save") {
  for (const [name, buf] of shots) writeFileSync(file(name), buf);
  console.log(`saved ${shots.length} pictures in ${DIR}`);
  await b.close(); process.exit(0);
}

// compare: identical files pass at once; otherwise count the pixels that differ (in a page, with a canvas)
mkdirSync(`${DIR}/diff`, { recursive: true });
const cmp = await (await b.newContext()).newPage();
let bad = 0, same = 0;
for (const [name, buf] of shots) {
  const ref = file(name);
  if (!existsSync(ref)) { console.log(`? ${name}: no reference picture`); bad++; continue; }
  const old = readFileSync(ref);
  if (old.equals(buf)) { same++; continue; }
  const r = await cmp.evaluate(async ([a, c]) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const [x, y] = await Promise.all([load(a), load(c)]);
    if (x.width !== y.width || x.height !== y.height) return { size: `${x.width}×${x.height} → ${y.width}×${y.height}` };
    const cv = (i) => { const c2 = document.createElement("canvas"); c2.width = i.width; c2.height = i.height; const g = c2.getContext("2d"); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const d1 = cv(x), d2 = cv(y);
    let n = 0, top = 1e9, bottom = -1;
    for (let k = 0; k < d1.length; k += 4) if (d1[k] !== d2[k] || d1[k + 1] !== d2[k + 1] || d1[k + 2] !== d2[k + 2]) { n++; const row = (k / 4 / x.width) | 0; top = Math.min(top, row); bottom = Math.max(bottom, row); }
    return { n, top, bottom };
  }, [`data:image/png;base64,${old.toString("base64")}`, `data:image/png;base64,${buf.toString("base64")}`]);
  if (!r.size && r.n === 0) { same++; continue; }
  bad++;
  writeFileSync(`${DIR}/diff/${name.replace(/[^\w-]+/g, "_")}.png`, buf);
  console.log(`✗ ${name}: ${r.size ? `size ${r.size}` : `${r.n} pixels differ (rows ${r.top}–${r.bottom})`}`);
}
console.log(`${same} identical, ${bad} different, of ${shots.length}`);
await b.close();
process.exit(bad ? 1 : 0);
