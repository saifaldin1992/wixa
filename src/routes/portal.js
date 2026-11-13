// «بوابة العميل» (/portal): a customer signs in with an order number + the phone it was placed with and sees every
// order placed with that phone — its stage and the updates the team shared — and can talk to us in the live chat.
// The sign-in is a token signed here (HMAC, key kept in KV), valid 30 days, holding only the phone's last 10 digits.
// Also here: what happens when the team marks an order done or shares an update (review request, email to the customer).
import { adminSession } from "../lib/auth.js";
import { allowed, b64u, clientIp, json, pickLang, rpc } from "../lib/core.js";
import { getSiteData } from "../services/data.js";
import { sendCustomerMail } from "../services/mail.js";
import { audit } from "../services/audit.js";
import { simplePage } from "./pages.js";

const DAYS = 30;
const enc = new TextEncoder();
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function portalKey(env) {
  let raw = await env.PRIVATE.get("portal_key");
  if (!raw) { raw = b64u(crypto.getRandomValues(new Uint8Array(32))); await env.PRIVATE.put("portal_key", raw); }
  return crypto.subtle.importKey("raw", fromB64u(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signToken(env, data) {
  const body = b64u(enc.encode(JSON.stringify(data)));
  const sig = await crypto.subtle.sign("HMAC", await portalKey(env), enc.encode(body));
  return `${body}.${b64u(new Uint8Array(sig))}`;
}
export async function readToken(env, token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !env.PRIVATE) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await portalKey(env), fromB64u(sig), enc.encode(body)))) return null;
    const d = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    return d.exp > Date.now() && /^\d{9,10}$/.test(d.ph) ? d : null;
  } catch { return null; }
}

// POST /api/portal/login {number, phone} → {token, name}
export async function handlePortalLogin(request, env) {
  if (!(await allowed(env.CONTACT_LIMITER, clientIp(request)))) return json({ error: "rate_limited" }, 429);
  if (!env.PRIVATE) return json({ error: "storage" }, 503);
  let b = {};
  try { b = await request.json(); } catch {}
  const number = typeof b.number === "string" ? b.number.trim().slice(0, 40) : "", phone = typeof b.phone === "string" ? b.phone.slice(0, 40) : "";
  if (number.length < 6 || phone.replace(/\D/g, "").length < 9) return json({ error: "validation" }, 422);
  const r = await rpc(env, "portal_login", { number, phone });
  if (!r.ok) { console.error("portal login", r.status, await r.text()); return json({ error: r.status === 404 ? "migration_missing" : "storage" }, 502); }
  const who = await r.json();
  if (!who) return json({ error: "not_found" }, 404);
  const token = await signToken(env, { ph: who.phone, exp: Date.now() + DAYS * 864e5 });
  return json({ ok: true, token, name: who.name || "" }, 200, { "cache-control": "no-store" });
}

// POST /api/portal {token} → {orders: [...]}
export async function handlePortalData(request, env) {
  if (!(await allowed(env.TRACK_LIMITER, clientIp(request)))) return json({ error: "rate_limited" }, 429);
  let b = {};
  try { b = await request.json(); } catch {}
  const t = await readToken(env, b.token);
  if (!t) return json({ error: "signed_out" }, 401);
  const r = await rpc(env, "portal_orders", { phone: t.ph });
  if (!r.ok) { console.error("portal", r.status, await r.text()); return json({ error: "storage" }, 502); }
  return json({ ok: true, orders: await r.json() }, 200, { "cache-control": "no-store" });
}

// GET /portal — the page; the list itself is drawn by /build/portal.js
export async function handlePortalPage(request, env, ctx) {
  let st = {};
  try { st = JSON.parse(await getSiteData(env, ctx)).settings || {}; } catch {}
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const body = `<h1>${ar ? "بوابة العملاء" : "Client portal"}</h1>
    <p class="lead">${ar ? "تابع كل طلباتك ومراحل مشروعك وما يشاركه فريقنا معك، في مكان واحد." : "Follow all your orders, your project's stages and what our team shares with you — in one place."}</p>
    <div id="portal" class="portal" data-lang="${lang}"><p class="empty">${ar ? "جارٍ التحميل…" : "Loading…"}</p></div>
    <noscript><p class="empty">${ar ? "تحتاج البوابة إلى تفعيل JavaScript." : "The portal needs JavaScript."}</p></noscript>`;
  return simplePage(request, st, { lang, title: ar ? "بوابة العملاء" : "Client portal", description: ar ? "تابع طلباتك ومشاريعك مع ويكسا." : "Follow your orders and projects with WIXA.",
    path: "/portal", body, ending: false, scripts: ["/build/portal.js"], noindex: true });
}

