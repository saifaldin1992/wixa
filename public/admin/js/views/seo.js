/* Search & sharing: how WIXA appears in Google and when a link is shared (title, description, icon, preview image, verification) */
import { $, $$, esc, settings } from "../core.js";
import { imageField } from "../fields.js";
import { changed, getPath, settingsActions } from "../settings.js";

const LIMITS = { title: [30, 60], description: [70, 160] };

export async function viewSeo(view) {
  settingsActions();
  const s = settings.seo;
  const input = (path, label, area = false, attrs = "", hint = "") => {
    const v = esc(getPath(settings, path) ?? "");
    return `<label class="f"><span>${label}${hint ? ` <small class="muted" data-count="${path}"></small>` : ""}</span>${area ? `<textarea data-path="${path}" rows="3" ${attrs}>${v}</textarea>` : `<input data-path="${path}" value="${v}" ${attrs}>`}</label>`;
  };
  view.innerHTML = `<div class="seo">
    <div class="card">
      <div class="card__head"><div><h3>كيف تظهر في نتائج Google</h3><p>معاينة تقريبية لنتيجة البحث بالعربي — تتحدث وأنت تكتب.</p></div></div>
      <div class="gpreview" id="gPreview"></div>
    </div>

    <div class="card">
      <div class="card__head"><div><h3>العنوان والوصف</h3><p>العنوان يظهر كرابط أزرق في Google وفي تبويب المتصفح، والوصف تحته. اكتبهما للإنسان أولاً: ماذا تقدّم ولمن.</p></div></div>
      <div class="grid2">
        ${input("seo.title_ar", "عنوان الموقع (عربي)", false, "", true)}
        ${input("seo.title_en", "عنوان الموقع (English)", false, 'dir="ltr"', true)}
        ${input("seo.description_ar", "الوصف (عربي)", true, "", true)}
        ${input("seo.description_en", "الوصف (English)", true, 'dir="ltr"', true)}
      </div>
      ${input("seo.keywords", "كلمات مفتاحية (مفصولة بفاصلة)", false, "", false)}
      <p class="muted" style="font-size:12px;margin:6px 0 0">Google لا يعتمد كثيراً على الكلمات المفتاحية؛ الأهم عنوان واضح ووصف جيد ومحتوى مفيد.</p>
    </div>

    <div class="grid2 seo__media">
      <div class="card">
        <div class="card__head"><div><h3>أيقونة الموقع</h3><p>تظهر بجانب اسم الموقع في نتائج Google وفي تبويب المتصفح. ارفع صورة مربعة PNG بحجم 512×512 على الأقل.</p></div></div>
        <div id="iconField"></div>
        <p class="muted" style="font-size:12px">إن لم ترفع أيقونة يُستخدم شعار ويكسا تلقائياً. تحديث Google للأيقونة قد يستغرق من أيام إلى أسابيع.</p>
      </div>
      <div class="card">
        <div class="card__head"><div><h3>صورة المشاركة</h3><p>تظهر عند مشاركة رابط الموقع في واتساب وفيسبوك وX ولينكدإن. المقاس المثالي 1200×630.</p></div></div>
        <div id="ogField"></div>
      </div>
    </div>

    <div class="card">
      <div class="card__head"><div><h3>ربط Google Search Console</h3><p>لتتابع ظهورك في البحث وتطلب فهرسة الصفحات.</p></div></div>
      <ol class="steps">
        <li>افتح <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a> ← إضافة موقع ← <b>بادئة عنوان URL</b> واكتب <code dir="ltr">https://wixa.dev/</code></li>
        <li>اختر طريقة التحقق <b>علامة HTML</b>، وانسخ قيمة <code>content</code> فقط (سلسلة حروف وأرقام).</li>
        <li>الصقها هنا، اضغط <b>حفظ ونشر</b>، ثم ارجع إلى Google واضغط <b>تحقق</b>.</li>
        <li>بعد التحقق: من «ملفات Sitemap» أضف <code dir="ltr">sitemap.xml</code>.</li>
      </ol>
      <div class="grid2">
        ${input("seo.google_verification", "رمز تحقق Google", false, 'dir="ltr" placeholder="مثال: aBcD123…"')}
        ${input("seo.bing_verification", "رمز تحقق Bing (اختياري)", false, 'dir="ltr"')}
      </div>
      <label class="switch" style="margin-top:12px"><input type="checkbox" data-path="seo.index" ${s.index !== false ? "checked" : ""}><i></i>السماح لمحركات البحث بفهرسة الموقع</label>
    </div>

    <div class="card">
      <div class="card__head"><div><h3>فحص سريع</h3><p>نقاط تساعد على ظهور أفضل في البحث.</p></div></div>
      <ul class="checks" id="seoChecks"></ul>
    </div>
  </div>`;

  $("#iconField").append(imageField(s.icon_url, "seo", (url) => { settings.seo.icon_url = url; changed(); refresh(); }, true));
  $("#ogField").append(imageField(s.og_image, "seo", (url) => { settings.seo.og_image = url; changed(); refresh(); }));
  $$("[data-path]", view).forEach((el) => {
    const ev = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(ev, () => {
      const ks = el.dataset.path.split("."); settings[ks[0]][ks[1]] = el.type === "checkbox" ? el.checked : el.value;
      changed(); refresh();
    });
  });
  refresh();
}

