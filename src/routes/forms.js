// Public forms and endpoints: project orders, order tracking, contact, booking, review, visit events, unsubscribe.

import { EMAIL_RE, SECURITY_HEADERS, allowed, baghdadNow, clientIp, dayKey, esc, hex, json, newOrderNumber, pickLang, rpc, rpcToken, safeHref, sameText, sb, toHM, toMin, turnstileOk } from "../lib/core.js";
import { simplePage } from "./pages.js";
import { getConfig, getSiteData } from "../services/data.js";
import { mailBox, notifyOwner, requestOffer, sendAutoReply, sendOwnerMail, sendRequestConfirmation } from "../services/mail.js";

// POST /api/order — the one order page (/order): whatever the visitor picked (a package, a field, the estimator,
// a project like one of ours, a service) + name and phone. Gets a number, the gifts/discount from the dashboard,
// lands in the dashboard's Orders, alerts the team and emails the client a copy when they gave an email.
export const ORDER_SOURCES = new Set(["package", "field", "calc", "similar", "service", "start"]);
export async function handleOrder(request, env, ctx) {
  const ip = clientIp(request);
  if (!(await allowed(env.CONTACT_LIMITER, ip))) return json({ error: "rate_limited" }, 429);
  let b;
  try { b = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (b.website) return json({ ok: true, number: "" }); // honeypot
  const cfg = await getConfig(env);
  if (cfg.spam.turnstile && !(await turnstileOk(env, b.turnstile, ip))) return json({ error: "captcha" }, 403);
  const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
  const lang = b.lang === "en" ? "en" : "ar", ar = lang === "ar";
  const name = clean(b.name, 120), phone = clean(b.phone, 40), email = clean(b.email, 200), note = typeof b.note === "string" ? b.note.trim().slice(0, 3000) : "";
  if (!name || phone.replace(/\D/g, "").length < 7) return json({ error: "validation" }, 422);
  if (email && !EMAIL_RE.test(email)) return json({ error: "validation" }, 422);
  const source = ORDER_SOURCES.has(b.source) ? b.source : "start";
  const item = clean(b.item, 200), price = clean(b.price, 80);
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 15).map((x) => x.trim().slice(0, 80)).filter(Boolean) : []);
  const details = { features: list(b.details?.features), timeline: clean(b.details?.timeline, 60) };
  const blocked = cfg.spam.blocked.split(/[\n,،]/).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2);
  if (blocked.some((w) => `${name} ${email} ${phone} ${note}`.toLowerCase().includes(w))) return json({ ok: true, number: "" }, 201);

  const number = newOrderNumber();
  const offer = await requestOffer(env, ctx, lang);
  const until = (offer.discount.match(/\d{4}-\d{2}-\d{2}/) || [""])[0];
  const r = await rpc(env, "submit_order", { number, source, item, details, price_hint: price, name, phone, email, note, lang,
    marketing: b.marketing === true, visit_source: clean(b.visit, 60), gifts: offer.gifts, discount: offer.discount, discount_until: until });
  if (!r.ok) { console.error("order insert", r.status, await r.text()); return json({ error: r.status === 404 ? "migration_missing" : "storage" }, 502); }

  const SRC = { package: ["الباقة", "Package"], field: ["حل لمجال", "Solution for"], calc: ["تقدير الحاسبة", "Estimator"], similar: ["مشروع مشابه لـ", "Similar to"], service: ["الخدمة", "Service"], start: ["طلب مشروع", "Project request"] };
  const lines = [
    [ar ? "رقم الطلب" : "Order no.", number],
    [SRC[source][ar ? 0 : 1], item],
    [ar ? "السعر التقريبي" : "Price guide", price],
    [ar ? "الميزات" : "Features", details.features.join("، ")],
    [ar ? "المدة" : "Timeline", details.timeline],
    [ar ? "ملاحظة" : "Note", note],
    ...(offer.gifts.length ? [[ar ? "🎁 الهدايا" : "🎁 Gifts", offer.gifts.join(" + ")]] : []),
    ...(offer.discount ? [[ar ? "💸 الخصم" : "💸 Discount", offer.discount]] : []),
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  const row = { name, email, phone, lang, message: lines, services: [`${SRC[source][0]}: ${item || "-"}`], order: number, request_no: number, offer };
  ctx.waitUntil(notifyOwner(env, row).catch((e) => console.error("notify", e)));
  ctx.waitUntil(sendRequestConfirmation(env, cfg, row).catch((e) => console.error("order mail", e)));
  ctx.waitUntil(countMessage(env, { services: ["طلب مشروع"] }, false).catch(() => {}));
  return json({ ok: true, number }, 201);
}

