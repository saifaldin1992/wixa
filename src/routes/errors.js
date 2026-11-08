// Error log: browser and server errors kept in KV for the dashboard's diagnostics page.

import { adminSession } from "../lib/auth.js";
import { allowed, clientIp, json } from "../lib/core.js";

// ---------------------------------------------------------------- error log (site + server)
// The last 50 problems, kept in the private store: errors in visitors' browsers (sent by the page) and on the server.
// Repeats of the same error are counted instead of stored again. Written at most every 30 s per instance.
export let errBuf = { list: [], at: 0 };
export const errKey = (e) => `${e.where}|${e.msg}|${e.src || ""}`.slice(0, 300);
export async function flushErrors(env) {
  if (!env.PRIVATE || !errBuf.list.length) return;
  const add = errBuf.list; errBuf = { list: [], at: Date.now() };
  const cur = (await env.PRIVATE.get("errors", { type: "json" }).catch(() => null)) || [];
  for (const e of add) {
    const old = cur.find((x) => errKey(x) === errKey(e));
    if (old) { old.count = (old.count || 1) + (e.count || 1); old.last = e.last; old.path = e.path || old.path; }
    else cur.unshift(e);
  }
  cur.sort((a, b) => String(b.last).localeCompare(String(a.last)));
  await env.PRIVATE.put("errors", JSON.stringify(cur.slice(0, 50)));
}
export function recordError(env, ctx, e) {
  const item = { where: e.where, msg: String(e.msg || "").slice(0, 300), src: String(e.src || "").slice(0, 200), path: String(e.path || "").slice(0, 200), ua: String(e.ua || "").slice(0, 160), first: new Date().toISOString(), last: new Date().toISOString(), count: 1 };
  const same = errBuf.list.find((x) => errKey(x) === errKey(item));
  if (same) { same.count++; same.last = item.last; } else if (errBuf.list.length < 30) errBuf.list.push(item);
  if (Date.now() - errBuf.at > 30_000) { errBuf.at = Date.now(); ctx.waitUntil(flushErrors(env).catch(() => {})); }
}
// POST /api/client-error — a visitor's browser reports a script error
export async function handleClientError(request, env, ctx) {
  if (!(await allowed(env.TRACK_LIMITER, clientIp(request)))) return new Response(null, { status: 204 });
  let b = {};
  try { b = JSON.parse(await request.text()); } catch {}
  if (!b.msg) return new Response(null, { status: 204 });
  // only errors from this site's own scripts (browser extensions and in-app browsers add their own noise)
  const origin = new URL(request.url).origin;
  if (b.src && !String(b.src).startsWith(origin)) return new Response(null, { status: 204 });
  recordError(env, ctx, { where: b.where === "admin" ? "admin" : "site", msg: b.msg, src: `${String(b.src || "").replace(origin, "")}${b.line ? `:${b.line}` : ""}`, path: b.path, ua: request.headers.get("user-agent") });
  return new Response(null, { status: 204 });
}
// GET / DELETE /api/admin/errors
export async function handleAdminErrors(request, env) {
  const { error } = await adminSession(request, env, ["owner"]);
  if (error) return error;
  if (!env.PRIVATE) return json([]);
  if (request.method === "DELETE") { await env.PRIVATE.delete("errors"); errBuf = { list: [], at: 0 }; return json({ ok: true }); }
  const saved = (await env.PRIVATE.get("errors", { type: "json" }).catch(() => null)) || [];
  return json([...errBuf.list, ...saved].slice(0, 60), 200, { "cache-control": "no-store" });
}
