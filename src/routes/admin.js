// Dashboard API: stats, settings, integrations, team, campaigns, bookings, review links.

import DEV_GUIDE from "../../docs/DEVELOPERS.md";
import { runBackup, runWeeklyReport } from "../jobs/scheduled.js";
import { adminSession, sessionUser } from "../lib/auth.js";
import { EMAIL_RE, ROLE_AR, SECURITY_HEADERS, allowed, cleanText, clientIp, dayKey, esc, fmtDate, json, newCode, newOrderNumber, rpc, rpcToken, sb, versionAssets } from "../lib/core.js";
import { evBuf, unsubSig } from "./forms.js";
import { cfgMemo, cleanConfig, getConfig, getSiteData, publishNow, saveConfig } from "../services/data.js";
import { mailBox, notifyAddress, notifyOwner, requestOffer, sendAutoReply, sendOwnerMail } from "../services/mail.js";
import { cachedStats } from "../services/stats.js";
import { audit } from "../services/audit.js";

// GET/PUT /api/admin/integrations — read or change the integrations (admins only)
export async function handleAdminIntegrations(request, env) {
  const s = await adminSession(request, env, request.method === "GET" ? undefined : ["owner"]);
  const { error, role } = s;
  if (error) return error;
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  cfgMemo.at = 0; // always read the stored copy here
  const cfg = await getConfig(env);
  if (request.method === "GET" && role !== "owner") return json({ templates: cfg.templates }, 200, { "cache-control": "no-store" }); // the team sees only the ready replies
  // the Wayl key: only "is there one" and its last 4 characters ever leave the server
  const keyInfo = async () => { const k = await env.PRIVATE.get("secret:wayl_key").catch(() => null); return { has_key: !!k, key_hint: k ? k.slice(-4) : "" }; };
  if (request.method === "GET") {
    const [last, events, key] = await Promise.all([env.PRIVATE.get("backup:last", { type: "json" }).catch(() => null), env.PRIVATE.get("pay:events", { type: "json" }).catch(() => null), keyInfo()]);
    return json({ ...cfg, backup_last: last, pay_events: events || [], wayl: key }, 200, { "cache-control": "no-store" });
  }
  let body = {};
  try { body = await request.json(); } catch {}
  if (typeof body.wayl_key === "string") {
    const k = body.wayl_key.trim();
    if (k && !/^[\x21-\x7e]{8,300}$/.test(k)) return json({ error: "bad_key" }, 422);
    if (k) await env.PRIVATE.put("secret:wayl_key", k); else await env.PRIVATE.delete("secret:wayl_key");
    await audit(env, s, { area: "integrations", action: k ? "update" : "delete", target: "مفتاح Wayl", summary: k ? "حفظ مفتاح بوابة الدفع" : "حذف مفتاح بوابة الدفع" });
    return json({ ...cfg, wayl: await keyInfo() }, 200, { "cache-control": "no-store" });
  }
  let next;
  try { next = cleanConfig(cfg, body); } catch (e) { return json({ error: e.message, field: e.field }, 422); }
  if (next.payments.on && !(await keyInfo()).has_key) return json({ error: "no_key" }, 422);
  await saveConfig(env, next);
  const changed = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cfg[k]));
  if (changed.length) await audit(env, s, { area: "integrations", action: "update", target: changed.join("، "), summary: "تعديل إعدادات التكاملات والتنبيهات والحماية" });
  return json({ ...next, wayl: await keyInfo() }, 200, { "cache-control": "no-store" });
}

// POST /api/pay/wayl/<token> — Wayl's notifications (order paid, refunded…). Accepted only while «Webhooks» is on and
// the address carries our secret token. Each one is kept (last 30) for the dashboard to show; nothing is changed
// automatically until the contract is signed and Wayl's message format is confirmed.
export async function handlePayWebhook(request, env, token) {
  if (!(await allowed(env.TRACK_LIMITER, clientIp(request)))) return json({ error: "rate_limited" }, 429);
  const cfg = await getConfig(env);
  const p = cfg.payments || {};
  if (!env.PRIVATE || !p.webhook_on || !p.webhook_token || token !== p.webhook_token) return json({ error: "not_found" }, 404);
  const raw = (await request.text()).slice(0, 32_000);
  let data = null;
  try { data = JSON.parse(raw); } catch {}
  const pick = (...ks) => { for (const k of ks) { const v = data?.[k] ?? data?.data?.[k]; if (v !== undefined && v !== null && typeof v !== "object") return String(v).slice(0, 80); } return ""; };
  const ev = { at: new Date().toISOString(), event: pick("event", "type", "status") || (data ? "json" : "text"), ref: pick("referenceId", "reference", "order_id", "orderId", "id"),
    amount: pick("total", "amount"), size: raw.length };
  const list = ((await env.PRIVATE.get("pay:events", { type: "json" }).catch(() => null)) || []).slice(0, 29);
  await env.PRIVATE.put("pay:events", JSON.stringify([ev, ...list]));
  return json({ ok: true });
}