// POST /api/order-status — "track your order": the order number + the phone it was placed with → its status and dates.
// Both must match; nothing personal comes back. Uses the stats limiter (30 a minute per IP) to stop guessing.
export async function handleTrack(request, env) {
  if (!(await allowed(env.TRACK_LIMITER, clientIp(request)))) return json({ error: "rate_limited" }, 429);
  let b;
  try { b = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const number = typeof b.number === "string" ? b.number.trim().slice(0, 40) : "", phone = typeof b.phone === "string" ? b.phone.slice(0, 40) : "";
  if (number.length < 6 || phone.replace(/\D/g, "").length < 7) return json({ error: "validation" }, 422);
  const r = await rpc(env, "track_order", { number, phone });
  if (!r.ok) { console.error("track", r.status, await r.text()); return json({ error: "storage" }, 502); }
  const order = await r.json();
  return order ? json({ ok: true, order }) : json({ error: "not_found" }, 404);
}

// POST /api/order-find — "I forgot my order number" (live chat): the phone the order was placed with + the name on it
// → up to 5 recent order numbers with their status. Both must match; the strict form limiter (5 a minute per IP).
export async function handleOrderFind(request, env) {
  if (!(await allowed(env.CONTACT_LIMITER, clientIp(request)))) return json({ error: "rate_limited" }, 429);
  let b;
  try { b = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const phone = typeof b.phone === "string" ? b.phone.slice(0, 40) : "", name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  if (phone.replace(/\D/g, "").length < 7 || name.length < 2) return json({ error: "validation" }, 422);
  const r = await rpc(env, "find_orders", { phone, name });
  if (!r.ok) { console.error("order find", r.status, await r.text()); return json({ error: "storage" }, 502); }
  return json({ ok: true, orders: await r.json() });
}

export async function handleContact(request, env, ctx) {
  const ip = clientIp(request);
  if (!(await allowed(env.CONTACT_LIMITER, ip))) return json({ error: "rate_limited" }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (body.website) return json({ ok: true }); // honeypot
  const cfg = await getConfig(env);
  if (cfg.spam.turnstile && !(await turnstileOk(env, body.turnstile, ip))) return json({ error: "captcha" }, 403);

  const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const isJob = body.kind === "job";
  const row = {
    name: clean(body.name, 120),
    email: clean(body.email, 200),
    phone: clean(body.phone, 40) || null,
    message: clean(body.message, 4000),
    services: Array.isArray(body.services) ? body.services.filter((s) => typeof s === "string").slice(0, 10).map((s) => s.slice(0, 80)) : [],
    lang: body.lang === "en" ? "en" : "ar",
    marketing: body.marketing === true, // agreed to receive offers (unticked by default)
    source: clean(body.source, 60), // where the visitor came from (Google, Instagram…)
  };
  if (body.kind === "booking" && !row.message) row.message = "حجز موعد";
  if (body.kind === "project" && !row.message) row.message = "-";
  if (!row.name || !row.message || (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))) return json({ error: "validation" }, 422); // email is optional
  if (!row.phone || row.phone.replace(/\D/g, "").length < 7) return json({ error: "phone_required" }, 422);
  if (body.kind === "booking") {
    const date = clean(body.date, 10), time = clean(body.time, 5);
    if (!(await reserveSlot(env, ctx, date, time))) return json({ error: "slot_taken" }, 409);
    const dayName = new Date(`${date}T00:00:00Z`).toLocaleDateString("ar-IQ", { weekday: "long", timeZone: "UTC" });
    row.services = [`حجز موعد: ${dayName} ${date} الساعة ${time}`];
    row.message = row.message || "حجز موعد";
  }
  // the smart project request: answers become a readable summary with a request number
  let reqNo = "";
  if (body.kind === "project") {
    const p = body.project && typeof body.project === "object" ? body.project : {};
    const ar = row.lang === "ar";
    reqNo = newOrderNumber();
    const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 12).map((x) => x.slice(0, 80)) : []);
    const lines = [
      [ar ? "رقم الطلب" : "Request no.", reqNo],
      [ar ? "نوع المشروع" : "Project type", clean(p.type, 80)],
      [ar ? "المجال" : "Field", clean(p.field, 80)],
      [ar ? "الميزات" : "Features", list(p.features).join("، ")],
      [ar ? "الميزانية" : "Budget", clean(p.budget, 60)],
      [ar ? "المدة" : "Timeline", clean(p.timeline, 60)],
      [ar ? "ملفات / أمثلة" : "Files / examples", safeHref(clean(p.link, 300))],
    ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
    const offer = await requestOffer(env, ctx, row.lang);
    row.offer = offer;
    if (offer.gifts.length) lines.push(`${ar ? "🎁 الهدايا" : "🎁 Gifts"}: ${offer.gifts.join(" + ")}`);
    if (offer.discount) lines.push(`${ar ? "💸 الخصم" : "💸 Discount"}: ${offer.discount}`);
    row.services = [`طلب مشروع ${reqNo}`, clean(p.type, 80)].filter(Boolean);
    row.message = `${lines.join("\n")}\n\n${row.message}`.slice(0, 4300);
    row.request_no = reqNo;
  }
  if (isJob) {
    const cv = safeHref(clean(body.cv, 300));
    row.services = [`طلب توظيف: ${clean(body.job, 120) || "تقديم عام"}`];
    row.message = `${row.message}${cv ? `\n\nالسيرة الذاتية / الأعمال: ${cv}` : ""}`.slice(0, 4300);
  }
  // words or addresses blocked in the dashboard: accepted quietly, never stored
  const blocked = cfg.spam.blocked.split(/[\n,،]/).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2);
  const hay = `${row.name} ${row.email} ${row.phone || ""} ${row.message}`.toLowerCase();
  if (blocked.some((w) => hay.includes(w))) return json({ ok: true }, 201);

  const { request_no: _no, offer: _offer, ...stored } = row;
  const res = await rpc(env, "submit_contact", stored);
  if (!res.ok) {
    console.error("contact insert failed", res.status, await res.text());
    return json({ error: "storage" }, 502);
  }
  ctx.waitUntil(notifyOwner(env, row).catch((e) => console.error("notify", e)));
  if (reqNo) ctx.waitUntil(sendRequestConfirmation(env, cfg, row).catch((e) => console.error("request mail", e)));
  else ctx.waitUntil(sendAutoReply(env, cfg, row).catch((e) => console.error("autoreply", e)));
  ctx.waitUntil(countMessage(env, row, isJob).catch((e) => console.error("count", e)));
  return json({ ok: true, ...(reqNo ? { number: reqNo } : {}) }, 201);
}
export async function countMessage(env, row, isJob) {
  if (!env.PRIVATE) return;
  const key = `count:${dayKey()}`;
  const c = (await env.PRIVATE.get(key, { type: "json" }).catch(() => null)) || { total: 0, jobs: 0, services: {} };
  c.total++;
  if (isJob) c.jobs++;
  else { const s = row.services?.[0] || "استشارة عامة"; c.services[s] = (c.services[s] || 0) + 1; }
  await env.PRIVATE.put(key, JSON.stringify(c), { expirationTtl: 60 * 864e2 });
}
export function bookingRules(st) {
  const b = st.booking || {};
  return { on: b.on === true, days: Array.isArray(b.days) ? b.days.map(Number) : [0, 1, 2, 3, 4], from: b.from || "10:00", to: b.to || "16:00", slot: Math.min(240, Math.max(15, Number(b.slot) || 30)), ahead: Math.min(60, Math.max(1, Number(b.days_ahead) || 14)) };
}
export function slotsFor(rules, date) {
  const now = baghdadNow(), today = now.toISOString().slice(0, 10);
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const diff = Math.round((d - new Date(`${today}T00:00:00Z`)) / 864e5);
  if (diff < 0 || diff > rules.ahead || !rules.days.includes(d.getUTCDay())) return [];
  const out = [], nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (let m = toMin(rules.from); m + rules.slot <= toMin(rules.to); m += rules.slot) if (diff > 0 || m > nowMin + 60) out.push(toHM(m));
  return out;
}
// GET /api/slots?date=YYYY-MM-DD → free times that day
export async function handleSlots(request, env, ctx, url) {
  let st = {};
  try { st = JSON.parse(await getSiteData(env, ctx)).settings || {}; } catch {}
  const rules = bookingRules(st);
  if (!rules.on) return json({ slots: [] });
  const date = url.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ slots: [] }); // only real dates reach storage
  const all = slotsFor(rules, date);
  const taken = env.PRIVATE ? ((await env.PRIVATE.get(`book:${date}`, { type: "json" }).catch(() => null)) || []) : [];
  return json({ slots: all.filter((t) => !taken.includes(t)) }, 200, { "cache-control": "no-store" });
}
export async function reserveSlot(env, ctx, date, time) {
  let st = {};
  try { st = JSON.parse(await getSiteData(env, ctx)).settings || {}; } catch {}
  const rules = bookingRules(st);
  if (!rules.on || !slotsFor(rules, date).includes(time) || !env.PRIVATE) return false;
  const key = `book:${date}`;
  const taken = (await env.PRIVATE.get(key, { type: "json" }).catch(() => null)) || [];
  if (taken.includes(time)) return false;
  taken.push(time);
  await env.PRIVATE.put(key, JSON.stringify(taken), { expirationTtl: 90 * 864e2 });
  return true;
}

