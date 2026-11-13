// Web Push to the team's devices (the dashboard's notifications). Keys (VAPID) are made once and kept in KV;
// the devices that turned notifications on are kept in KV too (push_subs). Used by the chat, the forms and the
// scheduled jobs (booking reminders), so it lives here, below the routes.
import { b64u } from "../lib/core.js";

export const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
export async function vapidKeys(env) {
  let v = await env.PRIVATE.get("vapid", { type: "json" });
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    v = { pub: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), jwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
    await env.PRIVATE.put("vapid", JSON.stringify(v));
  }
  return v;
}
export async function webPush(env, endpoint) {
  const v = await vapidKeys(env);
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:info@wixa.dev" })}`;
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  const r = await fetch(endpoint, { method: "POST", headers: { authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${v.pub}`, ttl: "3600", urgency: "high", "content-length": "0" } });
  return r.status;
}
// A push carries no text (no encryption needed); the device then asks /api/push/last what it was about.
// kind: chat | order | message | booking | job | reminder; label: a short line (a first name, a time) shown to the team.
export async function pushTeam(env, kind = "chat", label = "") {
  if (!env.PRIVATE) return;
  const subs = (await env.PRIVATE.get("push_subs", { type: "json" })) || [];
  if (!subs.length) return;
  await env.PRIVATE.put("push_last", JSON.stringify({ kind, label: String(label).slice(0, 80), at: Date.now() }), { expirationTtl: 86400 });
  const res = await Promise.all(subs.map((x) => webPush(env, x.endpoint).catch(() => 0)));
  const keep = subs.filter((x, i) => res[i] !== 404 && res[i] !== 410); // the device unsubscribed
  if (keep.length !== subs.length) await env.PRIVATE.put("push_subs", JSON.stringify(keep));
}