// POST /api/admin/integrations/test — send a sample alert or auto-reply to the alerts address
export async function handleAdminTest(request, env) {
  const s = await adminSession(request, env, ["owner"]);
  if (s.error) return s.error;
  let body = {};
  try { body = await request.json(); } catch {}
  const to = await notifyAddress(env);
  if (!env.RESEND_API_KEY || !to) return json({ error: "email_not_configured" }, 503);
  const cfg = await getConfig(env);
  const sample = { name: "زائر تجريبي", email: to, phone: null, message: "هذه رسالة تجريبية من لوحة التحكم.", services: [], lang: body.lang === "en" ? "en" : "ar" };
  await audit(env, s, { area: "integrations", action: "send_test", target: String(body.kind || "alert").slice(0, 20), summary: `إرسال تجربة إلى ${to}` });
  if (body.kind === "backup") return (await runBackup(env, true)) ? json({ ok: true, to }) : json({ error: "send_failed" }, 502);
  const ok = body.kind === "weekly" ? await runWeeklyReport(env, true) : body.kind === "autoreply" ? await sendAutoReply(env, cfg, sample, true) : await notifyOwner(env, sample, true);
  return ok ? json({ ok: true, to }) : json({ error: "send_failed" }, 502);
}

// POST /api/admin/refresh — show the latest content on the site now
export async function handleAdminRefresh(request, env) {
  const s = await adminSession(request, env, ["owner", "editor"]);
  if (s.error) return s.error;
  try { await publishNow(env); } catch (e) { console.error("refresh", e); return json({ error: "refresh_failed" }, 502); }
  await audit(env, s, { area: "site", action: "publish", summary: "تحديث الموقع بآخر التعديلات" });
  return json({ ok: true });
}

// ---------------------------------------------------------------- GET /api/admin/stats
// Visitor numbers for the dashboard, read from Cloudflare Web Analytics.
// Counts only this environment's public pages: the dashboard itself (/admin) is excluded.
// Only signed-in admins (checked against Supabase with their own session) can read it;
// the Cloudflare token stays on the server.
// GET /admin/ — the dashboard page with its public config built in (saves a round trip on every open)
export async function handleAdminPage(request, env) {
  const page = await env.ASSETS.fetch(new Request(new URL("/admin/", request.url), request));
  const cfg = JSON.stringify({ env: env.SITE_ENV || "production", supabaseUrl: env.SUPABASE_URL, supabaseKey: env.SUPABASE_PUBLISHABLE_KEY }).replace(/</g, "\\u003c");
  const res = versionAssets(new HTMLRewriter()).on("head", { element: (el) => el.append(`<link rel="preconnect" href="${esc(env.SUPABASE_URL)}" crossorigin><script id="wixa-config" type="application/json">${cfg}</script>`, { html: true }) }).transform(page);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  headers.set("cache-control", "no-cache");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(res.body, { status: res.status, headers });
}

export async function handleAdminStats(request, env, url, ctx) {
  const session = await adminSession(request, env);
  if (session.error) return session.error;
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_SITE_TAG) return json({ error: "analytics_not_configured" }, 503);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10) || 30));
  // the numbers (saved copy, never a wait on Cloudflare) and the unread messages (the admin's own session) together
  const [data, msg] = await Promise.all([
    cachedStats(env, ctx, days),
    session.asUser("contact_messages?select=id&handled=eq.false", { method: "HEAD", headers: { prefer: "count=exact" } }).catch(() => null),
  ]);
  if (!data) return json({ error: "analytics_failed" }, 502);
  const messages_new = parseInt((msg?.headers.get("content-range") || "/0").split("/")[1], 10) || 0;
  return json({ ...data, messages_new }, 200, { "cache-control": "private, no-store" });
}

