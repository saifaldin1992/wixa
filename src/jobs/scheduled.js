// Scheduled jobs (cron): uptime monitor, weekly report, backups, sales reminders.

import { STAGE_AR, baghdadNow, dayKey, esc, rpcToken, sb } from "../lib/core.js";
import { getConfig } from "../services/data.js";
import { mailBox, notifyAddress, sendOwnerMail } from "../services/mail.js";

// Every 15 minutes: is the database answering, and does the site have its content? Emails only when the state changes
// (two failed checks in a row before "down", to ignore a single hiccup).
export async function runMonitor(env) {
  const cfg = await getConfig(env);
  if (!cfg.reports.monitor || !env.PRIVATE) return;
  const problems = [];
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/site_settings?select=id&id=eq.1`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) problems.push(`قاعدة البيانات (Supabase) ترد بخطأ ${r.status}`);
  } catch (e) { problems.push(`قاعدة البيانات (Supabase) لا ترد: ${e.message}`); }
  try {
    const page = await env.ASSETS.fetch(new Request("https://wixa.dev/index.html"));
    if (!page.ok) problems.push(`ملفات الموقع ترد بخطأ ${page.status}`);
  } catch (e) { problems.push(`ملفات الموقع لا ترد: ${e.message}`); }
  const prev = (await env.PRIVATE.get("monitor", { type: "json" })) || { state: "ok", fails: 0 };
  const fails = problems.length ? prev.fails + 1 : 0;
  const state = problems.length ? (fails >= 2 ? "down" : prev.state) : "ok";
  const site = env.SITE_ENV === "staging" ? "staging.wixa.dev" : "wixa.dev";
  const when = new Date().toLocaleString("ar-IQ", { timeZone: "Asia/Baghdad", dateStyle: "medium", timeStyle: "short" });
  if (state === "down" && prev.state !== "down") {
    await sendOwnerMail(env, `⚠️ مشكلة في ${site}`, mailBox(`⚠️ تنبيه: مشكلة في ${site}`, `<p>رصد الفحص التلقائي مشكلة (${when} بتوقيت بغداد):</p><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul><p>الموقع يعرض آخر نسخة محفوظة من المحتوى قدر الإمكان. سيصلك بريد آخر عند عودة كل شيء للعمل.</p>`, "#B42318"));
  } else if (state === "ok" && prev.state === "down") {
    await sendOwnerMail(env, `✅ عاد ${site} للعمل`, mailBox(`✅ عاد ${site} للعمل`, `<p>عادت كل الفحوص سليمة (${when} بتوقيت بغداد).</p>`, "#067647"));
  }
  await env.PRIVATE.put("monitor", JSON.stringify({ state, fails, at: new Date().toISOString(), problems }));
}

// Visits in the last 7 days from Cloudflare Web Analytics (public pages only)
export async function weeklyVisits(env, since) {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_SITE_TAG) return null;
  const q = `query($acc: String!, $tag: String!, $hosts: [string!], $since: Date!) { viewer { accounts(filter: {accountTag: $acc}) {
    total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since}) { count sum { visits } }
    countries: rumPageloadEventsAdaptiveGroups(limit: 3, filter: {siteTag: $tag, requestHost_in: $hosts, requestPath_notlike: "/admin%", date_geq: $since}, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { countryName } }
  } } }`;
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ query: q, variables: { acc: env.CF_ACCOUNT_ID, tag: env.CF_SITE_TAG, hosts: env.SITE_ENV === "staging" ? ["staging.wixa.dev"] : ["wixa.dev", "www.wixa.dev"], since } }) });
    const a = (await r.json())?.data?.viewer?.accounts?.[0];
    if (!a) return null;
    return { views: a.total?.[0]?.count || 0, visitors: a.total?.[0]?.sum?.visits || 0, countries: (a.countries || []).map((x) => [x.dimensions.countryName, x.sum.visits]) };
  } catch { return null; }
}

export async function runWeeklyReport(env, force = false) {
  const cfg = await getConfig(env);
  if (!cfg.reports.weekly && !force) return false;
  const days = [...Array(7)].map((_, i) => dayKey(new Date(Date.now() - (i + 1) * 864e5)));
  const counts = await Promise.all(days.map((d) => (env.PRIVATE ? env.PRIVATE.get(`count:${d}`, { type: "json" }).catch(() => null) : null)));
  const sum = { total: 0, jobs: 0, services: {} };
  for (const c of counts) if (c) { sum.total += c.total || 0; sum.jobs += c.jobs || 0; for (const [k, v] of Object.entries(c.services || {})) sum.services[k] = (sum.services[k] || 0) + v; }
  const v = await weeklyVisits(env, days[6]);
  const top = Object.entries(sum.services).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const site = env.SITE_ENV === "staging" ? "https://staging.wixa.dev" : "https://wixa.dev";
  const row = (k, val) => `<tr><td style="padding:8px 0;color:#625C70">${k}</td><td style="padding:8px 0;text-align:left;font-weight:bold">${val}</td></tr>`;
  const inner = `<p style="margin-top:0">ملخص آخر ٧ أيام (${days[6]} — ${days[0]}):</p>
    <table style="width:100%;border-collapse:collapse">
      ${v ? row("الزوار", v.visitors.toLocaleString("en")) + row("مشاهدات الصفحات", v.views.toLocaleString("en")) : row("الزوار", "غير متاح")}
      ${row("رسائل جديدة", sum.total - sum.jobs)}${row("طلبات توظيف", sum.jobs)}
    </table>
    ${top.length ? `<p style="margin-bottom:4px"><b>أكثر ما طُلب:</b></p><ul style="margin-top:0">${top.map(([k, n]) => `<li>${esc(k)} — ${n}</li>`).join("")}</ul>` : ""}
    ${v?.countries?.length ? `<p style="margin-bottom:4px"><b>أكثر الدول زيارة:</b></p><ul style="margin-top:0">${v.countries.map(([k, n]) => `<li>${esc(k)} — ${n}</li>`).join("")}</ul>` : ""}
    <p><a href="${site}/admin/" style="color:#5B21B6">فتح لوحة التحكم ←</a></p>`;
  return sendOwnerMail(env, `${force ? "[اختبار] " : ""}تقرير ويكسا الأسبوعي`, mailBox("تقرير ويكسا الأسبوعي", inner));
}

// ---------------------------------------------------------------- scheduled backup (daily / weekly / monthly / off)
export async function runBackup(env, force = false) {
  const cfg = await getConfig(env);
  const freq = cfg.backup.freq;
  const now = baghdadNow();
  const due = force || freq === "daily" || (freq === "weekly" && now.getUTCDay() === 0) || (freq === "monthly" && now.getUTCDate() === 1);
  if (!due || freq === "off" && !force) return false;
  const r = await sb(env, "rpc/export_backup", { method: "POST", body: JSON.stringify({ token: env.WRITE_TOKEN || "" }) });
  if (!r.ok) { console.error("backup export", r.status, await r.text()); return false; }
  const text = await r.text();
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const to = await notifyAddress(env);
  if (!env.RESEND_API_KEY || !to) return false;
  const site = env.SITE_ENV === "staging" ? "staging.wixa.dev" : "wixa.dev";
  const date = now.toISOString().slice(0, 10);
  const label = { daily: "يومية", weekly: "أسبوعية", monthly: "شهرية", off: "يدوية" }[freq] || "";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `${cfg.alerts.from_name} <notify@wixa.dev>`, to: [to],
      subject: `${force ? "[يدوي] " : ""}نسخة احتياطية ${label} — ${site} — ${date}`,
      html: mailBox("نسخة احتياطية من موقع ويكسا", `<p>مرفق ملف فيه كل محتوى الموقع (${(bytes.length / 1024).toFixed(0)} KB): الإعدادات والنصوص والمشاريع والخدمات والشركاء والآراء والمقالات، والطلبات والرسائل والمحادثات وملاحظات العملاء.</p><p>احتفظ به في مكان آمن؛ يمكن استرجاع الموقع منه عند الحاجة.</p>`),
      attachments: [{ filename: `wixa-backup-${site}-${date}.json`, content: btoa(bin) }],
    }),
  });
  if (!res.ok) { console.error("backup mail", res.status, await res.text()); return false; }
  if (env.PRIVATE) await env.PRIVATE.put("backup:last", JSON.stringify({ at: new Date().toISOString(), size: bytes.length, manual: force }));
  return true;
}

// Every morning (production): follow-ups due today and chats waiting for a reply → one email to the owner
export async function runReminders(env) {
  const cfg = await getConfig(env);
  if (cfg.reports.reminders === false) return;
  const r = await rpcToken(env, "sales_due", {});
  if (!r.ok) return;
  const d = await r.json();
  if (!d.follow.length && !d.waiting.length) return;
  const site = env.SITE_ENV === "staging" ? "https://staging.wixa.dev" : "https://wixa.dev";
  const li = (x) => `<li style="margin-bottom:8px">${x}</li>`;
  const html = mailBox("متابعات اليوم", `
    ${d.follow.length ? `<p><b>زبائن موعد متابعتهم اليوم (${d.follow.length}):</b></p><ul>${d.follow.map((f) => li(`<b>${esc(d.names[f.key] || f.key.slice(2))}</b> — ${STAGE_AR[f.stage] || ""}${f.note ? `<br><span style="color:#6B6478">${esc(f.note)}</span>` : ""}`)).join("")}</ul>` : ""}
    ${d.waiting.length ? `<p><b>محادثات تنتظر ردك منذ أكثر من يوم (${d.waiting.length}):</b></p><ul>${d.waiting.map((w) => li(`<b>${esc(w.name)}</b> <span dir="ltr">${esc(w.phone)}</span><br><span style="color:#6B6478">${esc(w.text)}</span>`)).join("")}</ul>` : ""}
    <p><a href="${site}/admin/#customers" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 22px;border-radius:99px;text-decoration:none">فتح لوحة التحكم</a></p>`);
  await sendOwnerMail(env, `متابعات اليوم: ${d.follow.length + d.waiting.length} — ويكسا`, html);
}
