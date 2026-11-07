/* Diagnostics: checks every part the site depends on, says where a problem is and what to do,
   shows the recent errors from visitors' browsers and the server, and the live connections. */
import { $, $$, adminApi, esc, toast } from "../core.js";
import { viewStatus } from "./status.js";

const ICON = { ok: "✓", warn: "!", fail: "✕" };
const LABEL = { ok: "سليم", warn: "تنبيه", fail: "عطل" };
const WHERE = { site: "متصفح الزائر (الموقع)", admin: "لوحة التحكم", server: "الخادم" };

export async function viewDiagnose(view) {
  $("#topActions").innerHTML = `<button class="b" id="importMedia" title="بعد نقل قاعدة البيانات: ينسخ الصور الناقصة من القاعدة القديمة">🖼️ نقل الصور</button><button class="b b--primary" id="runDiag">افحص الآن</button>`;
  view.innerHTML = `<div class="diag">
    <div class="card diag-sum" id="diagSum"><div class="skeleton" style="height:60px"></div></div>
    <div id="diagGroups"></div>
    <div class="card"><div class="card__head"><div><h3>سجل الأعطال</h3><p>آخر الأخطاء التي حدثت في متصفحات الزوار أو في لوحة التحكم أو في الخادم. الأخطاء المتكررة تُجمع في سطر واحد مع عددها.</p></div>
      <button class="b b--sm" id="clearErr">مسح السجل</button></div><div id="errList"><div class="skeleton" style="height:80px"></div></div></div>
    <div class="card"><div class="card__head"><div><h3>الاتصالات</h3><p>الخدمات المرتبطة بالموقع وحالتها.</p></div></div><div id="connBox"></div></div>
  </div>`;
  $("#runDiag").onclick = () => runChecks();
  $("#importMedia").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await adminApi("import-media", "POST", {});
      if (r.missing.length) console.warn("import-media", r.missing);
      toast(r.missing.length ? `نُسخت ${r.copied} صورة · تعذّر ${r.missing.length}: ${r.missing[0].slice(0, 140)}` : r.copied ? `نُسخت ${r.copied} صورة ✓` : `كل الصور (${r.present}) موجودة ✓`, r.missing.length ? "err" : "");
    } catch (err) { toast(`تعذّر النقل (${err.message})`, "err"); }
    finally { e.target.disabled = false; }
  };
  $("#clearErr").onclick = async () => { try { await adminApi("errors", "DELETE"); toast("تم مسح السجل ✓"); loadErrors(); } catch { toast("تعذّر المسح", "err"); } };
  runChecks(); loadErrors();
  const box = $("#connBox"); viewStatus(box).catch(() => {});
}

async function runChecks() {
  const btn = $("#runDiag"); if (btn) btn.disabled = true;
  $("#diagSum").innerHTML = '<p class="muted" style="margin:0">جارٍ فحص كل الأجزاء… (حتى 10 ثوانٍ)</p>';
  let d;
  try { d = await adminApi("diagnose"); } catch (e) {
    $("#diagSum").innerHTML = `<div class="diag-big fail"><span>✕</span><div><h3>تعذّر تشغيل الفحص</h3><p>${esc(e.message)} — إن تكرر فالعطل في الخادم نفسه: افتح Cloudflare ← Workers ← Logs.</p></div></div>`;
    if (btn) btn.disabled = false; return;
  }
  const n = { ok: 0, warn: 0, fail: 0 }; d.results.forEach((r) => n[r.state]++);
  const worst = n.fail ? "fail" : n.warn ? "warn" : "ok";
  const head = { ok: "كل شيء يعمل بشكل سليم", warn: "يعمل، مع تنبيهات تستحق النظر", fail: "يوجد عطل يحتاج إصلاحاً" }[worst];
  $("#diagSum").innerHTML = `<div class="diag-big ${worst}"><span>${ICON[worst]}</span><div><h3>${head}</h3>
    <p>${n.ok} سليم · ${n.warn} تنبيه · ${n.fail} عطل — ${d.env === "staging" ? "النسخة التجريبية" : "الموقع الرئيسي"} · ${new Date(d.checked_at).toLocaleString("ar-IQ", { timeStyle: "short", dateStyle: "medium" })}</p></div></div>`;
  const groups = [...new Set(d.results.map((r) => r.group))];
  $("#diagGroups").innerHTML = groups.map((g) => {
    const items = d.results.filter((r) => r.group === g);
    return `<div class="card diag-group"><h3>${esc(g)}</h3>${items.map((r) => `<div class="diag-row ${r.state}">
      <span class="diag-ico" title="${LABEL[r.state]}">${ICON[r.state]}</span>
      <div><b>${esc(r.title)}</b><p>${esc(r.detail)}</p>
        ${r.state !== "ok" && r.where ? `<p class="diag-where"><span>أين:</span> ${esc(r.where)}</p>` : ""}
        ${r.state !== "ok" && r.fix ? `<p class="diag-fix"><span>الحل:</span> ${esc(r.fix)}</p>` : ""}</div></div>`).join("")}</div>`;
  }).join("");
  // problems first
  $$(".diag-group").forEach((g) => { if (g.querySelector(".fail")) g.parentNode.prepend(g); });
  if (btn) btn.disabled = false;
}

async function loadErrors() {
  let list = [];
  try { list = await adminApi("errors"); } catch { $("#errList").innerHTML = '<p class="muted">تعذّر تحميل السجل.</p>'; return; }
  if (!list.length) { $("#errList").innerHTML = '<p class="muted" style="margin:0">لا أخطاء مسجّلة ✓</p>'; return; }
  const when = (t) => new Date(t).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
  $("#errList").innerHTML = `<div class="errs">${list.map((e) => `<div class="err ${e.where === "server" ? "fail" : "warn"}">
    <div class="err__top"><b>${esc(WHERE[e.where] || e.where)}</b><span>${e.count > 1 ? `تكرر ${e.count} مرات · ` : ""}آخرها ${when(e.last)}</span></div>
    <code dir="ltr">${esc(e.msg)}</code>
    <p>${e.path ? `الصفحة/الطلب: <span dir="ltr">${esc(e.path)}</span>` : ""}${e.src ? ` · الملف: <span dir="ltr">${esc(e.src)}</span>` : ""}</p>
    ${e.ua ? `<p class="muted" dir="ltr" style="font-size:11px">${esc(e.ua)}</p>` : ""}</div>`).join("")}</div>
    <p class="muted" style="font-size:12px;margin:10px 0 0">أرسل نص الخطأ واسم الملف للمطور؛ «دليل المطور» يشرح أين يوجد كل جزء.</p>`;
}
