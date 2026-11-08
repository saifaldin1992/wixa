// Dashboard start-up with a dropped connection: it must show "retry" (not hang, not sign out), and retry must open it.
// Usage: BASE=http://localhost:8787 node tests/admin-netfail.mjs
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const BASE = process.env.BASE || "http://localhost:8787";
import { readFileSync } from "node:fs";
let stub = readFileSync(new URL("./supabase-stub.js", import.meta.url), "utf8");
// the first start-up check fails like a phone that lost its connection; the second one works
stub = stub.replace('rpc: (name) => ok(', 'rpc: (name) => (name === "is_admin" && !(window.__tries = (window.__tries || 0) + 1, window.__tries > 1)) ? Promise.resolve({ data: null, error: { message: "TypeError: Failed to fetch", code: "" } }) : ok(');
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 13"] });
await ctx.route(/supabase-js/, (r) => r.fulfill({ body: stub, contentType: "application/javascript" }));
await ctx.route(/\/api\/admin\//, (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`${BASE}/admin/`, { waitUntil: "load" }); await p.waitForTimeout(1500);
const first = await p.evaluate(() => ({ netfail: !!document.getElementById("netFail"), text: document.getElementById("netFail")?.innerText.slice(0, 40), signedOut: !document.getElementById("auth").hidden, app: !document.getElementById("app").hidden }));
await p.click("#netFail button"); await p.waitForTimeout(1500);
const second = await p.evaluate(() => ({ netfail: !!document.getElementById("netFail"), app: !document.getElementById("app").hidden, title: document.querySelector(".top h1, #pageTitle")?.textContent }));
const ok = first.netfail && !first.signedOut && second.app && !second.netfail && !errs.length;
console.log(`${ok ? "✓" : "✗"} dashboard start-up without a connection shows retry, keeps the session, and retry opens it`, ok ? "" : JSON.stringify({ first, second, errs }));
await b.close();
process.exit(ok ? 0 : 1);
