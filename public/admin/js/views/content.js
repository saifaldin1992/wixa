/* Content: texts, story, process, stats, calculator, sections, brand, contact */
import { $, $$, I, ICONS, esc, savedJSON, sb, setSaved, settings, toast } from "../core.js";
import { PRIVACY_DEFAULTS } from "../../../js/privacy-defaults.js";
import { UI_DEFAULTS } from "../../../js/ui-strings.js";

// interface texts the owner can change (button labels, menu, form messages)
const UI_GROUPS = [["القائمة والتذييل", ["nav_home", "nav_projects", "nav_services", "nav_calc", "nav_partners", "nav_careers", "nav_contact", "nav_blog", "privacy"]], ["نموذج التواصل", ["f_name", "f_email", "f_phone", "f_service", "f_any", "f_message", "f_send", "or_wa", "sending", "invalid", "bad_phone", "err", "done_title", "done_text", "done_again"]], ["الحاسبة والخدمات والمشاريع", ["calc_est", "calc_pdf", "calc_wa", "more", "page", "no_projects"]], ["حجز المواعيد", ["bk_btn", "bk_title", "bk_day", "bk_time", "bk_pick_day", "bk_none", "bk_pick_time", "bk_taken", "bk_notes", "bk_send", "bk_ok"]], ["التقديم على وظيفة", ["j_title", "j_job", "j_general", "j_cv", "j_about", "j_send", "j_ok"]]];
import { imageField } from "../fields.js";
import { bindPreview, changed, getPath, previewLang, previewPane, pushPreview, setPath, setPreviewLang, settingsActions } from "../settings.js";

// ---------------- view: content ----------------
export let contentTab = "texts", contentLang = "ar";
export const TEXT_FIELDS = [
  ["القسم الرئيسي (أعلى الصفحة)", [["hero_badge", "الشارة الصغيرة"], ["hero_title", "العنوان الرئيسي"], ["hero_sub", "الوصف", true], ["hero_cta", "زر 1"], ["hero_cta2", "زر 2"]]],
  ["قسم الإنجازات", [["projects_title", "العنوان"], ["projects_sub", "الوصف", true]]],
  ["قسم الخدمات", [["services_title", "العنوان"], ["services_sub", "الوصف", true], ["wa_ask", "زر «اسأل عبر واتساب» تحت كل خدمة"]]],
  ["قسم كيف نعمل", [["process_title", "العنوان"], ["process_sub", "الوصف", true]]],
  ["قسم الأرقام", [["stats_title", "العنوان"]]],
  ["قسم آراء العملاء", [["testimonials_title", "العنوان"], ["testimonials_sub", "الوصف", true]]],
  ["حاسبة التكلفة", [["calc_title", "العنوان"], ["calc_sub", "الوصف", true], ["calc_type", "عنوان نوع المشروع"], ["calc_features", "عنوان الميزات"], ["calc_speed", "عنوان المدة"], ["calc_normal", "مدة عادية"], ["calc_rush", "مدة مستعجلة"], ["calc_result", "عنوان النتيجة"], ["calc_note", "الملاحظة", true], ["calc_cta", "نص الزر"]]],
  ["تفاصيل المشاريع", [["details", "زر عرض التفاصيل"], ["similar", "زر طلب مشروع مشابه"]]],
  ["قسم الشركاء", [["partners_title", "العنوان"], ["partners_sub", "الوصف", true]]],
  ["قسم الوظائف", [["careers_title", "العنوان"], ["careers_sub", "الوصف", true], ["careers_empty", "النص عند عدم وجود شواغر", true], ["careers_apply", "زر التقديم"], ["careers_general", "زر إرسال السيرة الذاتية"]]],
  ["قسم الأسئلة الشائعة", [["faq_title", "العنوان"], ["faq_sub", "الوصف", true]]],
  ["قسم التواصل", [["cta_title", "العنوان"], ["cta_sub", "الوصف", true], ["cta_button", "نص الزر"]]],
  ["التذييل", [["footer_text", "النص"]]],
];