// POST /api/admin/order-notify {id, kind: "done" | "update", update?} — after the team marks an order done or shares
// an update: a review link (done) and, when the customer left an email, a short email. Answers what was sent and
// the links, so the team can also pass them on by hand (copy).
export async function handleAdminOrderNotify(request, env) {
  const s = await adminSession(request, env, ["owner", "support"]);
  if (s.error) return s.error;
  let b = {};
  try { b = await request.json(); } catch {}
  const id = parseInt(b.id, 10), kind = b.kind === "done" ? "done" : "update";
  if (!id) return json({ error: "validation" }, 422);
  const r = await s.asUser(`orders?id=eq.${id}&select=id,number,name,email,lang,item,status`);
  const o = r.ok ? (await r.json())[0] : null;
  if (!o) return json({ error: "not_found" }, 404);
  const origin = new URL(request.url).origin, ar = o.lang !== "en", first = String(o.name || "").trim().split(/\s+/)[0] || "";
  const portal = `${origin}/portal${ar ? "" : "?lang=en"}`;
  let review = "";
  if (kind === "done" && env.PRIVATE) {
    // one link per order: marking it done again does not send a second request
    const sent = await env.PRIVATE.get(`review-order:${o.id}`);
    if (sent) review = sent;
    else {
      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await env.PRIVATE.put(`review:${code}`, JSON.stringify({ name: o.name || "", order: o.number, at: new Date().toISOString() }), { expirationTtl: 60 * 864e2 });
      review = `${origin}/review?c=${code}${ar ? "" : "&lang=en"}`;
      await env.PRIVATE.put(`review-order:${o.id}`, review, { expirationTtl: 60 * 864e2 });
    }
  }
  let mailed = false;
  if (o.email && !(kind === "done" && b.resend === false)) {
    mailed = kind === "done"
      ? await sendCustomerMail(env, { to: o.email, lang: o.lang, subject: ar ? `تم تسليم مشروعك — ${o.number}` : `Your project is delivered — ${o.number}`,
        title: ar ? "شكراً لثقتك بنا" : "Thank you for trusting us",
        lines: ar ? [`أهلاً ${first}،`, `يسعدنا إبلاغك أن طلبك رقم ${o.number}${o.item ? ` (${o.item})` : ""} تم تسليمه.`, "رأيك يساعدنا ويساعد غيرك على اختيارنا. هل تكتب لنا رأيك في دقيقة؟"]
          : [`Hi ${first},`, `Your order ${o.number}${o.item ? ` (${o.item})` : ""} has been delivered.`, "Your feedback helps us and helps others choose us. Would you share it in a minute?"],
        button: { href: review, label: ar ? "اكتب رأيك" : "Write your review" } })
      : await sendCustomerMail(env, { to: o.email, lang: o.lang, subject: ar ? `تحديث على طلبك — ${o.number}` : `An update on your order — ${o.number}`,
        title: ar ? "تحديث على طلبك" : "An update on your order",
        lines: [ar ? `أهلاً ${first}،` : `Hi ${first},`, ...(b.update ? [String(b.update).slice(0, 1500)] : []), ar ? "تابع كل تفاصيل طلبك من بوابة العملاء." : "Follow everything about your order in the client portal."],
        button: { href: portal, label: ar ? "افتح بوابة العملاء" : "Open the client portal" } });
  }
  await audit(env, s, { area: "orders", action: kind === "done" ? "review_request" : "update_mail", target: o.number, summary: kind === "done" ? "طلب رأي بعد التسليم" : "تحديث للزبون" });
  return json({ ok: true, mailed, email: !!o.email, review, portal });
}