// ---------------------------------------------------------------- GET /api/admin/status
// Live check of everything the site is connected to, for the dashboard's "Connections" page.
export async function handleAdminStatus(request, env, ctx) {
  const { error } = await adminSession(request, env, ["owner"]);
  if (error) return error;
  const host = new URL(request.url).host;
  const staging = env.SITE_ENV === "staging";
  const acc = env.CF_ACCOUNT_ID;
  const timed = (p, ms = 6000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const code = (v) => `<code dir="ltr">${esc(v)}</code>`;
  const fmtDate = (t) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");

  const [ver, supa, resend, analytics] = await Promise.allSettled([
    timed(env.ASSETS.fetch(new Request(new URL("/build/version.json", request.url))).then((r) => (r.ok ? r.json() : null))),
    timed(Promise.all([
      fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } }).then((r) => r.ok),
      sb(env, "site_settings?select=updated_at&id=eq.1").then((r) => (r.ok ? r.json() : null)),
    ])),
    env.RESEND_API_KEY ? timed(fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` } }).then(async (r) => ({ status: r.status, body: r.ok ? await r.json() : null }))) : Promise.resolve(null),
    env.CF_ANALYTICS_TOKEN ? timed(fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST", headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ query: "query($a: String!) { viewer { accounts(filter: {accountTag: $a}) { accountTag } } }", variables: { a: acc } }),
    }).then((r) => r.json())) : Promise.resolve(null),
  ]);
  const v = ver.status === "fulfilled" ? ver.value : null;
  const site = JSON.parse(await getSiteData(env, ctx));
  const seo = site.settings?.seo || {};
  const items = [];

  items.push({ name: "النطاق", role: "عنوان موقعك على الإنترنت", state: "ok",
    rows: [["العنوان", code(host)], ["إدارة النطاق (DNS)", "Cloudflare"], ["الاتصال الآمن", "HTTPS مفعّل"], ["عناوين أخرى", staging ? code("wixa.dev") + " (الرئيسية)" : code("www.wixa.dev") + " · " + code("staging.wixa.dev") + " (تجريبية)"]],
    link: `https://dash.cloudflare.com/${acc}/wixa.dev/dns/records`, linkText: "إعدادات النطاق" });

  items.push({ name: "Cloudflare — الاستضافة", role: "يشغّل الموقع ويوزّعه من أقرب خادم للزائر", state: "ok",
    rows: [["الخدمة", `Workers · ${code(staging ? "wixa-staging" : "wixa")}`], ["آخر نشر", fmtDate(env.CF_VERSION?.timestamp)], ["رقم النسخة", env.CF_VERSION?.id ? code(env.CF_VERSION.id.slice(0, 8)) : "—"], ["حماية النموذج", env.TURNSTILE_SECRET ? "Turnstile مفعّل" : "غير مفعّلة"]],
    link: `https://dash.cloudflare.com/${acc}/workers/services/view/${staging ? "wixa-staging" : "wixa"}/production`, linkText: "لوحة Cloudflare" });

  items.push({ name: "GitHub — الكود", role: "يحفظ كود الموقع؛ كل تحديث يُنشر تلقائياً", state: v?.commit ? "ok" : "info",
    rows: [["المستودع", code("saifaldin1992/wixa")], ["الفرع", code(v?.branch || (staging ? "staging" : "main"))], ["آخر تحديث", v?.commit ? `${code(v.commit.slice(0, 7))} · ${esc(v.message || "")}` : "—"], ["وقت البناء", fmtDate(v?.built_at)]],
    link: v?.commit ? `https://github.com/saifaldin1992/wixa/commit/${v.commit}` : "https://github.com/saifaldin1992/wixa", linkText: "فتح على GitHub" });

  const sOk = supa.status === "fulfilled" && supa.value[0] && Array.isArray(supa.value[1]);
  const ref = (env.SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1] || "";
  items.push({ name: "Supabase — قاعدة البيانات", role: "المحتوى والرسائل وحساب الدخول", state: sOk ? "ok" : "err",
    rows: [["المشروع", code(ref)], ["الحالة", sOk ? "متصلة وتعمل" : "تعذّر الاتصال"], ["آخر حفظ للمحتوى", sOk ? fmtDate(supa.value[1][0]?.updated_at) : "—"]],
    link: `https://supabase.com/dashboard/project/${ref}`, linkText: "لوحة Supabase" });

  let rState = "err", rRows = [["المفتاح", "غير مضاف"]];
  if (env.RESEND_API_KEY && resend.status === "fulfilled" && resend.value) {
    const { status, body } = resend.value;
    const dom = body?.data?.find?.((x) => x.name === "wixa.dev");
    if (dom) { rState = dom.status === "verified" ? "ok" : "warn"; rRows = [["النطاق", `${code("wixa.dev")} · ${dom.status === "verified" ? "موثّق" : esc(dom.status)}`]]; }
    else if (status === 401 || status === 403) { rState = "ok"; rRows = [["المفتاح", "مفتاح إرسال فقط (آمن)"]]; }
    else { rState = "warn"; rRows = [["الحالة", `رد غير متوقع (${status})`]]; }
  } else if (env.RESEND_API_KEY) { rState = "warn"; rRows = [["الحالة", "لم يرد في الوقت المحدد"]]; }
  const to = await notifyAddress(env);
  rRows.push(["المرسِل", code("notify@wixa.dev")], ["التنبيهات تصل إلى", to ? code(to.replace(/^(.{2}).*(@.*)$/, "$1•••$2")) : "غير محدد"]);
  items.push({ name: "Resend — البريد الصادر", role: "يرسل لك تنبيه كل رسالة جديدة من الموقع", state: rState, rows: rRows, link: "https://resend.com/domains", linkText: "لوحة Resend" });

  items.push({ name: "البريد الوارد", role: "عناوين الشركة تُحوَّل إلى بريدك", state: "info",
    rows: [["العناوين", `${code("info@")} ${code("sales@")} ${code("support@")}`], ["الخدمة", "Cloudflare Email Routing"], ["يُحوَّل إلى", "Gmail الخاص بالشركة"]],
    link: `https://dash.cloudflare.com/${acc}/wixa.dev/email/routing/overview`, linkText: "إعدادات البريد" });

  const aOk = analytics.status === "fulfilled" && analytics.value?.data?.viewer?.accounts?.length > 0;
  items.push({ name: "Cloudflare — الإحصائيات", role: "عدد الزيارات وسرعة الموقع في «الرئيسية»", state: aOk ? "ok" : "err",
    rows: [["الخدمة", "Web Analytics"], ["الحالة", aOk ? "متصلة" : env.CF_ANALYTICS_TOKEN ? "المفتاح لا يعمل" : "المفتاح غير مضاف"]],
    link: `https://dash.cloudflare.com/${acc}/web-analytics`, linkText: "الإحصائيات في Cloudflare" });

  const gState = staging ? "info" : seo.index === false ? "err" : seo.google_verification ? "ok" : "warn";
  items.push({ name: "Google — البحث", role: "ظهور موقعك في نتائج البحث", state: gState,
    rows: [["الفهرسة", staging ? "متوقفة عمداً (نسخة تجريبية)" : seo.index === false ? "متوقفة" : "مسموحة"], ["Search Console", seo.google_verification ? "مربوط برمز تحقق" : "غير مربوط بعد"], ["خريطة الموقع", code("/sitemap.xml")]],
    link: "https://search.google.com/search-console", linkText: "Google Search Console" });

  return json({ env: env.SITE_ENV || "production", checked_at: new Date().toISOString(), items }, 200, { "cache-control": "no-store" });
}

// GET/PUT /api/admin/notify — read or change where new-message alerts are sent (admins only)
export async function handleAdminNotify(request, env) {
  const s = await adminSession(request, env, ["owner"]);
  if (s.error) return s.error;
  if (request.method === "GET") {
    const custom = env.PRIVATE ? await env.PRIVATE.get("notify_email") : null;
    return json({ email: await notifyAddress(env), source: custom ? "dashboard" : "default", editable: !!env.PRIVATE }, 200, { "cache-control": "no-store" });
  }
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  let body = {};
  try { body = await request.json(); } catch {}
  const email = String(body.email || "").trim().slice(0, 200);
  if (!email) { await env.PRIVATE.delete("notify_email"); await audit(env, s, { area: "notify", action: "update", summary: "بريد التنبيهات: العودة إلى البريد الافتراضي" }); return json({ email: env.NOTIFY_EMAIL || "", source: "default" }); }
  if (!EMAIL_RE.test(email)) return json({ error: "invalid_email" }, 422);
  await env.PRIVATE.put("notify_email", email);
  await audit(env, s, { area: "notify", action: "update", target: email, summary: "تغيير بريد التنبيهات" });
  return json({ email, source: "dashboard" });
}

// ---------------------------------------------------------------- message status + notes (dashboard)
// Kept in the private store by message id: { status: new|working|won|lost, note }.
export async function handleAdminMsgMeta(request, env) {
  const s = await adminSession(request, env, ["owner", "support"]); // customer data: never the content editor
  if (s.error) return s.error;
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  const all = (await env.PRIVATE.get("msgmeta", { type: "json" })) || {};
  if (request.method === "GET") return json(all, 200, { "cache-control": "no-store" });
  let b = {};
  try { b = await request.json(); } catch {}
  const id = String(b.id || "").slice(0, 64);
  if (!id) return json({ error: "missing_id" }, 422);
  if (b.remove) delete all[id];
  else all[id] = { status: ["new", "working", "won", "lost"].includes(b.status) ? b.status : "new", note: String(b.note || "").slice(0, 2000), at: new Date().toISOString() };
  const before = (await env.PRIVATE.get("msgmeta", { type: "json" }).catch(() => null))?.[id] || null;
  await env.PRIVATE.put("msgmeta", JSON.stringify(all));
  await audit(env, s, { area: "messages", action: b.remove ? "delete" : "update", target: `رسالة ${id}`, changes: b.remove ? {} : { status: { from: before?.status ?? null, to: all[id].status }, note: { from: before?.note ?? null, to: all[id].note.slice(0, 300) } } });
  return json(all[id] || { ok: true });
}

// POST /api/admin/order — an order the team adds by hand (a phone call, WhatsApp, a visit…). Same numbering and the
// same Orders page as the site's orders; source «manual», the channel kept in visit_source. Nothing is sent to anyone.
export const MANUAL_CHANNELS = new Set(["phone", "whatsapp", "visit", "social", "email", "other"]);
export async function handleAdminOrder(request, env, ctx) {
  const s = await adminSession(request, env, ["owner", "support"]); // customer data: never the content editor
  if (s.error) return s.error;
  let b = {};
  try { b = await request.json(); } catch {}
  const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
  const name = clean(b.name, 120), phone = clean(b.phone, 40), email = clean(b.email, 200);
  if (!name || phone.replace(/\D/g, "").length < 7) return json({ error: "validation" }, 422);
  if (email && !EMAIL_RE.test(email)) return json({ error: "bad_email" }, 422);
  const lang = b.lang === "en" ? "en" : "ar";
  const offer = b.offer ? await requestOffer(env, ctx, lang) : { gifts: [], discount: "" };
  const number = newOrderNumber();
  const r = await rpc(env, "submit_order", { number, source: "manual", item: clean(b.item, 200), details: { features: [], timeline: clean(b.timeline, 60) },
    price_hint: clean(b.price, 80), name, phone, email, note: typeof b.note === "string" ? b.note.trim().slice(0, 3000) : "", lang, marketing: b.marketing === true,
    visit_source: MANUAL_CHANNELS.has(b.channel) ? b.channel : "other", gifts: offer.gifts, discount: offer.discount, discount_until: (offer.discount.match(/\d{4}-\d{2}-\d{2}/) || [""])[0] });
  if (!r.ok) { console.error("manual order", r.status, await r.text()); return json({ error: r.status === 404 ? "migration_missing" : "storage" }, 502); }
  await audit(env, s, { area: "orders", action: "insert", target: number, summary: `طلب يدوي: ${name}${b.item ? ` — ${clean(b.item, 200)}` : ""}` });
  return json({ ok: true, number }, 201);
}

// DELETE /api/admin/booking {date, time} — cancel an appointment: its time becomes free to book again
export async function handleAdminBooking(request, env) {
  const s = await adminSession(request, env, ["owner", "support"]); // customer data: never the content editor
  if (s.error) return s.error;
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  let b = {};
  try { b = await request.json(); } catch {}
  const date = String(b.date || ""), time = String(b.time || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return json({ error: "invalid" }, 422);
  const key = `book:${date}`;
  const taken = ((await env.PRIVATE.get(key, { type: "json" }).catch(() => null)) || []).filter((t) => t !== time);
  await env.PRIVATE.put(key, JSON.stringify(taken), { expirationTtl: 90 * 864e2 });
  await audit(env, s, { area: "bookings", action: "cancel", target: `${date} ${time}`, summary: "إلغاء موعد" });
  return json({ ok: true, free: time });
}

// ---------------------------------------------------------------- client review links
// The owner creates a one-time link in the dashboard; the client's review arrives hidden until published.
export async function handleAdminReviewLink(request, env) {
  const s = await adminSession(request, env, ["owner", "editor"]);
  if (s.error) return s.error;
  if (!env.PRIVATE) return json({ error: "storage_not_configured" }, 503);
  let b = {};
  try { b = await request.json(); } catch {}
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await env.PRIVATE.put(`review:${code}`, JSON.stringify({ name: String(b.name || "").slice(0, 120), at: new Date().toISOString() }), { expirationTtl: 60 * 864e2 });
  const origin = new URL(request.url).origin;
  await audit(env, s, { area: "testimonials", action: "review_link", target: String(b.name || "").slice(0, 120), summary: "إنشاء رابط رأي لعميل" });
  return json({ url: `${origin}/review?c=${code}${b.lang === "en" ? "&lang=en" : ""}`, days: 60 });
}
// GET /api/admin/funnel?days=30 — totals for the dashboard
export async function handleAdminFunnel(request, env, url) {
  const { error } = await adminSession(request, env);
  if (error) return error;
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10) || 30));
  const keys = [...Array(days)].map((_, i) => dayKey(new Date(Date.now() - i * 864e5)));
  // the database (atomic counts) + KV (days before the switch, or a flush made while the database was unreachable)
  const [db, ...rows] = await Promise.all([
    rpcToken(env, "events_total", { p: { since: keys[keys.length - 1] } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ...keys.map((d) => (env.PRIVATE ? env.PRIVATE.get(`ev:${d}`, { type: "json" }).catch(() => null) : null)),
  ]);
  const total = {};
  for (const r of [db, ...rows]) if (r) for (const [k, v] of Object.entries(r)) total[k] = (total[k] || 0) + Number(v || 0);
  for (const [k, v] of Object.entries(evBuf.counts)) total[k] = (total[k] || 0) + v; // not saved yet
  return json({ days, total }, 200, { "cache-control": "no-store" });
}

// GET /api/admin/devguide — the developer guide (docs/DEVELOPERS.md), for signed-in admins only
export async function handleAdminDevGuide(request, env) {
  const { error } = await adminSession(request, env, ["owner", "editor"]);
  if (error) return error;
  return new Response(DEV_GUIDE, { headers: { ...SECURITY_HEADERS, "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });
}

// GET /api/admin/team — members and pending invitations (owner)
// POST /api/admin/team {action: invite|cancel|role|remove, …} (owner)
export async function handleAdminTeam(request, env, ctx) {
  const s = await adminSession(request, env, ["owner"]);
  if (s.error) return s.error;
  const origin = new URL(request.url).origin;
  if (request.method === "GET") {
    const r = await rpcToken(env, "team_list", {});
    if (!r.ok) return json({ error: r.status === 404 ? "migration_missing" : "team_failed" }, r.status === 404 ? 503 : 502);
    const members = await r.json();
    const keys = env.PRIVATE ? (await env.PRIVATE.list({ prefix: "invite:" })).keys : [];
    const invites = (await Promise.all(keys.map(async (k) => ({ code: k.name.slice(7), ...((await env.PRIVATE.get(k.name, { type: "json" })) || {}) })))).filter((x) => x.email);
    const me = await sessionUser(request, env);
    return json({ me: me?.id, members, invites }, 200, { "cache-control": "no-store" });
  }
  let b = {};
  try { b = await request.json(); } catch {}
  if (b.action === "invite") {
    const email = String(b.email || "").trim().toLowerCase().slice(0, 200), role = ROLE_AR[b.role] ? b.role : "";
    if (!EMAIL_RE.test(email) || !role) return json({ error: "invalid" }, 422);
    const code = newCode();
    const me = await sessionUser(request, env);
    await env.PRIVATE.put(`invite:${code}`, JSON.stringify({ email, role, by: me?.email || "", at: new Date().toISOString() }), { expirationTtl: 7 * 864e2 });
    const link = `${origin}/admin/#invite=${code}`;
    const cfg = await getConfig(env);
    let sent = false;
    if (env.RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: `${cfg.alerts.from_name} <noreply@wixa.dev>`, to: [email], subject: "دعوة للانضمام إلى لوحة تحكم ويكسا",
          html: mailBox("لديك دعوة إلى لوحة تحكم ويكسا", `<p>دعاك ${esc(me?.email || "مالك الموقع")} لإدارة موقع ويكسا بصلاحية <b>${ROLE_AR[role]}</b>.</p>
            <p>رمز الدعوة:</p><p style="font-size:24px;font-weight:bold;letter-spacing:2px;direction:ltr;text-align:center;background:#F3EEFB;padding:12px;border-radius:12px">${code}</p>
            <p><a href="${link}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 22px;border-radius:99px;text-decoration:none">قبول الدعوة</a></p>
            <p style="color:#625C70;font-size:13px">افتح الرابط، اختر «لدي دعوة»، واكتب بريدك هذا (${esc(email)}) والرمز وكلمة مرور جديدة. الدعوة صالحة 7 أيام ولمرة واحدة.</p>`),
          text: `دعوة إلى لوحة تحكم ويكسا (${ROLE_AR[role]}). الرمز: ${code} — ${link}` }),
      });
      sent = r.ok;
    }
    await audit(env, s, { area: "team", action: "invite", target: email, summary: `دعوة بصلاحية ${ROLE_AR[role]}${sent ? "" : " (لم يُرسل البريد)"}` });
    return json({ code, link, sent, email, role });
  }
  if (b.action === "cancel") {
    const code = String(b.code || "").slice(0, 20), inv = await env.PRIVATE.get(`invite:${code}`, { type: "json" }).catch(() => null);
    await env.PRIVATE.delete(`invite:${code}`);
    await audit(env, s, { area: "team", action: "invite_cancel", target: inv?.email || code, summary: "إلغاء دعوة" });
    return json({ ok: true });
  }
  if (b.action === "role" || b.action === "remove") {
    const me = await sessionUser(request, env);
    if (b.user_id === me?.id) return json({ error: "self" }, 422);
    const r = b.action === "role"
      ? await rpcToken(env, "team_grant", { p: { user_id: b.user_id, role: b.role } })
      : await rpcToken(env, "team_remove", { uid: b.user_id });
    if (!r.ok) { const t = await r.text(); return json({ error: /last owner/.test(t) ? "last_owner" : "failed" }, 422); }
    await audit(env, s, { area: "team", action: b.action === "role" ? "role" : "remove", target: String(b.email || b.user_id || "").slice(0, 160),
      summary: b.action === "role" ? `تغيير الصلاحية إلى ${ROLE_AR[b.role] || b.role}` : "إزالة من الفريق" });
    // a removed member, or one who no longer answers chats, stops getting chat notifications on their devices
    if ((b.action === "remove" || b.role === "editor") && env.PRIVATE) {
      const list = await rpcToken(env, "team_list", {}).then((x) => (x.ok ? x.json() : [])).catch(() => []);
      const email = b.email || list.find?.((m) => m.user_id === b.user_id)?.email;
      const subs = (await env.PRIVATE.get("push_subs", { type: "json" })) || [];
      if (email && subs.some((x) => x.user === email)) await env.PRIVATE.put("push_subs", JSON.stringify(subs.filter((x) => x.user !== email)));
    }
    return json({ ok: true });
  }
  return json({ error: "unknown_action" }, 400);
}

