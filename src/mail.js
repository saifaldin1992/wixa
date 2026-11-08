// Emails: alerts to the team, confirmation and auto-replies to customers.

import { EMAIL_RE, WIXA, esc } from "./core.js";
import { getConfig, getSiteData, loadFromSupabase, memo } from "./data.js";

export async function notifyAddress(env) {
  const v = env.PRIVATE ? await env.PRIVATE.get("notify_email").catch(() => null) : null;
  return v || env.NOTIFY_EMAIL || "";
}

// ---------------------------------------------------------------- POST /api/contact
// Email the site owner about a new message (needs RESEND_API_KEY and NOTIFY_EMAIL secrets on the Worker).
export async function notifyOwner(env, row, test = false) {
  if (!env.RESEND_API_KEY) return false;
  const cfg = await getConfig(env);
  if (!cfg.alerts.on && !test) return false;
  const to = (await notifyAddress(env)) || ""; // dashboard setting (private store) or the NOTIFY_EMAIL secret
  if (!to) return false;
  const staging = env.SITE_ENV === "staging";
  const admin = `${staging ? "https://staging.wixa.dev" : "https://wixa.dev"}/admin/#${row.order ? "orders" : "messages"}`;
  const wa = row.phone ? `https://wa.me/${row.phone.replace(/\D/g, "")}` : "";
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F6F3F2;padding:24px">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ECE6E8">
      <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">${row.order ? `طلب جديد ${esc(row.order)}` : "رسالة جديدة"} من موقع ويكسا${staging ? " (النسخة التجريبية)" : ""}</div>
      <div style="padding:22px;color:#1A0E12;font-size:15px;line-height:1.8">
        <p style="margin:0 0 6px"><b>الاسم:</b> ${esc(row.name)}</p>
        ${row.email ? `<p style="margin:0 0 6px"><b>البريد:</b> <a href="mailto:${esc(row.email)}">${esc(row.email)}</a></p>` : ""}
        ${row.phone ? `<p style="margin:0 0 6px"><b>الهاتف:</b> ${esc(row.phone)}</p>` : ""}
        ${row.services?.length ? `<p style="margin:0 0 6px"><b>الخدمة:</b> ${esc(row.services.join("، "))}</p>` : ""}
        <div style="margin:14px 0;padding:14px;background:#F8EEF1;border-radius:12px;white-space:pre-wrap">${esc(row.message)}</div>
        ${row.email ? `<a href="mailto:${esc(row.email)}" style="display:inline-block;background:#5B21B6;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;margin-left:6px">رد بالبريد</a>` : ""}
        ${wa ? `<a href="${wa}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;margin-left:6px">واتساب</a>` : ""}
        <a href="${admin}" style="display:inline-block;color:#5B21B6;padding:10px 4px">فتح لوحة التحكم ←</a>
      </div></div></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `${cfg.alerts.from_name} <notify@wixa.dev>`, to: [to], ...(row.email ? { reply_to: row.email } : {}), subject: `${test ? "[اختبار] " : ""}${staging ? "[تجريبي] " : ""}${row.order ? `طلب جديد ${row.order} — ${row.name}` : /^(طلب توظيف|حجز موعد)/.test(row.services?.[0] || "") ? `${row.services[0]} — ${row.name}` : `رسالة جديدة من ${row.name}`}`, html }),
  });
  if (!res.ok) console.error("notify failed", res.status, await res.text());
  return res.ok;
}

