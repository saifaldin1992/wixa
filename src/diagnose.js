// Dashboard → النظام → الفحص والتشخيص: checks every part of the site and how to fix it.

import { adminSession } from "./admin.js";
import { json, rpcToken, sb } from "./core.js";
import { getConfig, getSiteData, loadFromSupabase, memo } from "./data.js";
import { errBuf } from "./errors.js";
import { notifyAddress } from "./mail.js";
import { handleHome } from "./pages.js";

// ---------------------------------------------------------------- diagnostics
// GET /api/admin/diagnose — checks every part the site depends on and says, for each problem, where it is and what to do.
export async function handleAdminDiagnose(request, env, ctx) {
  const { error } = await adminSession(request, env, ["owner"]);
  if (error) return error;
  const origin = new URL(request.url).origin;
  const timed = (p, ms = 8000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("لم يرد خلال 8 ثوانٍ")), ms))]);
  const ms = async (fn) => { const t = Date.now(); const v = await fn(); return [v, Date.now() - t]; };
  const R = [];
  const add = (group, title, state, detail, where = "", fix = "") => R.push({ group, title, state, detail, where, fix });
  const run = async (group, title, fn, where, fix) => {
    try { const r = await timed(fn()); add(group, title, r.state || "ok", r.detail || "", where, r.state && r.state !== "ok" ? r.fix || fix : ""); }
    catch (e) { add(group, title, "fail", e.message, where, fix); }
  };
  const staging = env.SITE_ENV === "staging";
  const worker = staging ? "wixa-staging" : "wixa";
  const dash = `Cloudflare ← Workers & Pages ← ${worker} ← Settings ← Variables and Secrets`;

  // 1. server settings
  const need = [["SUPABASE_URL", "عنوان قاعدة البيانات"], ["SUPABASE_PUBLISHABLE_KEY", "مفتاح قاعدة البيانات العام"], ["WRITE_TOKEN", "مفتاح حفظ الرسائل"], ["RESEND_API_KEY", "مفتاح إرسال البريد"], ["TURNSTILE_SITE_KEY", "مفتاح الحماية (العام)"], ["TURNSTILE_SECRET", "مفتاح الحماية (السري)"], ["CF_ANALYTICS_TOKEN", "مفتاح إحصاءات Cloudflare"], ["CF_SITE_TAG", "معرّف موقع الإحصاءات"], ["CF_ACCOUNT_ID", "معرّف حساب Cloudflare"]];
  const missing = need.filter(([k]) => !env[k]);
  add("الخادم", "الإعدادات والمفاتيح السرية", missing.length ? "fail" : "ok",
    missing.length ? `ناقص: ${missing.map(([k, n]) => `${n} (${k})`).join("، ")}` : `كل المفاتيح التسعة موجودة · النسخة ${env.CF_VERSION?.id?.slice(0, 8) || "—"}`,
    dash, "أضف المفتاح الناقص بنفس الاسم من إعدادات الـ Worker، ثم أعد النشر.");
  const binds = [["PRIVATE", "التخزين الخاص (KV)"], ["CONTACT_LIMITER", "حدّ رسائل النموذج"], ["TRACK_LIMITER", "حدّ الإحصاءات"], ["ASSETS", "ملفات الموقع"]].filter(([k]) => !env[k]);
  add("الخادم", "الربط بخدمات Cloudflare", binds.length ? "fail" : "ok", binds.length ? `غير مربوط: ${binds.map(([, n]) => n).join("، ")}` : "التخزين الخاص وحدود الطلبات وملفات الموقع مربوطة", "ملف wrangler.toml في المشروع", "تأكد أن الربط موجود في wrangler.toml للنسخة الصحيحة (staging أو الرئيسية) ثم أعد النشر.");

  await Promise.all([
    // 2. database
    run("قاعدة البيانات", "الاتصال بـ Supabase", async () => {
      const [r, t] = await ms(() => sb(env, "site_settings?select=id&id=eq.1"));
      if (!r.ok) return { state: "fail", detail: `ترد بخطأ ${r.status}` };
      return { state: t > 1500 ? "warn" : "ok", detail: `ترد خلال ${t}ms`, fix: "بطء غير معتاد: افتح Supabase ← Reports وتأكد أن المشروع غير متوقف (Paused)." };
    }, "Supabase ← المشروع", "افتح لوحة Supabase: إذا كان المشروع متوقفاً (Paused) اضغط Restore. وإلا تحقق من SUPABASE_URL."),
    run("قاعدة البيانات", "الجداول والمحتوى المنشور", async () => {
      const tables = ["projects", "services", "partners", "testimonials", "posts"];
      const counts = await Promise.all(tables.map((tb) => sb(env, `${tb}?select=id&published=eq.true`, { method: "HEAD", headers: { prefer: "count=exact" } }).then((r) => (r.ok ? parseInt((r.headers.get("content-range") || "/0").split("/")[1], 10) || 0 : `خطأ ${r.status}`))));
      const bad = counts.filter((c) => typeof c === "string");
      const names = { projects: "مشاريع", services: "خدمات", partners: "شركاء", testimonials: "آراء", posts: "مقالات" };
      return { state: bad.length ? "fail" : "ok", detail: tables.map((tb, i) => `${names[tb]}: ${counts[i]}`).join(" · "), fix: "جدول لا يُقرأ: غالباً تحديث قاعدة بيانات لم يُطبَّق (ملفات supabase/migrations)." };
    }, "Supabase ← Table Editor", ""),
    run("قاعدة البيانات", "مفتاح حفظ الرسائل والنسخ الاحتياطي", async () => {
      const r = await sb(env, "rpc/export_backup", { method: "POST", body: JSON.stringify({ token: env.WRITE_TOKEN || "" }) });
      if (r.ok) { const n = (await r.text()).length; return { detail: `صالح · حجم المحتوى الكامل ${(n / 1024).toFixed(0)} KB` }; }
      return { state: "fail", detail: r.status === 404 ? "دالة النسخ الاحتياطي غير موجودة" : `مرفوض (${r.status})`, fix: r.status === 404 ? "طبّق ملف التحديث supabase/migrations/20261107000000_posts_reviews_backup.sql في محرر SQL." : "قيمة WRITE_TOKEN في الـ Worker لا تطابق المحفوظة في قاعدة البيانات (private.write_token)." };
    }, `${dash} ← WRITE_TOKEN`, ""),
    run("قاعدة البيانات", "تسجيل الدخول (Auth)", async () => {
      const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
      return r.ok ? { detail: "خدمة الدخول تعمل" } : { state: "fail", detail: `خطأ ${r.status}` };
    }, "Supabase ← Authentication", "إذا تعذّر الدخول للوحة التحكم فالعطل هنا: راجع حالة Supabase من status.supabase.com."),
    // 3. private store
    run("الخادم", "التخزين الخاص (KV)", async () => {
      if (!env.PRIVATE) return { state: "fail", detail: "غير مربوط" };
      const v = String(Date.now());
      await env.PRIVATE.put("diag:ping", v, { expirationTtl: 60 });
      const back = await env.PRIVATE.get("diag:ping");
      return back === v ? { detail: "كتابة وقراءة سليمة" } : { state: "warn", detail: "الكتابة تمت لكن القراءة متأخرة (طبيعي لثوانٍ)" };
    }, "Cloudflare ← Storage & Databases ← KV", "تأكد أن مساحة KV موجودة ومربوطة باسم PRIVATE."),
    // 4. email
    run("البريد", "إرسال البريد (Resend)", async () => {
      if (!env.RESEND_API_KEY) return { state: "fail", detail: "المفتاح غير موجود", fix: "أنشئ مفتاحاً من Resend ← API Keys وضعه في RESEND_API_KEY ضمن إعدادات الـ Worker." };
      const r = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` } });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 && /restricted/i.test(JSON.stringify(d))) return { detail: "المفتاح صالح (صلاحية إرسال فقط — لا يمكن فحص النطاق منه)" };
      if (!r.ok) return { state: "fail", detail: `المفتاح مرفوض (${r.status})`, fix: "أنشئ مفتاحاً جديداً من Resend ← API Keys وضعه في RESEND_API_KEY." };
      const dom = (d.data || []).find((x) => x.name === "wixa.dev");
      if (!dom) return { state: "fail", detail: "نطاق wixa.dev غير مضاف في Resend", fix: "أضف النطاق في Resend ← Domains وأكمل سجلات DNS." };
      return dom.status === "verified" ? { detail: "النطاق wixa.dev موثّق والإرسال يعمل" } : { state: "fail", detail: `النطاق بحالة: ${dom.status}`, fix: "افتح Resend ← Domains واضغط Verify؛ تأكد أن سجلات DKIM وSPF في Cloudflare DNS." };
    }, "Resend ← Domains / API Keys", ""),
    run("البريد", "عنوان استلام التنبيهات", async () => {
      const to = await notifyAddress(env);
      return to ? { detail: `التنبيهات تصل إلى ${to}` } : { state: "fail", detail: "لا يوجد بريد لاستلام التنبيهات", fix: "اكتبه في لوحة التحكم ← الحساب ← بريد تنبيهات الرسائل." };
    }, "لوحة التحكم ← الحساب", ""),
    // 5. bot protection
    run("الحماية", "التحقق من الزوار (Turnstile)", async () => {
      if (!env.TURNSTILE_SECRET) return { state: "warn", detail: "غير مفعّل — النموذج بلا تحقق", fix: "أضف TURNSTILE_SECRET وTURNSTILE_SITE_KEY من Cloudflare ← Turnstile." };
      const f = new FormData(); f.append("secret", env.TURNSTILE_SECRET); f.append("response", "diagnostic-check");
      const d = await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: f })).json().catch(() => ({}));
      const codes = d["error-codes"] || [];
      if (codes.includes("invalid-input-secret")) return { state: "fail", detail: "المفتاح السري مرفوض", fix: "انسخ Secret Key من Cloudflare ← Turnstile ← الموقع وضعه في TURNSTILE_SECRET." };
      const cfg = await getConfig(env);
      return { state: cfg.spam.turnstile ? "ok" : "warn", detail: cfg.spam.turnstile ? "المفتاح صالح والتحقق مفعّل" : "المفتاح صالح لكن التحقق موقوف من التكاملات", fix: "شغّله من لوحة التحكم ← التكاملات ← الحماية من الرسائل المزعجة." };
    }, "Cloudflare ← Turnstile", ""),
    // 5b. live chat and team
    run("الدردشة", "جداول الدردشة ودوالها", async () => {
      const r = await rpcToken(env, "chat_status", {});
      if (r.status === 404) return { state: "fail", detail: "تحديث الدردشة غير مطبّق على قاعدة البيانات", fix: "طبّق ملف supabase/migrations/20261109000000_live_chat.sql في محرر SQL." };
      if (!r.ok) return { state: "fail", detail: `مرفوض (${r.status})` };
      const d = await r.json();
      const site = JSON.parse(await getSiteData(env, ctx)).settings?.chat;
      return { state: site?.on ? "ok" : "warn", detail: `${site?.on ? "الدردشة ظاهرة في الموقع" : "الدردشة موقوفة — الزوار لا يرون زرها"} · ${d.online ? "أحد الفريق متصل الآن" : "لا أحد من الفريق متصل الآن"}`, fix: "فعّلها من لوحة التحكم ← المحادثات ← «تفعيل الدردشة الآن»." };
    }, "لوحة التحكم ← المحادثات", ""),
    run("الدردشة", "إشعارات الأجهزة", async () => {
      if (!env.PRIVATE) return { state: "fail", detail: "التخزين الخاص غير مربوط" };
      const subs = (await env.PRIVATE.get("push_subs", { type: "json" })) || [];
      return subs.length ? { detail: `${subs.length} جهاز يستقبل إشعارات الدردشة (${[...new Set(subs.map((x) => x.user).filter(Boolean))].join("، ")})` }
        : { state: "warn", detail: "لا يوجد جهاز مفعّل لاستقبال الإشعارات — ستصلك الرسائل على البريد فقط", fix: "لوحة التحكم ← المحادثات ← «🔔 فعّل الإشعارات على هذا الجهاز»." };
    }, "لوحة التحكم ← المحادثات", ""),
    run("الفريق", "أعضاء لوحة التحكم", async () => {
      const r = await rpcToken(env, "team_list", {});
      if (r.status === 404) return { state: "fail", detail: "تحديث الفريق غير مطبّق", fix: "طبّق ملف supabase/migrations/20261108000000_team_roles.sql في محرر SQL." };
      if (!r.ok) return { state: "fail", detail: `مرفوض (${r.status})` };
      const list = await r.json();
      const noMfa = list.filter((m) => !m.mfa).map((m) => m.email);
      return { state: noMfa.length ? "warn" : "ok", detail: `${list.length} عضو · ${noMfa.length ? `بدون تحقق بخطوتين: ${noMfa.join("، ")}` : "الجميع مفعّل التحقق بخطوتين"}`, fix: "اطلب من العضو تفعيل التحقق بخطوتين من صفحة الحساب." };
    }, "لوحة التحكم ← الفريق والصلاحيات", ""),
    // 6. analytics
    run("الإحصاءات", "إحصاءات الزوار (Cloudflare)", async () => {
      if (!env.CF_ANALYTICS_TOKEN || !env.CF_SITE_TAG) return { state: "fail", detail: "المفتاح أو معرّف الموقع غير موجود" };
      const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ query: `query($a:String!){viewer{accounts(filter:{accountTag:$a}){accountTag}}}`, variables: { a: env.CF_ACCOUNT_ID } }) });
      const d = await r.json().catch(() => ({}));
      if (/rate limit/i.test(JSON.stringify(d.errors || ""))) return { state: "warn", detail: "Cloudflare مشغول مؤقتاً (حدّ الطلبات) — يعود خلال دقائق" };
      return d?.data?.viewer?.accounts?.length ? { detail: "المفتاح صالح" } : { state: "fail", detail: "المفتاح مرفوض أو منتهي", fix: "أنشئ API Token بصلاحية Account Analytics: Read وضعه في CF_ANALYTICS_TOKEN." };
    }, "Cloudflare ← My Profile ← API Tokens", ""),
    // 7. site files and pages
    run("الموقع", "ملفات الموقع (التصميم والبرمجة والخط)", async () => {
      const files = ["/build/site.js", "/build/site.css", "/build/shared.js", "/build/admin.js", "/fonts/alexandria.css", "/logo.svg"];
      const res = await Promise.all(files.map((f) => env.ASSETS.fetch(new Request(origin + f)).then((r) => [f, r.status, r.headers.get("content-type") || ""])));
      const bad = res.filter(([f, s, ct]) => s !== 200 || (f.endsWith(".js") && !/javascript/.test(ct)) || (f.endsWith(".css") && !/css/.test(ct)));
      return bad.length ? { state: "fail", detail: `مشكلة في: ${bad.map(([f, s]) => `${f} (${s})`).join("، ")}`, fix: "غالباً فشل البناء الأخير: افتح Cloudflare ← Workers ← Deployments وراجع سجل البناء (Build log)." } : { detail: `الملفات الأساسية الستة سليمة` };
    }, "Cloudflare ← Workers ← Deployments", ""),
    run("الموقع", "المحتوى المحفوظ مؤقتاً", async () => {
      const [, t] = await ms(() => loadFromSupabase(env));
      const age = memo.at ? Math.round((Date.now() - memo.at) / 1000) : null;
      return { state: t > 2000 ? "warn" : "ok", detail: `تحميل المحتوى من قاعدة البيانات ${t}ms${age !== null ? ` · عمر النسخة المعروضة ${age} ثانية` : ""}`, fix: "إذا لم تظهر تعديلاتك: لوحة التحكم ← التكاملات ← «تحديث الآن»." };
    }, "", ""),
    run("الموقع", "الصفحة الرئيسية", async () => {
      const [r, t] = await ms(() => handleHome(new Request(origin + "/"), env, ctx));
      const html = await r.text();
      const ok = r.status === 200 && html.includes('id="wixa-data"');
      return ok ? { state: t > 1500 ? "warn" : "ok", detail: `تُبنى خلال ${t}ms`, fix: "بطء: افحص «الاتصال بـ Supabase» أعلاه." } : { state: "fail", detail: `حالة ${r.status}${r.status === 503 ? " — وضع الصيانة مفعّل؟" : ""}`, fix: "إن كان وضع الصيانة مفعّلاً أوقفه من التكاملات؛ وإلا راجع سجل الأعطال أدناه." };
    }, "src/pages.js ← handleHome · سجلات Cloudflare ← Workers ← Logs", "راجع سجل الأعطال أدناه وسجلات الخادم في Cloudflare."),
  ]);

  // 8. scheduled jobs, backups, SEO, maintenance
  const [mon, last, cfg] = await Promise.all([
    env.PRIVATE ? env.PRIVATE.get("monitor", { type: "json" }).catch(() => null) : null,
    env.PRIVATE ? env.PRIVATE.get("backup:last", { type: "json" }).catch(() => null) : null,
    getConfig(env),
  ]);
  if (staging) add("المهام المجدولة", "المراقبة والتقارير", "ok", "النسخة التجريبية لا تشغّل مهاماً مجدولة (هذا مقصود)", "", "");
  else {
    const age = mon?.at ? (Date.now() - Date.parse(mon.at)) / 60000 : Infinity;
    add("المهام المجدولة", "المراقبة كل 15 دقيقة", !cfg.reports.monitor ? "warn" : age < 40 ? (mon.state === "down" ? "fail" : "ok") : "fail",
      !cfg.reports.monitor ? "موقوفة من الإعدادات ← التكاملات" : age < 40 ? `آخر فحص قبل ${Math.round(age)} دقيقة${mon.state === "down" ? ` — رصدت مشكلة: ${(mon.problems || []).join("، ")}` : " — كل شيء سليم"}` : "لم تعمل منذ أكثر من 40 دقيقة",
      "Cloudflare ← Workers ← wixa ← Settings ← Triggers", "تأكد من وجود الجداول الزمنية (Cron Triggers) الثلاثة؛ تُضاف تلقائياً من wrangler.toml عند النشر.");
  }
  const bAge = last?.at ? (Date.now() - Date.parse(last.at)) / 864e5 : Infinity;
  const maxAge = { daily: 1.2, weekly: 7.5, monthly: 32 }[cfg.backup.freq];
  add("المهام المجدولة", "النسخة الاحتياطية", cfg.backup.freq === "off" ? "warn" : !last ? "warn" : bAge > maxAge ? "fail" : "ok",
    cfg.backup.freq === "off" ? "متوقفة" : last ? `آخر نسخة قبل ${bAge < 1 ? `${Math.round(bAge * 24)} ساعة` : `${Math.round(bAge)} يوم`} (${Math.round((last.size || 0) / 1024)} KB)` : "لم تُرسل أي نسخة بعد",
    "لوحة التحكم ← الإعدادات ← النسخ الاحتياطي", "اضغط «أرسل نسخة الآن» للتأكد؛ إن فشلت فالعطل في البريد (انظر فحص Resend).");
  if (cfg.maintenance.on) add("الموقع", "وضع الصيانة", "warn", "مفعّل — الزوار يرون صفحة «نعود قريباً»", "لوحة التحكم ← الإعدادات ← الحماية", "أوقفه عند الانتهاء.");
  let seo = {};
  try { seo = JSON.parse(memo.text || "{}").settings?.seo || {}; } catch {}
  add("محركات البحث", "الظهور في Google", seo.index === false ? "fail" : seo.google_verification ? "ok" : "warn",
    seo.index === false ? "الفهرسة موقوفة — الموقع لن يظهر في البحث" : seo.google_verification ? "الفهرسة مسموحة وGoogle مربوط" : "الفهرسة مسموحة لكن Google Search Console غير مربوط",
    "لوحة التحكم ← البحث والمشاركة", seo.index === false ? "فعّل «السماح لمحركات البحث»." : "اربط Google Search Console من نفس الصفحة.");

  // 9. recent errors
  const errs = [...errBuf.list, ...(((env.PRIVATE && (await env.PRIVATE.get("errors", { type: "json" }).catch(() => null))) || []))];
  const recent = errs.filter((e) => Date.now() - Date.parse(e.last) < 864e5);
  add("الأعطال", "أخطاء آخر 24 ساعة", recent.length ? (recent.some((e) => e.where === "server") ? "fail" : "warn") : "ok",
    recent.length ? `${recent.reduce((a, e) => a + (e.count || 1), 0)} خطأ (${recent.filter((e) => e.where === "server").length} نوع في الخادم، ${recent.filter((e) => e.where !== "server").length} في المتصفح) — التفاصيل في السجل أدناه` : "لا أخطاء مسجّلة",
    "سجل الأعطال أدناه", "أرسل تفاصيل الخطأ (النص والمكان) للمطور؛ دليل المطور يشرح أين يوجد كل جزء.");

  const order = ["الخادم", "قاعدة البيانات", "البريد", "الحماية", "الإحصاءات", "الموقع", "المهام المجدولة", "محركات البحث", "الأعطال"];
  R.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return json({ checked_at: new Date().toISOString(), env: env.SITE_ENV || "production", results: R }, 200, { "cache-control": "no-store" });
}
