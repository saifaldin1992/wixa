// The uptime monitor (src/jobs/scheduled.js → runMonitor), with a fake database and fake email:
// one failed check sends nothing (a hiccup); a second failed check in a row sends one "problem" email;
// further failures send nothing more; the first good check after that sends one "back to normal" email.
// Usage: node tests/monitor.mjs   (no server needed)
// the server code imports JSON and Markdown the way the Cloudflare build does, so it is bundled first
const { build } = await import("esbuild");
const { writeFileSync, mkdtempSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const out = await build({ entryPoints: [new URL("../src/jobs/scheduled.js", import.meta.url).pathname], bundle: true, format: "esm", platform: "neutral", write: false, loader: { ".md": "text" }, logLevel: "silent" });
const file = `${mkdtempSync(`${tmpdir()}/wixa-mon-`)}/scheduled.mjs`;
writeFileSync(file, out.outputFiles[0].text);
const { runMonitor } = await import(file);

const kv = new Map([["config", JSON.stringify({ reports: { monitor: true } })]]);
const env = {
  SITE_ENV: "production", SUPABASE_URL: "https://db.test", SUPABASE_PUBLISHABLE_KEY: "k", RESEND_API_KEY: "re_test", NOTIFY_EMAIL: "owner@test",
  PRIVATE: { get: async (k, o) => { const v = kv.get(k) ?? null; return v && o?.type === "json" ? JSON.parse(v) : v; }, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => kv.delete(k) },
  ASSETS: { fetch: async () => new Response("ok") },
};
let dbUp = true;
const mails = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith("https://db.test")) return dbUp ? new Response("[]", { status: 200 }) : new Response("down", { status: 503 });
  if (url.startsWith("https://api.resend.com")) { mails.push(JSON.parse(init.body).subject); return new Response("{}", { status: 200 }); }
  return new Response("", { status: 404 });
};

let bad = 0;
const step = async (up, expectMails, label) => {
  dbUp = up; const before = mails.length;
  await runMonitor(env);
  const sent = mails.slice(before);
  const ok = sent.length === expectMails.length && sent.every((s, i) => s.includes(expectMails[i]));
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${sent.length ? sent.join(" | ") : "no email"} (state ${JSON.parse(kv.get("monitor")).state})`);
};
await step(true, [], "all good");
await step(false, [], "database fails once (a hiccup)");
await step(false, ["مشكلة"], "fails twice in a row → alert");
await step(false, [], "still down → no repeat");
await step(true, ["عاد"], "back up → recovery email");
await step(true, [], "still good");
process.exit(bad ? 1 : 0);