// Thank-you email to the visitor (switched on in the dashboard). The name is shortened and stripped of links,
// so the form cannot be used to send someone else a message of the sender's choosing.
export async function sendAutoReply(env, cfg, row, test = false) {
  if (!env.RESEND_API_KEY || !row.email || (!cfg.autoreply.on && !test)) return false;
  const lang = row.lang === "en" ? "en" : "ar";
  const name = row.name.replace(/https?:\/\/\S+|www\.\S+|\S+\.(com|net|org|io|dev|me|ly|xyz)\S*/gi, "").replace(/[<>]/g, "").trim().slice(0, 40) || (lang === "ar" ? "بك" : "there");
  const text = cfg.autoreply[`body_${lang}`].split("{name}").join(name);
  let contact = "";
  try { contact = JSON.parse(memo.text || (await loadFromSupabase(env)))?.settings?.contact?.email || ""; } catch {}
  const site = env.SITE_ENV === "staging" ? "https://staging.wixa.dev" : "https://wixa.dev";
  const html = `<div dir="${lang === "ar" ? "rtl" : "ltr"}" style="font-family:Tahoma,Arial,sans-serif;background:#F6F3F2;padding:24px">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ECE6E8">
      <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">${lang === "ar" ? "ويكسا" : "WIXA"}</div>
      <div style="padding:22px;color:#1A0E12;font-size:15px;line-height:1.9;white-space:pre-wrap">${esc(text)}</div>
      <div style="padding:0 22px 20px"><a href="${site}" style="color:#5B21B6;text-decoration:none">${site.replace("https://", "")}</a></div></div></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `${cfg.alerts.from_name} <noreply@wixa.dev>`, to: [row.email], ...(EMAIL_RE.test(contact) ? { reply_to: contact } : {}),
      subject: `${test ? "[اختبار] " : ""}${cfg.autoreply[`subject_${lang}`]}`, html, text }),
  });
  if (!res.ok) console.error("autoreply failed", res.status, await res.text());
  return res.ok;
}

// Gifts and discount promised with a project request, as set in the dashboard (Offers & gifts).
// The discount is written with its expiry date, so the team applies it to the final price later.
export async function requestOffer(env, ctx, lang) {
  const ar = lang !== "en";
  let st = {};
  try { st = JSON.parse(await getSiteData(env, ctx))?.settings || {}; } catch {}
  const o = WIXA.merge(WIXA.DEFAULTS, st).request_offer || {};
  const pick = (x, f) => String((ar ? x[`${f}_ar`] : x[`${f}_en`]) || x[`${f}_ar`] || "").slice(0, 120);
  const gifts = o.gifts_on === false ? [] : (o.gifts || []).map((g) => [pick(g, "title"), pick(g, "text")]).filter(([h]) => h).map(([h, p]) => (p ? `${h} (${p})` : h));
  let discount = "";
  const d = o.discount || {}, v = Number(d.value);
  if (d.on && v > 0) {
    const amount = d.type === "amount" ? `${v.toLocaleString("en-US")}$` : `${v}%`;
    const days = Math.max(0, Math.min(365, Number(d.valid_days) || 0));
    const until = days ? new Date(Date.now() + days * 864e5).toISOString().slice(0, 10) : "";
    discount = ar ? `خصم ${amount} على السعر النهائي${until ? ` — صالح حتى ${until}` : ""}` : `${amount} off the final price${until ? ` — valid until ${until}` : ""}`;
  }
  return { gifts, discount };
}

// The client's copy of a project request: its number and what they asked for (always sent, whatever the auto-reply setting)
export async function sendRequestConfirmation(env, cfg, row) {
  if (!env.RESEND_API_KEY || !row.email) return false;
  const ar = row.lang !== "en";
  const name = row.name.replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/[<>]/g, "").trim().slice(0, 40);
  let contact = "", wa = "";
  try { const c = JSON.parse(memo.text || (await loadFromSupabase(env)))?.settings?.contact || {}; contact = c.email || ""; wa = String(c.whatsapp || "").replace(/\D/g, ""); } catch {}
  const site = env.SITE_ENV === "staging" ? "https://staging.wixa.dev" : "https://wixa.dev";
  const intro = ar ? `أهلاً ${name}،\nوصلنا طلب مشروعك ورقمه ${row.request_no}. سيراجعه فريقنا ونعود إليك خلال يوم عمل بالخطوة التالية أو بأسئلة لتوضيح التفاصيل.`
    : `Hi ${name},\nWe've received your project request, number ${row.request_no}. Our team will review it and get back to you within one working day with the next step or a few questions.`;
  const keep = ar ? "احتفظ برقم الطلب، واذكره عند تواصلك معنا." : "Keep this number and mention it when you contact us.";
  const html = `<div dir="${ar ? "rtl" : "ltr"}" style="font-family:Tahoma,Arial,sans-serif;background:#F6F3FB;padding:24px">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2">
      <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">${ar ? "ويكسا" : "WIXA"}</div>
      <div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.9">
        <p style="margin:0 0 14px;white-space:pre-wrap">${esc(intro)}</p>
        <div style="background:#F3EEFC;border-radius:12px;padding:14px 16px;text-align:center;margin:0 0 16px"><div style="color:#625C70;font-size:13px">${ar ? "رقم الطلب" : "Request number"}</div><div style="font-size:22px;font-weight:bold;letter-spacing:1px;color:#5B21B6" dir="ltr">${esc(row.request_no)}</div></div>
        ${row.offer && (row.offer.gifts.length || row.offer.discount) ? `<div style="border:1.5px dashed #C4B5FD;border-radius:12px;padding:12px 16px;margin:0 0 16px;background:#FBF9FF"><div style="font-weight:bold;color:#5B21B6;margin-bottom:4px">🎁 ${ar ? "محفوظ لك مع هذا الطلب" : "Saved for you with this request"}</div><div style="color:#3A3446;font-size:14px">${[...row.offer.gifts.map((g) => `✓ ${esc(g)}`), ...(row.offer.discount ? [`✓ ${esc(row.offer.discount)}`] : [])].join("<br>")}</div></div>` : ""}
        <div style="white-space:pre-wrap;color:#3A3446;font-size:14px;border-top:1px solid #EEE;padding-top:12px">${esc(row.message)}</div>
        <p style="margin:16px 0 0;color:#625C70;font-size:13px">${esc(keep)}</p>
        ${wa ? `<p style="margin:14px 0 0"><a href="https://wa.me/${wa}?text=${encodeURIComponent((ar ? "مرحباً، بخصوص طلبي رقم " : "Hello, about my request ") + row.request_no)}" style="display:inline-block;background:#0E7C47;color:#fff;text-decoration:none;padding:10px 18px;border-radius:99px;font-weight:bold">${ar ? "تابع طلبك على واتساب" : "Follow up on WhatsApp"}</a></p>` : ""}
      </div>
      <div style="padding:0 22px 20px"><a href="${site}" style="color:#5B21B6;text-decoration:none">${site.replace("https://", "")}</a></div></div></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `${cfg.alerts.from_name} <noreply@wixa.dev>`, to: [row.email], ...(EMAIL_RE.test(contact) ? { reply_to: contact } : {}),
      subject: ar ? `استلمنا طلب مشروعك — ${row.request_no}` : `We received your project request — ${row.request_no}`, html, text: `${intro}\n\n${row.message}\n\n${keep}` }),
  });
  if (!res.ok) console.error("request mail failed", res.status, await res.text());
  return res.ok;
}

// ---------------------------------------------------------------- scheduled jobs: monitoring + weekly report
export async function sendOwnerMail(env, subject, html) {
  const to = await notifyAddress(env);
  if (!env.RESEND_API_KEY || !to) return false;
  const cfg = await getConfig(env);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `${cfg.alerts.from_name} <notify@wixa.dev>`, to: [to], subject, html }),
  });
  if (!r.ok) console.error("owner mail failed", r.status, await r.text());
  return r.ok;
}
export const mailBox = (title, inner, color = "#5B21B6") => `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F6F3F2;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ECE6E8">
  <div style="background:${color};color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">${title}</div><div style="padding:22px;color:#1A0E12;font-size:15px;line-height:1.9">${inner}</div></div></div>`;
