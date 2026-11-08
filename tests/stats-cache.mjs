// The dashboard's visitor numbers never wait for Cloudflare once a copy exists (src/services/stats.js):
//  1. the very first time, the numbers are fetched (and saved to the edge cache and KV);
//  2. while fresh, the saved copy is returned without asking Cloudflare;
//  3. when old, the saved copy is returned at once and a refresh runs in the background;
//  4. a new location with an empty edge cache uses the KV copy at once.
// Cloudflare is simulated (1.5 s per answer). Usage: node tests/stats-cache.mjs
const SLOW = 1500;
let asked = 0;
const fakeCloudflare = { data: { viewer: { accounts: [{ byDay: [], today: [{ count: 3, sum: { visits: 2 } }], total90: [{ count: 9 }] }] } } };
globalThis.fetch = async (url) => {
  if (!String(url).includes("api.cloudflare.com/client/v4/graphql")) throw new Error("unexpected " + url);
  asked++;
  await new Promise((r) => setTimeout(r, SLOW));
  return new Response(JSON.stringify(fakeCloudflare), { headers: { "content-type": "application/json" } });
};
const edge = new Map();
globalThis.caches = { default: {
  match: async (req) => { const r = edge.get(req.url); return r ? r.clone() : undefined; },
  put: async (req, res) => { edge.set(req.url, res.clone()); },
} };
const kv = new Map();
const env = { SITE_ENV: "staging", CF_ANALYTICS_TOKEN: "t", CF_ACCOUNT_ID: "a", CF_SITE_TAG: "s",
  PRIVATE: { get: async (k, o) => (kv.has(k) ? (o?.type === "json" ? JSON.parse(kv.get(k)) : kv.get(k)) : null), put: async (k, v) => { kv.set(k, v); } } };
const pending = [];
const ctx = { waitUntil: (p) => pending.push(p) };
const settle = async () => { while (pending.length) await pending.shift(); };

const { cachedStats } = await import("../src/services/stats.js");
const timed = async () => { const t = Date.now(); const d = await cachedStats(env, ctx, 30); return [Date.now() - t, d]; };
let bad = 0;
const check = (ok, name, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`); if (!ok) bad++; };

let [ms, d] = await timed(); await settle();
check(d?.today_views === 3 && asked === 1 && ms >= SLOW - 50, "first time: asks Cloudflare once and waits for it", `${ms}ms`);
check(kv.has("stats:30"), "the numbers are saved for every location (KV)");

[ms, d] = await timed(); await settle();
check(d?.today_views === 3 && asked === 1 && ms < 100, "fresh copy: answered at once, Cloudflare not asked", `${ms}ms`);

// make every saved copy 10 minutes old
const old = Date.now() - 10 * 60e3;
for (const [k, r] of edge) { const body = await r.text(); edge.set(k, new Response(body, { headers: { "x-saved-at": String(old) } })); }
[ms, d] = await timed();
check(d?.today_views === 3 && ms < 100, "old copy: shown at once (no wait)", `${ms}ms`);
await settle();
check(asked === 2, "…and refreshed in the background");

edge.clear(); // a new Cloudflare location: nothing in its edge cache
[ms, d] = await timed(); await settle();
check(d?.today_views === 3 && asked === 2 && ms < 100, "new location: uses the KV copy at once", `${ms}ms`);

console.log(bad ? `${bad} check(s) failed` : "stats cache: all checks passed");
process.exit(bad ? 1 : 0);