function refresh() {
  const s = settings.seo;
  const host = location.hostname.startsWith("staging.") ? "staging.wixa.dev" : "wixa.dev";
  const icon = s.icon_url || "/favicon.svg";
  $("#gPreview").innerHTML = `<div class="g">
      <div class="g__site"><img src="${esc(icon)}" alt=""><div><b>${esc(settings.brand?.name_en || "WIXA")}</b><span dir="ltr">https://${host}</span></div></div>
      <a class="g__title">${esc(s.title_ar || "—")}</a>
      <p class="g__desc">${esc((s.description_ar || "").slice(0, 160))}${(s.description_ar || "").length > 160 ? "…" : ""}</p></div>`;
  for (const [path, kind] of [["seo.title_ar", "title"], ["seo.title_en", "title"], ["seo.description_ar", "description"], ["seo.description_en", "description"]]) {
    const el = $(`[data-count="${path}"]`); if (!el) continue;
    const n = (path.split(".").reduce((o, k) => o?.[k], settings) || "").length, [lo, hi] = LIMITS[kind];
    el.textContent = `${n} حرف`; el.style.color = n < lo || n > hi ? "var(--warn)" : "var(--ok)";
  }
  const ok = (c, good, bad) => `<li class="${c ? "ok" : "warn"}">${c ? "✓" : "!"} ${c ? good : bad}</li>`;
  const tl = (s.title_ar || "").length, dl = (s.description_ar || "").length;
  $("#seoChecks").innerHTML = [
    ok(tl >= 30 && tl <= 60, `طول العنوان مناسب (${tl} حرفاً)`, `يُفضّل أن يكون العنوان بين 30 و60 حرفاً (الآن ${tl})`),
    ok(dl >= 70 && dl <= 160, `طول الوصف مناسب (${dl} حرفاً)`, `يُفضّل أن يكون الوصف بين 70 و160 حرفاً (الآن ${dl})`),
    ok(!!(s.title_en && s.description_en), "يوجد عنوان ووصف بالإنجليزي", "أضف عنواناً ووصفاً بالإنجليزي للزوار من خارج العراق"),
    ok(!!s.icon_url, "أيقونة مخصصة مرفوعة", "تُستخدم أيقونة ويكسا الافتراضية (يمكنك رفع أيقونة PNG مربعة)"),
    ok(!!s.google_verification, "تم إضافة رمز تحقق Google", "لم يُربط Google Search Console بعد"),
    ok(s.index !== false, "الموقع مسموح لمحركات البحث", "الفهرسة متوقفة — لن يظهر الموقع في Google"),
    `<li class="ok">✓ خريطة الموقع جاهزة: <a href="/sitemap.xml" target="_blank" dir="ltr">/sitemap.xml</a> · ملف robots: <a href="/robots.txt" target="_blank" dir="ltr">/robots.txt</a></li>`,
    `<li class="ok">✓ الموقع سريع ويعمل على الجوال وبالعربي والإنجليزي، وهذا مما يقدّره Google</li>`,
  ].join("");
}
