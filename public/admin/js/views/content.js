/* Content: texts, story, process, stats, calculator, sections, brand, contact */
import { $, $$, I, ICONS, esc, settings } from "../core.js";
import { imageField } from "../fields.js";
import { bindPreview, changed, getPath, previewLang, previewPane, pushPreview, setPath, setPreviewLang, settingsActions } from "../settings.js";

// ---------------- view: content ----------------
export let contentTab = "texts", contentLang = "ar";
export const TEXT_FIELDS = [
  ["القسم الرئيسي (أعلى الصفحة)", [["hero_badge", "الشارة الصغيرة"], ["hero_title", "العنوان الرئيسي"], ["hero_sub", "الوصف", true], ["hero_cta", "زر 1"], ["hero_cta2", "زر 2"]]],
  ["قسم الإنجازات", [["projects_title", "العنوان"], ["projects_sub", "الوصف", true]]],
  ["قسم الخدمات", [["services_title", "العنوان"], ["services_sub", "الوصف", true]]],
  ["قسم كيف نعمل", [["process_title", "العنوان"], ["process_sub", "الوصف", true]]],
  ["قسم الأرقام", [["stats_title", "العنوان"]]],
  ["قسم آراء العملاء", [["testimonials_title", "العنوان"], ["testimonials_sub", "الوصف", true]]],
  ["حاسبة التكلفة", [["calc_title", "العنوان"], ["calc_sub", "الوصف", true], ["calc_type", "عنوان نوع المشروع"], ["calc_features", "عنوان الميزات"], ["calc_speed", "عنوان المدة"], ["calc_normal", "مدة عادية"], ["calc_rush", "مدة مستعجلة"], ["calc_result", "عنوان النتيجة"], ["calc_note", "الملاحظة", true], ["calc_cta", "نص الزر"]]],
  ["تفاصيل المشاريع", [["details", "زر عرض التفاصيل"], ["similar", "زر طلب مشروع مشابه"]]],
  ["قسم الشركاء", [["partners_title", "العنوان"], ["partners_sub", "الوصف", true]]],
  ["قسم التواصل", [["cta_title", "العنوان"], ["cta_sub", "الوصف", true], ["cta_button", "نص الزر"]]],
  ["التذييل", [["footer_text", "النص"]]],
];

export async function viewContent(view) {
  settingsActions();
  const tabs = [["texts", "النصوص"], ["story", "القصة (المميزات)"], ["process", "خطوات العمل"], ["stats", "الأرقام"], ["calc", "حاسبة التكلفة"], ["sections", "إظهار الأقسام"], ["brand", "الهوية"], ["contact", "التواصل"]];
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
    const names = { iraq_map: "خريطة العراق في الواجهة الرئيسية", story: "القصة (المميزات)", projects: "الإنجازات (المشاريع)", services: "الخدمات", process: "كيف نعمل", stats: "الأرقام", testimonials: "آراء العملاء", calculator: "حاسبة التكلفة", partners: "الشركاء", contact: "التواصل" };
    body.innerHTML = `<p class="muted" style="margin-top:0">أخفِ أي قسم لا تحتاجه. (قسما الشركاء وآراء العملاء يختفيان تلقائياً إذا كانا فارغين.)</p><div class="stack">${Object.entries(names).map(([k, l]) => `<label class="switch"><input type="checkbox" data-path="sections.${k}" ${settings.sections[k] ? "checked" : ""}><i></i>${l}</label>`).join("")}</div>
      <label class="f" style="margin-top:18px;max-width:360px"><span>لغة الموقع عند أول زيارة</span><select data-path="default_lang">
        <option value="auto" ${(settings.default_lang || "auto") === "auto" ? "selected" : ""}>حسب لغة جهاز الزائر (عربي ← عربي، غيره ← إنجليزي)</option>
        <option value="ar" ${settings.default_lang === "ar" ? "selected" : ""}>العربية دائماً</option>
        <option value="en" ${settings.default_lang === "en" ? "selected" : ""}>الإنجليزية دائماً</option></select></label>
      <label class="f" style="margin-top:18px;max-width:360px"><span>حجم خريطة العراق <small class="muted" id="mapSizeVal">${Number(settings.iraq_map_size) || 100}٪</small></span>
        <input type="range" min="60" max="140" step="5" data-path="iraq_map_size" value="${Number(settings.iraq_map_size) || 100}" oninput="document.getElementById('mapSizeVal').textContent=this.value+'٪'"></label>
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
      ${input("contact.linkedin", "LinkedIn", false, 'dir="ltr"')}${input("contact.facebook", "Facebook", false, 'dir="ltr"')}</div></div>`;
  }
  bindPathInputs(body);
}