// POST /api/invite/claim {code} — a signed-in invitee turns the invitation into dashboard access
export async function handleInviteClaim(request, env, ctx) {
  if (!(await allowed(env.CONTACT_LIMITER, clientIp(request)))) return json({ error: "rate_limited" }, 429);
  const u = await sessionUser(request, env);
  if (!u?.id) return json({ error: "unauthorized" }, 401);
  let b = {};
  try { b = await request.json(); } catch {}
  const code = String(b.code || "").trim().toUpperCase().slice(0, 20);
  const inv = code && env.PRIVATE ? await env.PRIVATE.get(`invite:${code}`, { type: "json" }) : null;
  if (!inv) return json({ error: "invalid_code" }, 404);
  if (String(u.email || "").toLowerCase() !== inv.email) return json({ error: "email_mismatch" }, 403);
  const r = await rpcToken(env, "team_grant", { p: { user_id: u.id, role: inv.role, email: inv.email } });
  if (!r.ok) return json({ error: "grant_failed" }, 502);
  await env.PRIVATE.delete(`invite:${code}`);
  ctx.waitUntil(sendOwnerMail(env, `${inv.email} قبل الدعوة`, mailBox("عضو جديد في لوحة التحكم", `<p><b>${esc(inv.email)}</b> قبل الدعوة وصار بإمكانه الدخول بصلاحية <b>${ROLE_AR[inv.role]}</b>.</p><p>يمكنك تغيير صلاحيته أو إزالته من لوحة التحكم ← الفريق والصلاحيات.</p>`)).catch(() => {}));
  return json({ ok: true, role: inv.role });
}