export async function handleReview(request, env, ctx, url) {
  let st = {};
  try { st = JSON.parse(await getSiteData(env, ctx)).settings || {}; } catch {}
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const page = (body, status = 200) => simplePage(request, st, { lang, title: ar ? "رأيك يهمنا" : "Your feedback", description: "", path: "/review", body, status });
  const done = (msg) => page(`<h1>${ar ? "شكراً لك" : "Thank you"}</h1><p class="lead">${msg}</p>`);
  if (request.method === "POST") {
    if (!(await allowed(env.CONTACT_LIMITER, clientIp(request)))) return page(`<h1>${ar ? "حاول بعد قليل" : "Please try again shortly"}</h1>`, 429);
    const f = await request.formData().catch(() => null);
    if (!f || f.get("website")) return done(ar ? "وصل رأيك." : "We received your review.");
    const code = String(f.get("c") || "").slice(0, 32);
    const link = code && env.PRIVATE ? await env.PRIVATE.get(`review:${code}`) : null;
    if (!link) return page(`<h1>${ar ? "الرابط غير صالح" : "This link is not valid"}</h1><p class="lead">${ar ? "ربما استُخدم من قبل أو انتهت صلاحيته." : "It may have been used already or expired."}</p>`, 410);
    const name = String(f.get("name") || "").trim().slice(0, 120), quote = String(f.get("quote") || "").trim().slice(0, 1500);
    if (!name || !quote) return page(`<h1>${ar ? "يرجى كتابة اسمك ورأيك" : "Please enter your name and review"}</h1><p><a href="/review?c=${esc(code)}&lang=${lang}">${ar ? "رجوع" : "Back"}</a></p>`, 422);
    const p = { name, role: String(f.get("role") || "").trim().slice(0, 120), quote, rating: Math.min(5, Math.max(1, Number(f.get("rating")) || 5)), lang };
    const r = await sb(env, "rpc/submit_testimonial", { method: "POST", body: JSON.stringify({ token: env.WRITE_TOKEN || "", p }) });
    if (!r.ok) { console.error("review", r.status, await r.text()); return page(`<h1>${ar ? "تعذّر الإرسال" : "Couldn't send"}</h1><p class="lead">${ar ? "حاول مرة أخرى لاحقاً." : "Please try again later."}</p>`, 502); }
    await env.PRIVATE.delete(`review:${code}`);
    ctx.waitUntil(sendOwnerMail(env, `رأي جديد من ${name}`, mailBox("رأي عميل جديد بانتظار موافقتك", `<p><b>${esc(name)}</b>${p.role ? ` — ${esc(p.role)}` : ""}</p><p style="color:#D9A441;font-size:20px">${"★".repeat(p.rating)}</p><div style="padding:14px;background:#F8EEF1;border-radius:12px;white-space:pre-wrap">${esc(quote)}</div><p>الرأي مخفي حتى تنشره من لوحة التحكم ← آراء العملاء.</p>`)).catch(() => {}));
    return done(ar ? "وصل رأيك، ونقدّر وقتك وثقتك بنا." : "We've received your review. We appreciate your time and trust.");
  }
  const code = (url.searchParams.get("c") || "").slice(0, 32);
  const link = code && env.PRIVATE ? await env.PRIVATE.get(`review:${code}`, { type: "json" }) : null;
  if (!link) return page(`<h1>${ar ? "الرابط غير صالح" : "This link is not valid"}</h1><p class="lead">${ar ? "ربما استُخدم من قبل أو انتهت صلاحيته. تواصل معنا لنرسل لك رابطاً جديداً." : "It may have been used already or expired. Contact us for a new one."}</p>`, 410);
  const stars = [5, 4, 3, 2, 1].map((n) => `<label class="star"><input type="radio" name="rating" value="${n}" ${n === 5 ? "checked" : ""}><span>${"★".repeat(n)}</span></label>`).join("");
  return page(`<h1>${ar ? "رأيك يهمنا" : "We'd love your feedback"}</h1><p class="lead">${ar ? "شكراً لثقتك بويكسا. اكتب رأيك في تجربتك معنا، وقد نعرضه في موقعنا بعد موافقتك." : "Thank you for trusting WIXA. Tell us about your experience; we may show it on our site."}</p>
    <form class="rv" method="post" action="/review?lang=${lang}">
      <input type="hidden" name="c" value="${esc(code)}"><input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label>${ar ? "اسمك" : "Your name"} *<input name="name" required maxlength="120" value="${esc(link.name || "")}"></label>
      <label>${ar ? "منصبك أو اسم شركتك" : "Your role or company"}<input name="role" maxlength="120"></label>
      <fieldset><legend>${ar ? "تقييمك" : "Your rating"}</legend><div class="stars">${stars}</div></fieldset>
      <label>${ar ? "رأيك" : "Your review"} *<textarea name="quote" required maxlength="1500" rows="5"></textarea></label>
      <button class="btn" type="submit">${ar ? "إرسال" : "Send"}</button>
    </form>`);
}