export async function viewContent(view) {
  settingsActions();
  const tabs = [["texts", "النصوص"], ["about", "من نحن"], ["industries", "حلول حسب المجال"], ["pricing", "الباقات والأسعار"], ["guarantees", "الضمانات"], ["story", "القصة (المميزات)"], ["process", "خطوات العمل"], ["stats", "الأرقام"], ["calc", "حاسبة التكلفة"], ["faq", "الأسئلة الشائعة"], ["careers", "الوظائف"], ["privacy", "سياسة الخصوصية"], ["booking", "المواعيد"], ["ui", "نصوص الأزرار والقوائم"], ["sections", "إظهار الأقسام"], ["brand", "الهوية"], ["contact", "التواصل"]];
  view.innerHTML = `<div class="split"><div><div class="card">
      <div class="tabs" id="ctTabs">${tabs.map(([k, l]) => `<button data-k="${k}" class="${k === contentTab ? "on" : ""}">${l}</button>`).join("")}</div>
      <div id="ctBody"></div></div></div>${previewPane()}</div>`;
  bindPreview();
  $$("#ctTabs button").forEach((b) => (b.onclick = () => { contentTab = b.dataset.k; $$("#ctTabs button").forEach((x) => x.classList.toggle("on", x === b)); renderContentTab(); }));
  renderContentTab();
}