// GET: audience size + sent campaigns · POST {subject, body, test}: send (test → only to the alerts address)
export async function handleAdminCampaign(request, env) {
  const s = await adminSession(request, env, ["owner"]);
  if (s.error) return s.error;
  const aud = await rpcToken(env, "campaign_audience", {});
  if (aud.status === 404) return json({ error: "migration_missing" }, 503);
  const audience = aud.ok ? await aud.json() : [];
  const log = env.PRIVATE ? (await env.PRIVATE.get("campaigns", { type: "json" })) || [] : [];
  if (request.method === "GET") return json({ audience: audience.length, log }, 200, { "cache-control": "no-store" });
  if (!env.RESEND_API_KEY) return json({ error: "no_email_key" }, 503);
  let b = {};
  try { b = await request.json(); } catch {}
  const subject = cleanText(b.subject, 150), body = String(b.body || "").replace(/\r/g, "").trim().slice(0, 8000);
  if (!subject || !body) return json({ error: "invalid" }, 422);
  const cfg = await getConfig(env), origin = new URL(request.url).origin;
  const list = b.test ? [{ email: await notifyAddress(env), name: "تجربة" }].filter((x) => x.email) : audience;
  if (!list.length) return json({ error: "no_audience" }, 422);
  const mails = await Promise.all(list.map(async (r) => {
    const link = `${origin}/unsubscribe?e=${encodeURIComponent(r.email)}&s=${await unsubSig(env, r.email)}`;
    const text = body.replace(/\{name\}/g, r.name || "");
    return { from: `${cfg.alerts.from_name} <offers@wixa.dev>`, to: [r.email], subject: b.test ? `[تجربة] ${subject}` : subject,
      headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      html: mailBox(esc(subject), `<div style="white-space:pre-wrap">${esc(text)}</div>
        <p style="margin-top:24px;font-size:12px;color:#8A8296">وصلتك هذه الرسالة لأنك وافقت على استلام عروض ويكسا. <a href="${link}" style="color:#8A8296">إلغاء الاشتراك</a></p>`) };
  }));
  let sent = 0, failed = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(mails.slice(i, i + 100)) });
    if (r.ok) sent += Math.min(100, mails.length - i); else { failed += Math.min(100, mails.length - i); console.error("campaign", r.status, await r.text()); }
  }
  if (!b.test && env.PRIVATE) await env.PRIVATE.put("campaigns", JSON.stringify([{ at: new Date().toISOString(), subject, sent, failed }, ...log].slice(0, 30)));
  await audit(env, s, { area: "campaigns", action: b.test ? "send_test" : "send", target: subject, summary: `${sent} أُرسلت${failed ? ` · ${failed} فشلت` : ""}` });
  return json({ ok: failed === 0, sent, failed, test: !!b.test });
}