// ---------------------------------------------------------------- visitor actions (calculator, WhatsApp, forms…)
// Counted per day in the private store. Each visit sends one small batch; counts are merged in memory and saved
// at most every 30 s per instance, so busy days stay far below the store's write limits.
export const EVENTS = ["calc_used", "calc_quote", "calc_wa", "calc_pdf", "wa_click", "form_open", "form_sent", "booking_open", "booking_sent", "job_open", "faq_open"];
export let evBuf = { day: "", counts: {}, at: 0 };
// The counts go to the database as one atomic "add n" per event (public.events_add), so two server instances
// flushing at the same moment never overwrite each other. Only if the database can't be reached are they kept in KV
// (the old way; the funnel adds both, and days before the switch are still read from KV).
export async function flushEvents(env) {
  if (!Object.keys(evBuf.counts).length) return;
  const { day, counts } = evBuf;
  evBuf = { day: dayKey(), counts: {}, at: Date.now() };
  const r = await rpcToken(env, "events_add", { p: { day, counts } }).catch(() => null);
  if (r?.ok) return;
  if (!env.PRIVATE) return;
  const key = `ev:${day}`;
  const cur = (await env.PRIVATE.get(key, { type: "json" }).catch(() => null)) || {};
  for (const [k, v] of Object.entries(counts)) cur[k] = (cur[k] || 0) + v;
  await env.PRIVATE.put(key, JSON.stringify(cur), { expirationTtl: 120 * 864e2 });
}
export async function handleEvent(request, env, ctx) {
  if (!(await allowed(env.TRACK_LIMITER, clientIp(request)))) return new Response(null, { status: 204 });
  let b = {};
  try { b = JSON.parse(await request.text()); } catch {}
  const list = Array.isArray(b.e) ? b.e.slice(0, 30) : [];
  const day = dayKey();
  if (evBuf.day && evBuf.day !== day) ctx.waitUntil(flushEvents(env));
  if (!evBuf.day) evBuf.day = day;
  for (const e of new Set(list)) if (EVENTS.includes(e)) evBuf.counts[e] = (evBuf.counts[e] || 0) + 1;
  if (Date.now() - evBuf.at > 30_000) { evBuf.at = Date.now(); ctx.waitUntil(flushEvents(env).catch((e) => console.error("events", e))); }
  return new Response(null, { status: 204 });
}
export async function unsubSig(env, email) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(`unsub:${env.WRITE_TOKEN || ""}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(email.toLowerCase()))).slice(0, 32);
}
export async function handleUnsubscribe(request, env, url) {
  const email = String(url.searchParams.get("e") || "").trim().toLowerCase().slice(0, 200), sig = url.searchParams.get("s") || "";
  const ok = EMAIL_RE.test(email) && sameText(sig, await unsubSig(env, email));
  let done = false;
  if (ok) { const r = await rpcToken(env, "campaign_optout", { email }); done = r.ok; }
  const msg = done ? ["تم إلغاء اشتراكك", "لن تصلك رسائل العروض من ويكسا بعد الآن. إذا كان هذا خطأً راسلنا وسنعيد اشتراكك."]
    : ok ? ["تعذّر الإلغاء الآن", "حدث خطأ مؤقت، حاول بعد دقائق أو راسلنا وسنلغيه لك."] : ["الرابط غير صالح", "تأكد أنك فتحت الرابط كاملاً من البريد."];
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${msg[0]} — WIXA</title><link rel="stylesheet" href="/fonts/noto-sans-arabic.css">
    <style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"Noto Sans Arabic",system-ui,Tahoma,sans-serif;background:#F5F5F7;color:#1A1424}main{max-width:440px;margin:16px;background:#fff;border-radius:20px;padding:32px;text-align:center;box-shadow:0 20px 60px -30px rgba(91,33,182,.4)}h1{font-size:22px;margin:0 0 10px;color:#5B21B6}p{line-height:1.9;color:#5E5670;margin:0 0 18px}a{color:#5B21B6;font-weight:700}</style></head>
    <body><main><h1>${msg[0]}</h1><p>${msg[1]}</p><a href="/">العودة إلى الموقع</a></main></body></html>`, { status: ok ? 200 : 400, headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