export function langSeg() {
  return `<div class="seg" id="ctLang" style="margin-bottom:14px"><button data-v="ar" class="${contentLang === "ar" ? "on" : ""}">العربية</button><button data-v="en" class="${contentLang === "en" ? "on" : ""}">English</button></div>`;
}
export function bindLangSeg() {
  $$("#ctLang button").forEach((b) => (b.onclick = () => {
    contentLang = b.dataset.v; setPreviewLang(contentLang);
    $$("#pvLang button").forEach((x) => x.classList.toggle("on", x.dataset.v === previewLang)); pushPreview(true); renderContentTab();
  }));
}
export function bindPathInputs(root) {
  $$("[data-path]", root).forEach((el) => {
    const ev = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(ev, () => { setPath(settings, el.dataset.path, el.type === "checkbox" ? el.checked : el.value); changed(); });
  });
}
export function renderContentTab() {
  const body = $("#ctBody"), L = contentLang, dir = L === "ar" ? "rtl" : "ltr";
  const input = (path, label, area = false, attrs = "") => {
    const v = esc(getPath(settings, path) ?? "");
    return `<label class="f"><span>${label}</span>${area ? `<textarea data-path="${path}" rows="3" ${attrs}>${v}</textarea>` : `<input data-path="${path}" value="${v}" ${attrs}>`}</label>`;
  };
  if (contentTab === "texts") {
    body.innerHTML = langSeg() + `<div class="stack">${TEXT_FIELDS.map(([title, fields]) => `<div class="sec-title">${title}</div>${fields.map(([k, l, a]) => input(`content.${L}.${k}`, l, a, `dir="${dir}"`)).join("")}`).join("")}</div>`;
    bindLangSeg();
  } else if (contentTab === "story") {
    const items = settings.content[L].story;
    body.innerHTML = langSeg() + `<p class="muted" style="margin-top:0">ثلاث بطاقات تظهر تحت القسم الرئيسي مع رسوم متحركة.</p><div class="stack">${items.map((_, i) => `<div class="sec-title">البطاقة ${i + 1}</div>${input(`content.${L}.story.${i}.title`, "العنوان", false, `dir="${dir}"`)}${input(`content.${L}.story.${i}.text`, "النص", true, `dir="${dir}"`)}`).join("")}</div>`;
    bindLangSeg();
  } else if (contentTab === "stats") {
    const draw = () => {
      body.innerHTML = `<p class="muted" style="margin-top:0">الأرقام التي تظهر في القسم الداكن مع عدّاد متحرك.</p>
        <div class="stats-rep">${settings.stats.map((s, i) => `<div class="stats-rep__row wide">
          <input class="fi" data-i="${i}" data-k="value" type="number" value="${esc(s.value)}" placeholder="الرقم">
          <input class="fi" data-i="${i}" data-k="suffix" value="${esc(s.suffix)}" placeholder="+ أو %" dir="ltr">
          <input class="fi" data-i="${i}" data-k="label_ar" value="${esc(s.label_ar)}" placeholder="الوصف بالعربي">
          <input class="fi" data-i="${i}" data-k="label_en" value="${esc(s.label_en)}" placeholder="English label" dir="ltr">
          <button class="b b--icon b--ghost b--danger" data-del="${i}" title="حذف">${I.trash}</button></div>`).join("")}</div>
        <button class="b b--sm" id="addStat" style="margin-top:12px">${I.plus}إضافة رقم</button>`;
      $$(".fi", body).forEach((el) => { el.classList.add("f"); el.style.cssText = "height:38px;padding:0 10px;border:1px solid var(--line-2);border-radius:10px;width:100%;min-width:0"; el.oninput = () => { settings.stats[el.dataset.i][el.dataset.k] = el.dataset.k === "value" ? Number(el.value) : el.value; changed(); }; });
      $$("[data-del]", body).forEach((b) => (b.onclick = () => { settings.stats.splice(+b.dataset.del, 1); changed(); draw(); }));
      $("#addStat").onclick = () => { settings.stats.push({ value: 0, suffix: "+", label_ar: "", label_en: "" }); changed(); draw(); };
    };
    draw(); return;
  } else if (["about", "industries", "pricing", "guarantees"].includes(contentTab)) {
    // the sales sections: a few texts and a list of cards, per language
    const SPEC = {
      about: { head: [["about_title", "العنوان"], ["about_text", "النص (افصل الفقرات بسطر فارغ)", 8]], list: "about_points", item: "نقطة", fields: [["title", "العنوان"], ["text", "النص", 2]],
        note: "قسم «من نحن» يظهر بعد القصة. اكتب قصة شركتك ورؤيتها، وثلاث نقاط تميّزكم." },
      industries: { head: [["industries_title", "العنوان"], ["industries_sub", "الوصف", 2]], list: "industries", item: "مجال", fields: [["title", "اسم المجال"], ["text", "ماذا نبني لهذا المجال", 3], ["price", "السعر (مثل: يبدأ من 1,500$)"], ["icon", "الأيقونة", "icon"]],
        note: "بطاقة لكل مجال، وزر «اطلب حلّك» يفتح نموذج التواصل باسم المجال." },
      pricing: { head: [["pricing_title", "العنوان"], ["pricing_sub", "الوصف", 2], ["pricing_note", "ملاحظة أسفل الباقات", 2]], list: "packages", item: "باقة",
        fields: [["name", "اسم الباقة"], ["price", "السعر (مثل 1,500$ أو «حسب الطلب»)"], ["from", "اكتب «يبدأ من» قبل السعر", "check"], ["featured", "باقة مميزة (إطار ملوّن)", "check"], ["desc", "وصف قصير", 2], ["features", "ما تشمله (كل ميزة في سطر)", 5]],
        note: "زر «اطلب هذه الباقة» يفتح نموذج التواصل باسم الباقة. الأسعار تقديرية — عدّلها كما تشاء." },
      guarantees: { head: [["guarantees_title", "العنوان"], ["guarantees_sub", "الوصف", 2]], list: "guarantees", item: "ضمان", fields: [["title", "العنوان"], ["text", "النص", 2]],
        note: "ضماناتك وشروطك التي تطمئن الزبون: الدفعات، الدعم، الملكية…" },
    }[contentTab];
    const draw = () => {
      const c = settings.content[L], items = c[SPEC.list] || (c[SPEC.list] = []);
      const field = (i, [k, label, kind]) => kind === "check"
        ? `<label class="switch"><input type="checkbox" data-path="content.${L}.${SPEC.list}.${i}.${k}" ${items[i][k] ? "checked" : ""}><i></i>${label}</label>`
        : kind === "icon"
          ? `<label class="f"><span>${label}</span><select data-path="content.${L}.${SPEC.list}.${i}.${k}">${Object.keys(window.WIXA.ICONS).map((n) => `<option ${items[i][k] === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`
          : input(`content.${L}.${SPEC.list}.${i}.${k}`, label, !!kind, `dir="${dir}" ${kind ? `rows="${kind}"` : ""}`);
      body.innerHTML = langSeg() + `<p class="muted" style="margin-top:0">${SPEC.note}</p><div class="stack">
        ${SPEC.head.map(([k, label, rows]) => input(`content.${L}.${k}`, label, !!rows, `dir="${dir}" ${rows ? `rows="${rows}"` : ""}`)).join("")}
        ${items.map((_, i) => `<div class="sec-title">${SPEC.item} ${i + 1} <span><button class="b b--sm b--ghost" data-up="${i}" title="للأعلى" ${i ? "" : "disabled"}>↑</button><button class="b b--sm b--ghost b--danger" data-del="${i}">${I.trash}</button></span></div>${SPEC.fields.map((f) => field(i, f)).join("")}`).join("")}
        </div><button class="b b--sm" id="addItem" style="margin-top:12px">${I.plus}إضافة ${SPEC.item}</button>`;
      bindLangSeg(); bindPathInputs(body);
      $$("[data-del]", body).forEach((b) => (b.onclick = () => { items.splice(+b.dataset.del, 1); changed(); draw(); }));
      $$("[data-up]", body).forEach((b) => (b.onclick = () => { const i = +b.dataset.up; [items[i - 1], items[i]] = [items[i], items[i - 1]]; changed(); draw(); }));
      $("#addItem").onclick = () => { items.push(Object.fromEntries(SPEC.fields.map(([k, , kind]) => [k, kind === "check" ? false : kind === "icon" ? "web" : ""]))); changed(); draw(); };
    };
    draw(); return;
  } else if (contentTab === "process") {
    const draw = () => {
      const items = settings.content[L].process || (settings.content[L].process = []);
      body.innerHTML = langSeg() + `<p class="muted" style="margin-top:0">خطوات تضيء واحدة تلو الأخرى مع التمرير. يُفضّل 3 إلى 5 خطوات.</p><div class="stack">${items.map((_, i) => `<div class="sec-title">الخطوة ${i + 1} <button class="b b--sm b--ghost b--danger" data-del="${i}">${I.trash}</button></div>${input(`content.${L}.process.${i}.title`, "العنوان", false, `dir="${dir}"`)}${input(`content.${L}.process.${i}.text`, "النص", true, `dir="${dir}"`)}`).join("")}</div>
        <button class="b b--sm" id="addStep" style="margin-top:12px">${I.plus}إضافة خطوة</button>`;
      bindLangSeg(); bindPathInputs(body);
      $$("[data-del]", body).forEach((b) => (b.onclick = () => { items.splice(+b.dataset.del, 1); changed(); draw(); }));
      $("#addStep").onclick = () => { items.push({ title: "", text: "" }); changed(); draw(); };
    };
    draw(); return;
  } else if (contentTab === "faq") {
    const draw = () => {
      const items = settings.content[L].faq || (settings.content[L].faq = []);
      body.innerHTML = langSeg() + `<p class="muted" style="margin-top:0">أسئلة وأجوبة تظهر قبل قسم التواصل، ويقرؤها Google أيضاً. راجع الإجابات لتطابق طريقة عملكم.</p><div class="stack">${items.map((_, i) => `<div class="sec-title">السؤال ${i + 1} <span><button class="b b--sm b--ghost" data-mv="${i}" data-d="-1" ${i ? "" : "disabled"} title="أعلى">${I.up}</button><button class="b b--sm b--ghost" data-mv="${i}" data-d="1" ${i < items.length - 1 ? "" : "disabled"} title="أسفل">${I.down}</button><button class="b b--sm b--ghost b--danger" data-del="${i}">${I.trash}</button></span></div>${input(`content.${L}.faq.${i}.q`, "السؤال", false, `dir="${dir}"`)}${input(`content.${L}.faq.${i}.a`, "الإجابة", true, `dir="${dir}"`)}`).join("")}</div>
        <button class="b b--sm" id="addFaq" style="margin-top:12px">${I.plus}إضافة سؤال</button>`;
      bindLangSeg(); bindPathInputs(body);
      $$("[data-del]", body).forEach((b) => (b.onclick = () => { items.splice(+b.dataset.del, 1); changed(); draw(); }));
      $$("[data-mv]", body).forEach((b) => (b.onclick = () => { const i = +b.dataset.mv, j = i + +b.dataset.d; [items[i], items[j]] = [items[j], items[i]]; changed(); draw(); }));
      $("#addFaq").onclick = () => { items.push({ q: "", a: "" }); changed(); draw(); };
    };
    draw(); return;
  } else if (contentTab === "ui") {
    settings.ui ??= { ar: {}, en: {} };
    settings.ui[L] ??= {};
    const cur = settings.ui[L];
    body.innerHTML = langSeg() + `<p class="muted" style="margin-top:0">نصوص الأزرار والقائمة ورسائل النماذج. اترك الحقل فارغاً لاستخدام النص الأصلي (الظاهر باهتاً داخله).</p>
      <div class="stack">${UI_GROUPS.map(([title, keys]) => `<div class="sec-title">${title}</div><div class="grid2">${keys.map((k) => `<label class="f"><span>${esc(UI_DEFAULTS.ar[k] || k)}</span><input data-ui="${k}" value="${esc(cur[k] || "")}" placeholder="${esc(UI_DEFAULTS[L][k] || "")}" dir="${dir}"></label>`).join("")}</div>`).join("")}</div>
      <button class="b b--sm b--ghost" id="uiReset" style="margin-top:12px">${I.reset}إرجاع كل النصوص الأصلية (${L === "ar" ? "العربي" : "English"})</button>`;
    bindLangSeg();
    $$("[data-ui]", body).forEach((el) => (el.oninput = () => { const v = el.value; if (v.trim()) cur[el.dataset.ui] = v; else delete cur[el.dataset.ui]; changed(); }));
    $("#uiReset").onclick = () => { settings.ui[L] = {}; changed(); renderContentTab(); };
    return;
  } else if (contentTab === "booking") {
    settings.booking ??= { on: false, days: [0, 1, 2, 3, 4], from: "10:00", to: "16:00", slot: 30, days_ahead: 14 };
    const b = settings.booking;
    const names = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    body.innerHTML = `<p class="muted" style="margin-top:0">زر «احجز موعداً» في قسم التواصل: يختار الزائر يوماً ووقتاً من أوقاتك المتاحة (بتوقيت بغداد)، ويصلك الحجز في الرسائل وبالبريد. الوقت المحجوز لا يظهر لغيره.</p>
      <div class="stack">
        <label class="switch"><input type="checkbox" data-path="booking.on" ${b.on ? "checked" : ""}><i></i>تفعيل حجز المواعيد في الموقع</label>
        <div class="f"><span>أيام العمل</span><div style="display:flex;flex-wrap:wrap;gap:6px">${names.map((n, i) => `<label class="chip"><input type="checkbox" data-day="${i}" ${(b.days || []).includes(i) ? "checked" : ""}><span>${n}</span></label>`).join("")}</div></div>
        <div class="grid2">${input("booking.from", "من الساعة", false, 'type="time" dir="ltr"')}${input("booking.to", "إلى الساعة", false, 'type="time" dir="ltr"')}</div>
        <div class="grid2"><label class="f"><span>مدة الموعد</span><select data-path="booking.slot">${[15, 20, 30, 45, 60, 90].map((m) => `<option value="${m}" ${Number(b.slot) === m ? "selected" : ""}>${m} دقيقة</option>`).join("")}</select></label>
        <label class="f"><span>يمكن الحجز حتى</span><select data-path="booking.days_ahead">${[7, 14, 21, 30, 60].map((d) => `<option value="${d}" ${Number(b.days_ahead) === d ? "selected" : ""}>${d} يوماً قادمة</option>`).join("")}</select></label></div>
        <p class="muted" style="margin:0;font-size:12px">لا يُعرض وقت يبدأ خلال أقل من ساعة من الآن.</p>
      </div>`;
    bindPathInputs(body);
    $$("[data-path='booking.slot'], [data-path='booking.days_ahead']", body).forEach((el) => el.addEventListener("change", () => { setPath(settings, el.dataset.path, Number(el.value)); changed(); }));
    $$("[data-day]", body).forEach((el) => (el.onchange = () => { const d = +el.dataset.day; b.days = el.checked ? [...new Set([...(b.days || []), d])].sort() : (b.days || []).filter((x) => x !== d); changed(); }));
    return;
  } else if (contentTab === "privacy") {
    const draw = () => {
      // first open: start from the current default wording (saved only when you press «حفظ ونشر»)
      if (!settings.privacy) {
        const clean = JSON.stringify(settings) === savedJSON; // filling in the defaults is not an unsaved change
        settings.privacy = structuredClone(PRIVACY_DEFAULTS);
        if (clean) setSaved(JSON.stringify(settings));
      }
      const pv = settings.privacy;
      const items = pv[L] || (pv[L] = structuredClone(PRIVACY_DEFAULTS[L]));
      body.innerHTML = langSeg() + `<p class="muted" style="margin-top:0">نص صفحة <a href="/privacy?lang=${L}" target="_blank" rel="noopener" dir="ltr">/privacy</a>. اكتب <code>{email}</code> ليظهر بريد التواصل كرابط. إذا شغّلت أدوات إعلانات من «التكاملات» تُضاف فقرة عنها تلقائياً.</p>
        <label class="f" style="max-width:240px"><span>تاريخ آخر تحديث</span><input type="date" data-path="privacy.updated" value="${esc(pv.updated || "")}" dir="ltr"></label>
        <div class="stack" style="margin-top:12px">${items.map((_, i) => `<div class="sec-title">الفقرة ${i + 1} <span><button class="b b--sm b--ghost" data-mv="${i}" data-d="-1" ${i ? "" : "disabled"} title="أعلى">${I.up}</button><button class="b b--sm b--ghost" data-mv="${i}" data-d="1" ${i < items.length - 1 ? "" : "disabled"} title="أسفل">${I.down}</button><button class="b b--sm b--ghost b--danger" data-del="${i}">${I.trash}</button></span></div>${input(`privacy.${L}.${i}.h`, "العنوان", false, `dir="${dir}"`)}${input(`privacy.${L}.${i}.p`, "النص", true, `dir="${dir}" rows="4"`)}`).join("")}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"><button class="b b--sm" id="addPv">${I.plus}إضافة فقرة</button><button class="b b--sm b--ghost" id="resetPv">${I.reset}استعادة النص الافتراضي (${L === "ar" ? "العربي" : "English"})</button></div>`;
      bindLangSeg(); bindPathInputs(body);
      $$("[data-del]", body).forEach((b) => (b.onclick = () => { items.splice(+b.dataset.del, 1); changed(); draw(); }));
      $$("[data-mv]", body).forEach((b) => (b.onclick = () => { const i = +b.dataset.mv, j = i + +b.dataset.d; [items[i], items[j]] = [items[j], items[i]]; changed(); draw(); }));
      $("#addPv").onclick = () => { items.push({ h: "", p: "" }); changed(); draw(); };
      $("#resetPv").onclick = () => { pv[L] = structuredClone(PRIVACY_DEFAULTS[L]); changed(); draw(); };
    };
    draw(); return;
  } else if (contentTab === "careers") {
    const draw = () => {
      settings.careers ??= { jobs: [] };
      const jobs = settings.careers.jobs || (settings.careers.jobs = []);
      body.innerHTML = `<p class="muted" style="margin-top:0">الشواغر التي تظهر في قسم «انضم إلى فريقنا». إن لم تضف أي وظيفة يظهر زر «أرسل سيرتك الذاتية» فقط. الطلبات تصلك في صفحة الرسائل ← طلبات التوظيف.</p>
        <div class="stack">${jobs.map((j, i) => `<div class="sec-title">الوظيفة ${i + 1} <span><label class="switch" style="font-size:13px"><input type="checkbox" data-path="careers.jobs.${i}.open" ${j.open !== false ? "checked" : ""}><i></i>معروضة</label> <button class="b b--sm b--ghost b--danger" data-del="${i}">${I.trash}</button></span></div>
          <div class="grid2">${input(`careers.jobs.${i}.title_ar`, "المسمى الوظيفي (عربي)", false, 'placeholder="مثال: مطوّر واجهات أمامية"')}${input(`careers.jobs.${i}.title_en`, "Job title (English)", false, 'dir="ltr" placeholder="e.g. Frontend developer"')}
          ${input(`careers.jobs.${i}.type_ar`, "نوع الدوام (عربي)", false, 'placeholder="دوام كامل / جزئي / عن بُعد"')}${input(`careers.jobs.${i}.type_en`, "Type (English)", false, 'dir="ltr" placeholder="Full-time / Part-time / Remote"')}
          ${input(`careers.jobs.${i}.location_ar`, "المكان (عربي)", false, 'placeholder="بغداد"')}${input(`careers.jobs.${i}.location_en`, "Location (English)", false, 'dir="ltr" placeholder="Baghdad"')}
          ${input(`careers.jobs.${i}.desc_ar`, "الوصف والمتطلبات (عربي)", true)}${input(`careers.jobs.${i}.desc_en`, "Description (English)", true, 'dir="ltr"')}</div>`).join("")}</div>
        <button class="b b--sm" id="addJob" style="margin-top:12px">${I.plus}إضافة وظيفة</button>`;
      bindPathInputs(body);
      $$("[data-del]", body).forEach((b) => (b.onclick = () => { jobs.splice(+b.dataset.del, 1); changed(); draw(); }));
      $("#addJob").onclick = () => { jobs.push({ title_ar: "", title_en: "", type_ar: "", type_en: "", location_ar: "", location_en: "", desc_ar: "", desc_en: "", open: true }); changed(); draw(); };
    };
    draw(); return;
  } else if (contentTab === "calc") {
    const c = settings.calculator;
    const draw = () => {
      const row = (kind, x, i) => `<div class="stats-rep__row wide" style="grid-template-columns:${kind === "types" ? "78px " : ""}1.5fr 1.5fr 74px 74px 34px;gap:6px">
        ${kind === "types" ? `<select class="fi" data-kind="${kind}" data-i="${i}" data-k="icon">${Object.keys(ICONS).map((k) => `<option ${x.icon === k ? "selected" : ""}>${k}</option>`).join("")}</select>` : ""}
        <input class="fi" data-kind="${kind}" data-i="${i}" data-k="label_ar" value="${esc(x.label_ar)}" placeholder="الاسم بالعربي">
        <input class="fi" data-kind="${kind}" data-i="${i}" data-k="label_en" value="${esc(x.label_en)}" placeholder="English" dir="ltr">
        <input class="fi" data-kind="${kind}" data-i="${i}" data-k="min" type="number" value="${esc(x.min)}" placeholder="من" dir="ltr">
        <input class="fi" data-kind="${kind}" data-i="${i}" data-k="max" type="number" value="${esc(x.max)}" placeholder="إلى" dir="ltr">
        <button class="b b--icon b--ghost b--danger" data-kind="${kind}" data-del="${i}">${I.trash}</button></div>`;
      body.innerHTML = `<p class="muted" style="margin-top:0">⚠️ الأسعار هنا تقديرية تظهر للزوار — راجعها وضع أسعار شركتك قبل النشر على الموقع الرئيسي. كل سعر هو نطاق (من — إلى).</p>
        <div class="grid2"><label class="f"><span>رمز العملة</span><input class="fi" data-root="currency" value="${esc(c.currency)}" dir="ltr"></label>
        <label class="f"><span>معامل التنفيذ المستعجل (مثلاً 1.3 = +30%)</span><input class="fi" data-root="rush" type="number" step="0.05" value="${esc(c.rush)}" dir="ltr"></label></div>
        <div class="sec-title">أنواع المشاريع (السعر الأساسي)</div><div class="stats-rep">${c.types.map((x, i) => row("types", x, i)).join("")}</div>
        <button class="b b--sm" data-add="types" style="margin-top:8px">${I.plus}إضافة نوع</button>
        <div class="sec-title" style="margin-top:18px">الميزات الإضافية (تُضاف للسعر)</div><div class="stats-rep">${c.features.map((x, i) => row("features", x, i)).join("")}</div>
        <button class="b b--sm" data-add="features" style="margin-top:8px">${I.plus}إضافة ميزة</button>`;
      $$(".fi", body).forEach((el) => {
        el.style.cssText = "height:38px;padding:0 10px;border:1px solid var(--line-2);border-radius:10px;width:100%;min-width:0;background:#fff";
        el.oninput = el.onchange = () => {
          const num = el.type === "number";
          if (el.dataset.root) c[el.dataset.root] = num ? Number(el.value) : el.value;
          else c[el.dataset.kind][el.dataset.i][el.dataset.k] = num ? Number(el.value) : el.value;
          changed();
        };
      });
      $$("[data-del]", body).forEach((b) => (b.onclick = () => { c[b.dataset.kind].splice(+b.dataset.del, 1); changed(); draw(); }));
      $$("[data-add]", body).forEach((b) => (b.onclick = () => { c[b.dataset.add].push(b.dataset.add === "types" ? { icon: "web", label_ar: "", label_en: "", min: 0, max: 0 } : { label_ar: "", label_en: "", min: 0, max: 0 }); changed(); draw(); }));
    };
    draw(); return;
  } else if (contentTab === "sections") {
    const names = { about: "من نحن", industries: "حلول حسب مجالك", guarantees: "الضمانات", pricing: "الباقات والأسعار", story: "القصة (المميزات)", projects: "الإنجازات (المشاريع)", services: "الخدمات", process: "كيف نعمل", stats: "الأرقام", testimonials: "آراء العملاء", calculator: "حاسبة التكلفة", partners: "الشركاء", careers: "الوظائف (انضم إلى فريقنا)", faq: "الأسئلة الشائعة", contact: "التواصل" };
    body.innerHTML = `<p class="muted" style="margin-top:0">أخفِ أي قسم لا تحتاجه. (قسما الشركاء وآراء العملاء يختفيان تلقائياً إذا كانا فارغين.)</p><div class="stack">${Object.entries(names).map(([k, l]) => `<label class="switch"><input type="checkbox" data-path="sections.${k}" ${settings.sections[k] ? "checked" : ""}><i></i>${l}</label>`).join("")}</div>
      <label class="f" style="margin-top:18px;max-width:360px"><span>لغة الموقع عند أول زيارة</span><select data-path="default_lang">
        <option value="auto" ${(settings.default_lang || "auto") === "auto" ? "selected" : ""}>حسب لغة جهاز الزائر (عربي ← عربي، غيره ← إنجليزي)</option>
        <option value="ar" ${settings.default_lang === "ar" ? "selected" : ""}>العربية دائماً</option>
        <option value="en" ${settings.default_lang === "en" ? "selected" : ""}>الإنجليزية دائماً</option></select></label>
      <label class="f" style="margin-top:18px;max-width:360px"><span>طريقة عرض الشركاء</span><select data-path="partners_style">
        <option value="grid" ${settings.partners_style !== "marquee" ? "selected" : ""}>ثابتة — ٣ شعارات في السطر</option>
        <option value="marquee" ${settings.partners_style === "marquee" ? "selected" : ""}>شريط متحرك مثل آراء العملاء</option></select></label>`;
  } else if (contentTab === "brand") {
    body.innerHTML = `<div class="stack"><div class="grid2">${input("brand.name_ar", "اسم الشركة بالعربي")}${input("brand.name_en", "اسم الشركة بالإنجليزي", false, 'dir="ltr"')}</div>
      <div class="f"><span>الشعار (اختياري — يُفضّل مربع PNG أو SVG)</span><div id="logoField"></div></div></div>`;
    $("#logoField").append(imageField(settings.brand.logo_url, "brand", (url) => { settings.brand.logo_url = url; changed(); }, true));
  } else if (contentTab === "contact") {
    body.innerHTML = `<div class="stack">
      <div class="grid2">${input("contact.email", "البريد الإلكتروني", false, 'dir="ltr" type="email"')}${input("contact.phone", "رقم الهاتف", false, 'dir="ltr" placeholder="+964 7xx xxx xxxx"')}</div>
      ${input("contact.whatsapp", "رقم واتساب (بالصيغة الدولية بدون + أو أصفار، مثل 9647701234567)", false, 'dir="ltr"')}
      <div class="grid2">${input("contact.address_ar", "العنوان بالعربي")}${input("contact.address_en", "العنوان بالإنجليزي", false, 'dir="ltr"')}</div>
      <div class="sec-title">روابط التواصل الاجتماعي</div>
      <div class="grid2">${input("contact.instagram", "Instagram", false, 'dir="ltr" placeholder="https://instagram.com/..."')}${input("contact.x", "X (Twitter)", false, 'dir="ltr" placeholder="https://x.com/..."')}
      ${input("contact.linkedin", "LinkedIn", false, 'dir="ltr"')}${input("contact.facebook", "Facebook", false, 'dir="ltr"')}</div>
      <div class="sec-title">خيارات «الخدمة المطلوبة» في نموذج تواصل معنا</div>
      <p class="muted" style="margin:0;font-size:13px">إن تركتها فارغة تظهر الخدمات المعروضة في الموقع تلقائياً. خيار «استشارة عامة» يبقى أولاً دائماً.</p>
      <div id="csList"></div></div>`;
    bindPathInputs(body);
    const list = settings.contact_services || (settings.contact_services = []);
    const drawCs = () => {
      $("#csList").innerHTML = `<div class="stack">${list.map((x, i) => `<div class="grid2 cs-row"><input class="cs" data-i="${i}" data-k="ar" value="${esc(x.ar)}" placeholder="الخيار بالعربي"><div style="display:flex;gap:6px"><input class="cs" data-i="${i}" data-k="en" value="${esc(x.en)}" placeholder="English" dir="ltr" style="flex:1"><button class="b b--icon b--ghost b--danger" data-csdel="${i}">${I.trash}</button></div></div>`).join("")}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"><button class="b b--sm" id="csAdd">${I.plus}إضافة خيار</button>${list.length ? "" : `<button class="b b--sm b--ghost" id="csCopy">نسخ الخدمات الحالية لأعدّلها</button>`}</div>`;
      $$(".cs", body).forEach((el) => { el.style.cssText += ";height:38px;padding:0 10px;border:1px solid var(--line-2);border-radius:10px;width:100%;min-width:0"; el.oninput = () => { list[el.dataset.i][el.dataset.k] = el.value; changed(); }; });
      $$("[data-csdel]", body).forEach((b) => (b.onclick = () => { list.splice(+b.dataset.csdel, 1); changed(); drawCs(); }));
      $("#csAdd").onclick = () => { list.push({ ar: "", en: "" }); changed(); drawCs(); };
      const cp = $("#csCopy");
      if (cp) cp.onclick = async () => {
        const { data, error } = await sb.from("services").select("title_ar, title_en").eq("published", true).order("sort");
        if (error) return toast("تعذّر تحميل الخدمات", "err");
        data.forEach((r) => list.push({ ar: r.title_ar || "", en: r.title_en || "" })); changed(); drawCs();
      };
    };
    drawCs();
    return;
  }
  bindPathInputs(body);
}