// POST /api/admin/restore — the owner's restore from a backup file: puts back the orders, messages, live chats and
// customer notes that are missing (rows already there are never changed or deleted). The content (projects, texts…)
// is restored by the dashboard itself; these tables can only be written by the server.
export async function handleAdminRestore(request, env) {
  const s = await adminSession(request, env, ["owner"]);
  if (s.error) return s.error;
  const text = await request.text();
  if (text.length > 20_000_000) return json({ error: "too_large" }, 413);
  let b;
  try { b = JSON.parse(text); } catch { return json({ error: "invalid_json" }, 400); }
  const list = (k) => (Array.isArray(b?.[k]) ? b[k] : []);
  const p = { orders: list("orders"), contact_messages: list("contact_messages"), chats: list("chats"), chat_messages: list("chat_messages"), customer_notes: list("customer_notes") };
  const r = await rpcToken(env, "restore_records", { p });
  if (!r.ok) { console.error("restore", r.status, await r.text()); return json({ error: r.status === 404 ? "migration_missing" : "storage" }, 502); }
  const res = await r.json();
  const AR = { orders: "طلبات", contact_messages: "رسائل", chats: "محادثات", customer_notes: "ملاحظات عملاء" };
  await audit(env, s, { area: "backup", action: "restore", summary: `استرجاع من نسخة احتياطية — أُضيف: ${Object.entries(AR).map(([k, l]) => `${res[k] ?? 0} ${l}`).join("، ")}` });
  return json({ ok: true, ...res });
}
