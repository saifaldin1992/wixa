// Live chat for visitors, and web push notifications to the team.

import { adminSession, sessionUser } from "../lib/auth.js";
import { PHONE_RE, allowed, cleanText, clientIp, esc, hex, json, rpcToken, sha256hex } from "../lib/core.js";
import { mailBox, sendOwnerMail } from "../services/mail.js";
import { PUSH_HOSTS, pushTeam, vapidKeys, webPush } from "../services/push.js";
export { pushTeam };

export async function chatError(r) {
  const t = await r.text().catch(() => "");
  if (/PGRST202|Could not find the function/.test(t)) return json({ error: "migration_missing" }, 503);
  if (/not found/.test(t)) return json({ error: "gone" }, 404);
  console.error("chat rpc", r.status, t.slice(0, 200));
  return json({ error: "server" }, 502);
}

export async function handleChat(request, env, ctx, action) {
  const ip = clientIp(request);
  const limiter = action === "start" ? env.CONTACT_LIMITER : env.TRACK_LIMITER;
  if (!(await allowed(limiter, `chat-${action}:${ip}`))) return json({ error: "rate_limited" }, 429);
  let b = {};
  try { b = await request.json(); } catch {}
  const noStore = { "cache-control": "no-store" };

  if (action === "status") {
    const r = await rpcToken(env, "chat_status", {});
    return r.ok ? json(await r.json(), 200, noStore) : chatError(r);
  }
  if (action === "start") {
    const name = cleanText(b.name, 80), phone = cleanText(b.phone, 30), body = cleanText(b.body, 2000);
    if (!name || !body || !PHONE_RE.test(phone)) return json({ error: "invalid" }, 422);
    // at most 6 new chats a day from one address (a real visitor never needs more): stops a flood of fake chats and the
    // team notifications they would trigger. The address is kept only as a fingerprint, for one day.
    if (env.PRIVATE) {
      const dayKey = `chatday:${new Date().toISOString().slice(0, 10)}:${(await sha256hex(`${env.WRITE_TOKEN || ""}:${ip}`)).slice(0, 24)}`;
      const used = parseInt((await env.PRIVATE.get(dayKey).catch(() => null)) || "0", 10) || 0;
      if (used >= 6) return json({ error: "rate_limited" }, 429);
      ctx.waitUntil(env.PRIVATE.put(dayKey, String(used + 1), { expirationTtl: 86400 }).catch(() => {}));
    }
    const key = hex(crypto.getRandomValues(new Uint8Array(32)));
    const topic = cleanText(b.topic, 120);
    const r = await rpcToken(env, "chat_start", { p: { secret: await sha256hex(key), name, phone, body, topic, marketing: b.marketing === true, source: cleanText(b.source, 60), page: cleanText(b.page, 200) } });
    if (!r.ok) return chatError(r);
    const d = await r.json();
    ctx.waitUntil(notifyChat(env, request, { name, phone, body, topic, isNew: true, push: true, email: true }).catch((e) => console.error("chat notify", e)));
    return json({ id: d.id, key, online: d.online }, 200, noStore);
  }
  const id = cleanText(b.id, 40), key = cleanText(b.key, 64);
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(key)) return json({ error: "invalid" }, 422);
  const secret = await sha256hex(key);
  if (action === "send") {
    const body = cleanText(b.body, 2000);
    if (!body) return json({ error: "invalid" }, 422);
    const r = await rpcToken(env, "chat_send", { p: { id, secret, body } });
    if (!r.ok) return chatError(r);
    const d = await r.json();
    if (d.push || d.email) ctx.waitUntil(notifyChat(env, request, { name: d.name, phone: d.phone, topic: d.topic, body, push: d.push, email: d.email }).catch((e) => console.error("chat notify", e)));
    return json({ id: d.id, online: d.online }, 200, noStore);
  }
  // poll
  const r = await rpcToken(env, "chat_poll", { p: { id, secret, after: Math.max(0, parseInt(b.after, 10) || 0), seen: !!b.seen, typing: !!b.typing } });
  return r.ok ? json(await r.json(), 200, noStore) : chatError(r);
}

