// Every dashboard button does something. Each page is opened with one sample row in every table; every visible
// button (page, top bar, sub-menu) is clicked on a fresh page, and something must happen within 1.2 s: the page
// changes, a window opens, a request goes out or a file downloads. Buttons that do nothing are listed as failures.
// Usage: BASE=http://localhost:8787 node tests/admin-buttons.mjs [view…]
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { readFileSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:8787";
const ALL = ["overview", "orders", "messages", "chats", "customers", "sales", "campaigns", "content", "appearance", "brand", "projects", "services", "partners", "testimonials", "posts", "media", "inbox", "seo", "integrations", "notify", "protect", "backup", "diagnose", "audit", "devguide", "team", "account"];
const VIEWS = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
// buttons that legitimately change nothing visible in a stubbed dashboard
const SKIP = /^(تسجيل الخروج|خروج)$/;

const now = new Date().toISOString();
const SAMPLE = {
  id: "11111111-1111-1111-1111-111111111111", created_at: now, updated_at: now, at: now, last_at: now, published: true, sort: 0,
  name: "تجربة", title_ar: "عنوان", title_en: "Title", desc_ar: "وصف", desc_en: "Desc", body_ar: "نص", body_en: "Text",
  slug: "test", email: "a@example.com", phone: "07700000000", message: "رسالة", status: "new", stage: "new", source: "site",
  ref: "WX-261108-0001", topic: "", last_text: "مرحبا", last_from: "visitor", unread: 1, rating: 5, text_ar: "رأي", text_en: "Review",
  logo: "", image: "", url: "https://example.com", icon: "code", role: "owner", user_id: "00000000-0000-0000-0000-000000000001",
  actor_email: "owner@example.com", actor_role: "owner", area: "projects", action: "update", target: "x", summary: "", changes: {},
};
let stub = readFileSync(new URL("./supabase-stub.js", import.meta.url), "utf8")
  .replace("then: (res, rej) => ok(single ? (rows[table] ?? null) : [], { count: 0 }).then(res, rej),",
    `then: (res, rej) => ok(single ? (rows[table] ?? ${JSON.stringify(SAMPLE)}) : (table === "site_settings" ? [] : [${JSON.stringify(SAMPLE)}]), { count: 1 }).then(res, rej),`);

// answers of the dashboard's own server, shaped like the real ones
const src = readFileSync(new URL("../src/services/data.js", import.meta.url), "utf8");
const at = src.indexOf("{", src.indexOf("const CONFIG_DEFAULTS = {"));
let depth = 0, end = at;
for (let k = at; k < src.length; k++) { if (src[k] === "{") depth++; else if (src[k] === "}" && !--depth) { end = k; break; } }
const CONFIG = (0, eval)(`(${src.slice(at, end + 1)})`);
const me = { user_id: "00000000-0000-0000-0000-000000000001", email: "owner@example.com", role: "owner" };
const API = {
  integrations: CONFIG,
  campaign: { audience: 2, log: [{ at: now, subject: "عرض", sent: 2 }] },
  team: { me, members: [me, { user_id: "2", email: "ed@example.com", role: "editor" }], invites: [{ id: "i1", email: "new@example.com", role: "support", created_at: now, expires_at: now }] },
  diagnose: { checked_at: now, env: "staging", results: [{ group: "site", state: "ok", title: "الموقع", detail: "يعمل", where: "", fix: "" }, { group: "db", state: "warn", title: "القاعدة", detail: "بطيئة", where: "Supabase", fix: "انتظر" }] },
  errors: { items: [{ at: now, where: "test", message: "خطأ تجريبي" }] },
  devguide: readFileSync(new URL("../docs/DEVELOPERS.md", import.meta.url), "utf8"),
};
const answer = (url) => { const k = Object.keys(API).find((x) => new URL(url).pathname.endsWith("/" + x)); const v = k ? API[k] : {}; return typeof v === "string" ? v : JSON.stringify(v); };

const b = await chromium.launch();
let bad = 0;
const fails = [];
async function open(view) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.route(/supabase-js/, (r) => r.fulfill({ body: stub, contentType: "application/javascript" }));
  await ctx.route(/\/api\/admin\//, (r) => r.fulfill({ contentType: "application/json", body: r.request().method() === "GET" ? answer(r.request().url()) : "{}" }));
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && /TypeError|ReferenceError/.test(m.text())) errs.push(m.text().split("\n")[0]); });
  await p.goto(`${BASE}/admin/#${view}`, { waitUntil: "load" });
  await p.waitForTimeout(1300);
  return { ctx, p, errs };
}
const listButtons = (p) => p.$$eval("#view button, #topActions button, #subNav button:not([data-hub-to])", (bs) => bs
  .filter((x) => !x.disabled && x.offsetParent !== null)
  .map((x, i) => ({ i, text: (x.textContent || x.title || x.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40),
    // already-selected tab / option: clicking it again rightly changes nothing
    current: x.classList.contains("on") || x.getAttribute("aria-pressed") === "true" || x.getAttribute("aria-selected") === "true",
    // a form with an empty required field: the browser shows its own "fill this in" message instead
    validates: !!x.form && x.type === "submit" && !x.form.checkValidity() })));

for (const view of VIEWS) {
  const first = await open(view);
  const buttons = await listButtons(first.p);
  if (first.errs.length) { fails.push(`${view}: page error on open — ${first.errs[0]}`); bad++; }
  await first.ctx.close();
  let dead = 0;
  for (const btn of buttons) {
    if (SKIP.test(btn.text) || btn.current || btn.validates) continue;
    const { ctx, p, errs } = await open(view);
    const handle = (await p.$$("#view button, #topActions button, #subNav button:not([data-hub-to])")).filter(Boolean);
    const visible = [];
    for (const h of handle) if (await h.evaluate((x) => !x.disabled && x.offsetParent !== null)) visible.push(h);
    const el = visible[btn.i];
    if (!el) { await ctx.close(); continue; }
    await p.evaluate(() => {
      window.__changed = 0;
      new MutationObserver((m) => (window.__changed += m.length)).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      const o = window.open; window.open = (...a) => { window.__changed++; return o.apply(window, a); };
    });
    let req = 0; p.on("request", () => req++); p.on("download", () => req++); p.on("filechooser", () => req++); ctx.on("page", () => req++);
    const hash = await p.evaluate(() => location.hash);
    await el.click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(1200);
    const changed = await p.evaluate(() => window.__changed).catch(() => 1);
    const moved = (await p.evaluate(() => location.hash).catch(() => hash)) !== hash;
    if (!changed && !req && !moved) { fails.push(`${view}: «${btn.text}» does nothing`); dead++; bad++; }
    if (errs.length) { fails.push(`${view}: «${btn.text}» → error: ${errs[0]}`); bad++; }
    await ctx.close();
  }
  console.log(`${dead ? "✗" : "✓"} ${view}: ${buttons.length} buttons${dead ? `, ${dead} do nothing` : ""}`);
}
await b.close();
for (const f of fails) console.log("  ✗ " + f);
console.log(bad ? `${bad} problem(s)` : "every dashboard button responds");
process.exit(bad ? 1 : 0);