export async function notifyChat(env, request, m) {
  const origin = new URL(request.url).origin;
  const jobs = [];
  if (m.push) jobs.push(pushTeam(env, "chat", String(m.name || "").trim().split(/\s+/)[0]));
  if (m.email) jobs.push(sendOwnerMail(env, m.isNew ? `محادثة جديدة في الموقع — ${m.name}` : `رسالة جديدة في الدردشة — ${m.name}`,
    mailBox(m.isNew ? "محادثة جديدة في الموقع" : "رسالة جديدة في الدردشة", `<p><b>${esc(m.name)}</b> · <span dir="ltr">${esc(m.phone)}</span>${m.topic ? `<br>الموضوع: <b>${esc(m.topic)}</b>` : ""}</p>
      <p style="background:#F3EEFB;padding:12px 14px;border-radius:12px;white-space:pre-wrap">${esc(m.body)}</p>
      <p>الزبون ينتظر ردك في نافذة الدردشة على الموقع.</p>
      <p><a href="${origin}/admin/#chats" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 22px;border-radius:99px;text-decoration:none">الرد من لوحة التحكم</a></p>`)));
  await Promise.allSettled(jobs);
}
// GET /api/push/last?endpoint=… — what the latest push was about. Only a device subscribed to the team's pushes gets an
// answer (its push address is the proof, it is never shown anywhere else); nothing else about the customer comes back.
export async function handlePushLast(request, env, url) {
  const endpoint = (url.searchParams.get("endpoint") || "").slice(0, 1000);
  const none = json({ kind: "chat" }, 200, { "cache-control": "no-store" });
  if (!env.PRIVATE || !endpoint) return none;
  const subs = (await env.PRIVATE.get("push_subs", { type: "json" })) || [];
  if (!subs.some((x) => x.endpoint === endpoint)) return none;
  const last = await env.PRIVATE.get("push_last", { type: "json" });
  return json(last && Date.now() - last.at < 10 * 60e3 ? { kind: last.kind, label: last.label } : { kind: "chat" }, 200, { "cache-control": "no-store" });
}
export async function handleAdminPush(request, env) {
  const s = await adminSession(request, env, ["owner", "support"]);
  if (s.error) return s.error;
  if (!env.PRIVATE) return json({ error: "kv_missing" }, 503);
  if (request.method === "GET") return json({ key: (await vapidKeys(env)).pub }, 200, { "cache-control": "no-store" });
  let b = {};
  try { b = await request.json(); } catch {}
  const endpoint = String(b.endpoint || "");
  let host = "";
  try { host = new URL(endpoint).hostname; } catch {}
  if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !PUSH_HOSTS.test(host)) return json({ error: "invalid" }, 422);
  let subs = ((await env.PRIVATE.get("push_subs", { type: "json" })) || []).filter((x) => x.endpoint !== endpoint);
  if (request.method === "POST") {
    const me = await sessionUser(request, env);
    subs = [...subs, { endpoint, user: me?.email || "", at: new Date().toISOString() }].slice(-30);
  }
  await env.PRIVATE.put("push_subs", JSON.stringify(subs));
  const status = request.method === "POST" && b.test ? await webPush(env, endpoint).catch(() => 0) : null;
  return json({ ok: true, devices: subs.length, test: status });
}
export async function handleChatRate(request, env) {
  if (!(await allowed(env.TRACK_LIMITER, `chat-rate:${clientIp(request)}`))) return json({ error: "rate_limited" }, 429);
  let b = {};
  try { b = await request.json(); } catch {}
  const id = cleanText(b.id, 40), key = cleanText(b.key, 64), rating = parseInt(b.rating, 10);
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(key) || !(rating >= 1 && rating <= 5)) return json({ error: "invalid" }, 422);
  const note = cleanText(b.note, 500);
  const r = await rpcToken(env, "chat_rate", { p: { id, secret: await sha256hex(key), rating, note } });
  if (!r.ok) return chatError(r);
  // a happy customer who agreed to share their words: it lands in "client reviews" hidden until the owner publishes it
  if (b.publish === true && rating >= 4 && note.length >= 10) {
    const t = await rpcToken(env, "submit_testimonial", { p: { name: cleanText(b.name, 120) || (b.lang === "en" ? "Customer" : "عميل"), role: "", quote: note, rating, lang: b.lang === "en" ? "en" : "ar" } });
    if (!t.ok) console.error("chat review", t.status, await t.text());
  }
  return json({ ok: true });
}
