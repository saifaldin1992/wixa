/* Brand guide — for the owner only (inside the dashboard, never linked from the public site).
   Three branches, as in standard brand guidelines: identity (foundation, logo, colour, type, signature elements, icons,
   voice, applications) · design system (grid and sizes, shape, motion, components, page patterns, dashboard) ·
   UX standards (accessibility, content, performance, the automatic checks).
   Colours and font follow the current site settings, so the guide always matches the live site. */
import { sectionTabs } from "../core.js";
import { $, $$, esc, settings, toast } from "../core.js";

const { darkPalette, ICONS } = window.WIXA;

// ---------- colour maths (WCAG contrast) ----------
const rgb = (hex) => { const h = String(hex).replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (hex) => { const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const grade = (r) => (r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA كبير" : "غير مناسب للنص");

// ---------- logo artwork ----------
let MARK = "", WORD = "";
async function loadArt() {
  if (MARK) return;
  const [m, w] = await Promise.all([fetch("/logo.svg").then((r) => r.text()), fetch("/wordmark.svg").then((r) => r.text())]);
  MARK = m.match(/ d="([^"]+)"/)[1];
  WORD = { d: w.match(/ d="([^"]+)"/)[1], tf: (w.match(/transform="([^"]+)"/) || [])[1] || "" };
}
// mark: 2021×982 · wordmark: 716.6×150
function svgArt(kind, color, bg = "") {
  const markPath = (x, y, h) => `<path fill="${color}" fill-rule="evenodd" transform="translate(${x} ${y}) scale(${h / 982})" d="${MARK}"/>`;
  const wordPath = (x, y, h) => `<g transform="translate(${x} ${y}) scale(${h / 150})"><path fill="${color}" transform="${WORD.tf}" d="${WORD.d}"/></g>`;
  let w, h, body;
  if (kind === "mark") { w = 2021; h = 982; body = markPath(0, 0, 982); }
  else if (kind === "word") { w = 716.6; h = 150; body = wordPath(0, 0, 150); }
  else { // horizontal lockup — the same proportions as on the site: wordmark 58% of the mark's height, 46% between
    const mh = 200, mw = 2021 * mh / 982, gap = mh * 0.46, wh = mh * 0.58, ww = 716.6 * wh / 150;
    w = mw + gap + ww; h = mh; body = markPath(0, 0, mh) + wordPath(mw + gap, (mh - wh) / 2, wh);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h}" width="${w.toFixed(1)}" height="${h}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ""}${body}</svg>`;
}
function download(name, blob) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function toPng(svg, width) {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await img.decode();
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), ratioWH = Number(vb[2]) / Number(vb[1]);
  const pad = Math.round(width * 0.08), c = document.createElement("canvas");
  c.width = width + pad * 2; c.height = Math.round(width * ratioWH) + pad * 2;
  c.getContext("2d").drawImage(img, pad, pad, width, Math.round(width * ratioWH));
  URL.revokeObjectURL(img.src);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

export async function viewBrand(view) {
  $("#topActions").innerHTML = `<button class="b b--primary" id="brandPdf">حفظ الدليل PDF</button>`;
  await loadArt();
  // the brand font, so the samples below show it (hosted on the site)
  if (!document.getElementById("brandFont")) document.head.insertAdjacentHTML("beforeend", '<link id="brandFont" rel="stylesheet" href="/fonts/alexandria.css">');
  const t = settings.theme, dk = darkPalette(t), font = settings.font?.family || "Alexandria";
  const brandAr = settings.brand?.name_ar || "ويكسا", brandEn = settings.brand?.name_en || "WIXA";
  const R = Number(t.radius) || 22;
  const WAVE = `linear-gradient(100deg, ${t.primary}, color-mix(in srgb, ${t.accent} 45%, ${t.primary}))`;
  const card = (sec, title, sub, body) => `<div class="card" data-sec="${sec}"><div class="card__head"><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ""}</div></div>${body}</div>`;
  const list = (items) => `<ul class="bg-list">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  const table = (label, head, rows) => `<div class="table-wrap" tabindex="0" role="region" aria-label="${label}"><table class="bg-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const h4 = (s) => `<h4 style="margin:18px 0 8px">${s}</h4>`;

  const variants = [
    ["color", "الأساسي — على خلفية فاتحة", t.primary, t.bg],
    ["dark", "على خلفية داكنة (الوضع الليلي)", dk.fg, dk.bg],
    ["white", "أبيض على لون الهوية", "#FFFFFF", t.primary],
    ["black", "أحادي اللون (طباعة، أختام)", "#140F1F", "#FFFFFF"],
  ];
  const colorGroups = [
    ["ألوان الهوية", [
      ["الأساسي", "Primary", t.primary, "الشعار، الأزرار الرئيسية، الروابط، العنصر المختار"],
      ["المساعد", "Accent", t.accent, "لمسات صغيرة: خط الشعار المتحرك، نهاية تدرّج الموجة — لا يُكتب به نص"],
      ["الداكن", "Dark", t.dark, "الأقسام الداكنة والخلفيات العميقة"],
    ]],
    ["ألوان محايدة", [
      ["النص", "Text", t.text, "العناوين والنص الأساسي"],
      ["النص الثانوي", "Muted", t.muted, "الوصف والملاحظات"],
      ["الخلفية", "Background", t.bg, "خلفية الصفحة"],
      ["السطح", "Surface", t.surface, "البطاقات والنماذج والحقول"],
    ]],
    ["ألوان وظيفية (لا تُستخدم للزينة)", [
      ["نجاح", "Success", "#0E7C47", "تم، مجاناً، العدّادات، وخلفية أزرار واتساب المكتوبة"],
      ["تنبيه", "Warning", "#8A5A10", "ما يحتاج انتباهاً ولم يتعطل"],
      ["خطأ", "Error", "#C62828", "الأخطاء والحذف فقط"],
      ["واتساب", "WhatsApp", "#25D366", "الزر الدائري بالأيقونة فقط — لا يُكتب عليه بالأبيض"],
    ]],
  ];
  const sw = ([ar, en, hex, use]) => {
    const onW = ratio(hex, "#FFFFFF"), onD = ratio(hex, t.text);
    return `<div class="bg-sw"><button type="button" class="bg-sw__chip" style="background:${hex}" data-copy="${hex}" title="نسخ" aria-label="نسخ ${hex}"></button>
      <div class="bg-sw__info"><b>${ar} <small>${en}</small></b><code data-copy="${hex}">${hex.toUpperCase()}</code><span class="muted">RGB ${rgb(hex).join(", ")}</span>
      <span class="muted" style="font-size:12px">${use}</span>
      <span class="bg-ct">نص أبيض: <b>${onW.toFixed(1)}:1</b> ${grade(onW)} · نص داكن: <b>${onD.toFixed(1)}:1</b> ${grade(onD)}</span></div></div>`;
  };
  // the same numbers as the site's sizing system (public/styles.css)
  const scale = [
    ["H1 — عنوان الواجهة الأولى", "36", "48", "64", 800, "1.2"],
    ["H2 — عنوان الصفحة والقسم", "28", "36", "44", 800, "1.25"],
    ["عنوان بارز (القصة، المشاريع)", "22", "26", "30", 800, "1.3"],
    ["H3 — عنوان البطاقة", "18", "20", "20", 700, "1.35"],
    ["الأرقام البارزة (السعر)", "31", "40", "48", 800, "1.1"],
    ["نص المقدمة", "16", "17", "18", 400, "1.7"],
    ["النص الأساسي", "16", "16", "16", 400, "1.7"],
    ["نص البطاقات", "15", "16", "16", 400, "1.7"],
    ["الأزرار", "15", "16", "16", 500, "1.2"],
    ["الملاحظات الصغيرة (الأصغر)", "14", "14", "14", 400, "1.6"],
  ];
  const space = [4, 8, 12, 16, 24, 32, 48, 56, 80, 104];

  view.innerHTML = `<div class="brand-doc" id="brandDoc">
    <div class="card bg-cover" data-sec="about" style="background:linear-gradient(135deg, ${t.primary}, ${dk.dark})">
      <div class="bg-cover__art">${svgArt("lockup", "#FFFFFF")}</div>
      <div><h2>دليل الهوية البصرية</h2><p>${esc(brandAr)} · ${esc(brandEn)} — المرجع الواحد لكل من يصمم أو يبرمج أو يكتب باسم الشركة. يتبع ألوان الموقع وخطه الحاليين تلقائياً، وخاص بلوحة التحكم.</p></div>
    </div>

    ${card("about", "أساس العلامة", "ما نريد أن يشعر به الزبون في كل نقطة تواصل — كل قرار تصميم يرجع إلى هنا.", `
      ${table("أساس العلامة", ["العنصر", "النص المعتمد"], [
        ["الاسم", `<b>${esc(brandAr)}</b> بالعربية · <b dir="ltr">${esc(brandEn)}</b> بالإنجليزية، بأحرف كبيرة دائماً`],
        ["الدور", "الشريك التقني لمشاريعك"],
        ["الوعد", "نبني المستقبل الرقمي — مواقع وتطبيقات وأنظمة واضحة تخدم عملك"],
        ["الجمهور", "أصحاب المهن والشركات والمتاجر الذين يريدون حضوراً رقمياً بلا تعقيد تقني"],
      ])}
      ${h4("الشخصية")}
      ${list(["<b>واضحة:</b> نشرح بلغة الزبون، والفائدة قبل التقنية.", "<b>قريبة:</b> نخاطب الشخص مباشرة ونبقى معه بعد التسليم.", "<b>دقيقة:</b> لا وعد بلا التزام، ولا رقم بلا مصدر.", "<b>عصرية بهدوء:</b> حركة ولمسات لونية قليلة ومدروسة، لا زحام."])}
      ${h4("هيكل هذا الدليل")}
      ${list(["<b>الهوية البصرية</b> — الشعار، الألوان، الخط، العناصر المميزة، الأيقونات والصور، الكتابة، التطبيقات.", "<b>نظام التصميم UI</b> — الشبكة والقياسات، الزوايا والظلال، الحركة، المكوّنات، أنماط الصفحات، لوحة التحكم.", "<b>التجربة والمعايير UX</b> — إمكانية الوصول، المحتوى واللغتان، الأداء، والفحص التلقائي قبل كل نشر."])}`)}

    ${card("logo", "الشعار", "الرمز (منحنى مزدوج مأخوذ من حرفي W) مع الاسم WIXA. استخدم الملفات أدناه دائماً ولا تُعِد رسم الشعار.", `
      <div class="bg-logos">${variants.map(([k, label, fg, bg]) => `<figure class="bg-logo"><div class="bg-logo__stage" style="background:${bg}">${svgArt("lockup", fg)}</div>
        <figcaption><b>${label}</b><span class="bg-dl"><button type="button" class="b b--sm" data-dl="lockup:${k}:svg">SVG</button><button type="button" class="b b--sm" data-dl="lockup:${k}:png:1200">PNG</button><button type="button" class="b b--sm" data-dl="lockup:${k}:png:3000">PNG كبير</button></span></figcaption></figure>`).join("")}</div>
      <div class="bg-row">
        <figure class="bg-logo bg-logo--sm"><div class="bg-logo__stage" style="background:${t.bg}">${svgArt("mark", t.primary)}</div><figcaption><b>الرمز وحده</b><span class="muted">الأيقونات وصور الحسابات</span><span class="bg-dl"><button type="button" class="b b--sm" data-dl="mark:color:svg">SVG</button><button type="button" class="b b--sm" data-dl="mark:color:png:1024">PNG</button><button type="button" class="b b--sm" data-dl="mark:white:png:1024">PNG أبيض</button></span></figcaption></figure>
        <figure class="bg-logo bg-logo--sm"><div class="bg-logo__stage" style="background:${t.bg}">${svgArt("word", t.text)}</div><figcaption><b>الاسم وحده</b><span class="muted">عندما يظهر الرمز في مكان آخر</span><span class="bg-dl"><button type="button" class="b b--sm" data-dl="word:text:svg">SVG</button><button type="button" class="b b--sm" data-dl="word:text:png:1600">PNG</button></span></figcaption></figure>
      </div>
      <div class="bg-rules">
        <div><h4>المساحة الحرة</h4><div class="bg-clear" style="--p:${t.primary}">${svgArt("lockup", t.primary)}</div><p>حول الشعار مساحة فارغة لا تقل عن <b>ربع ارتفاع الرمز</b> من كل جهة، لا يدخلها نص أو صورة.</p></div>
        <div><h4>البناء والأحجام</h4><p><b>النِّسَب:</b> ارتفاع الاسم = 58٪ من ارتفاع الرمز، والمسافة بينهما = 46٪ منه.<br><b>أصغر حجم:</b> الشعار الكامل 120px عرضاً على الشاشة و30mm في الطباعة · الرمز وحده 24px ارتفاعاً و8mm.<br><b>في الموقع:</b> الرمز 26px في الشريط العلوي و30px في أسفل الصفحة.</p></div>
        <div><h4>ممنوع</h4><ul class="bg-dont"><li>تمديده أو ضغطه أو تدويره</li><li>ألوان غير النسخ الأربع أعلاه</li><li>ظل أو إطار أو توهج على الشعار الثابت</li><li>وضعه فوق صورة مزدحمة دون طبقة لون</li><li>كتابة الاسم بخط آخر أو تغيير المسافة بين الرمز والاسم</li></ul></div>
      </div>
      ${h4("النسخة المتحركة (الواجهة الأولى فقط)")}
      ${list(["بحجم كبير فقط: خط نيون سماوي قصير يرسم نفسه على حافة الشعار وينحني مع منحنياته (10% من المحيط، دورة كل 15 ثانية، توهّج خفيف).", "خلفه كرة أرضية خطية باهتة. لا تُستخدم أي حركة على الشعار الصغير أو في المطبوعات."])}`)}

    ${card("colors", "الألوان", `اضغط أي لون لنسخ رمزه. التوزيع: نحو <b>60٪</b> خلفيات فاتحة، <b>30٪</b> الأساسي والداكن، <b>10٪</b> المساعد.`, `
      <div class="bg-ratio"><i style="flex:6;background:${t.bg}"></i><i style="flex:3;background:${t.primary}"></i><i style="flex:1;background:${t.accent}"></i></div>
      ${colorGroups.map(([g, cs]) => `${h4(g)}<div class="bg-sws">${cs.map(sw).join("")}</div>`).join("")}
      ${h4("الوضع النهاري والليلي")}
      <div class="bg-modes">${[["النهاري", t.bg, t.surface, t.text, t.muted, t.primary], ["الليلي", dk.bg, dk.surface, dk.text, dk.muted, dk.fg]].map(([n, bg, sf, tx, mu, br]) => `
        <div class="bg-mode" style="background:${bg};color:${tx}"><b>${n}</b>
          <div class="bg-mode__card" style="background:${sf}"><span style="color:${br};font-weight:800">${svgArt("mark", br)}</span><strong style="color:${tx}">عنوان البطاقة</strong><span style="color:${mu}">وصف قصير بلون النص الثانوي.</span><em style="background:${br};color:#fff">زر رئيسي</em></div>
          <div class="bg-mode__codes">${[["الخلفية", bg], ["السطح", sf], ["النص", tx], ["الثانوي", mu], ["الهوية", br]].map(([k, v]) => `<span><i style="background:${v}"></i>${k} <code>${v.toUpperCase()}</code></span>`).join("")}</div>
        </div>`).join("")}</div>
      ${list(["ألوان الليلي مشتقة تلقائياً من اللون الأساسي، فتبقى الهوية نفسها. كل صفحة — حتى الخدمات والمقالات — تتبع اختيار الزائر وفيها زر التبديل.", "التقييم حسب WCAG: <b>AA</b> = مناسب للنص العادي (4.5:1)، <b>AAA</b> = ممتاز (7:1)، «AA كبير» = للعناوين الكبيرة فقط."])}`)}

    ${card("type", "الخط", `الخط الرسمي: <b>${esc(font)}</b> — عائلة واحدة للعربية والإنجليزية، في الموقع ولوحة التحكم والمطبوعات.${font === "Alexandria" ? " مستضاف على الموقع نفسه، ومرخّص للاستخدام التجاري (SIL OFL)." : ""}`, `
      <div class="bg-type" style="font-family:'${esc(font)}', system-ui">
        ${[[800, "عريض جداً — العناوين"], [700, "عريض — عناوين البطاقات"], [500, "متوسط — الأزرار"], [400, "عادي — النصوص"]].map(([w, n]) => `<div class="bg-type__row"><span class="muted">${w}</span><p style="font-weight:${w}">نبني المستقبل الرقمي · Building the digital future</p><small class="muted">${n}</small></div>`).join("")}
      </div>
      ${h4("سلّم الأحجام (بكسل)")}
      ${table("سلّم الأحجام", ["العنصر", "جوال", "تابلت", "كمبيوتر", "الوزن", "ارتفاع السطر"], scale)}
      ${list(["أربعة أوزان فقط: 400 و500 و700 و800، ولا أكثر من وزنين في السطر الواحد.", "كل حجم من هذا السلّم، والأصغر 14px. لا تُكتب أحجام يدوية في صفحة وحدها.", "الأرقام بالشكل 1 2 3 في اللغتين (الأسعار، الهواتف، أرقام الطلبات).", "لا تُلصق كلمة إنجليزية بحرف عربي (مثل «وAndroid») — اكتبها بالعربية أو اترك مسافة."])}
      ${font === "Alexandria" ? `<p style="margin:0"><a href="/fonts/alexandria/OFL.txt" target="_blank" rel="noopener">ترخيص الخط</a> · <a href="https://fonts.google.com/specimen/Alexandria" target="_blank" rel="noopener">تنزيل الخط للتصميم (Google Fonts)</a></p>` : ""}`)}

    ${card("elements", "العناصر المميزة", "عناصر مأخوذة من الشعار تجعل الهوية معروفة حتى بلا شعار. تُستخدم بقلة.", `
      <svg class="bg-wave" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="bgwv" x1="0" x2="1"><stop offset="0" stop-color="${t.primary}"/><stop offset=".5" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.primary}"/></linearGradient></defs><path fill="none" stroke="url(#bgwv)" stroke-width="2.5" stroke-linecap="round" d="M0 20 C 100 0, 200 0, 300 20 S 500 40, 600 20 S 800 0, 900 20 S 1100 40, 1200 20"/></svg>
      ${h4("1. منحنى WIXA")}
      ${list(["خط واحد بسمك 2px، متدرج: الأساسي ← المساعد ← الأساسي.", "يفصل بين أقسام الصفحة الرئيسية وفوق أسفل الصفحة، وفي المطبوعات تحت الترويسة.", "لا يوضع فوق عنوان صفحة داخلية، ولا فوق «شركاؤنا»، ولا يُملأ أو يُكرر كخلفية."])}
      ${h4("2. لون الموجة")}
      <div class="bg-wave"><span style="background:${WAVE}">02</span><i style="background:${WAVE}"></i><em style="background:${WAVE}">الأكثر مناسبة</em></div>
      ${list(["تدرّج من الأساسي إلى مزيج 45% من المساعد — تباين النص الأبيض عليه ≈5:1.", "<b>فقط</b> لما يجب أن يلفت النظر: أزرار «ابدأ مشروعك» كلها، زر «تتبع طلبك»، رقم الخطوة الحالية، النقطة الحالية تحت الصفوف المتحركة، شارة «الأكثر مناسبة».", "باقي الأزرار باللون الأساسي الواحد، حتى يبقى «ابدأ مشروعك» الأبرز."])}
      ${h4("3. الكرة الأرضية")}
      <div class="bg-hero"><svg viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="${t.primary}" stroke-opacity=".35" stroke-width="1"><circle cx="100" cy="100" r="96"/><ellipse cx="100" cy="100" rx="96" ry="34"/><ellipse cx="100" cy="100" rx="96" ry="66"/><ellipse cx="100" cy="100" rx="34" ry="96"/><ellipse cx="100" cy="100" rx="66" ry="96"/></g><svg x="12" y="68" width="176" height="64" viewBox="0 0 2021 982"><use href="/logo.svg#m" fill="${t.primary}" style="color:${t.primary}"/></svg></svg></div>
      ${list(["كرة خطية خلف الشعار في الواجهة الأولى فقط: 112% من حجمه، شفافة جداً (9% نهاري، 20% ليلي)، تدور ببطء (24 ثانية)."])}`)}

    ${card("icons", "الأيقونات والصور", "خطية بسيطة بسمك 1.8 وزوايا دائرية، داخل مربع بخلفية فاتحة من لون الهوية.", `
      <div class="bg-icons">${Object.entries(ICONS).map(([k, svg]) => `<span title="${k}" style="color:${t.primary};background:${t.primary}14">${svg}</span>`).join("")}</div>
      ${h4("الصور")}
      ${list(["صور المشاريع لقطات حقيقية من أعمالنا، بنسبة 16:10، وبزوايا البطاقات نفسها.", "لا صور جاهزة لأشخاص على أنهم زبائن أو فريق، ولا شعار شريك بلا إذن.", "شعارات الشركاء بألوانها الأصلية ودقة لا تقل عن ضعف حجم ظهورها.", "الصور بصيغة WebP مضغوطة، وكل صورة لها وصف (alt) أو تُعلَّم كزخرفية."])}`)}

    ${card("voice", "أسلوب الكتابة", `كيف نتحدث باسم ${esc(brandAr)}.`, `
      ${table("أسلوب الكتابة", ["نكتب", "لا نكتب"], [
        ["«نبني موقعك ونبقى معك بعد التسليم»", "«حلول رقمية رائدة واستثنائية»"],
        ["«مشروعك»، «نتصل بك»", "«مشروعكم»، «سيتم التواصل»"],
        ["جملة أو جملتان، الفائدة أولاً", "فقرات طويلة ومصطلحات تقنية بلا شرح"],
      ])}
      ${list(["العربي والإنجليزي بنفس المعنى والطول تقريباً؛ الإنجليزية بالتهجئة الأمريكية.", "كل وعد في الموقع يطابق الضمانات والهدايا الفعلية، ولا تُعرض كهدية ميزة مضمونة أصلاً.", "أزرار بأفعال واضحة: «ابدأ مشروعك»، «تتبع طلبك»، «أرسل» — لا «اضغط هنا»."])}`)}

    ${card("apps", "التطبيقات", "الهوية خارج الموقع: الحسابات، المتصفح، المطبوعات.", `
      <div class="bg-row">
        <figure class="bg-logo bg-logo--sm"><div class="bg-logo__stage" style="background:${t.primary}"><img src="/icons/icon-512.png" alt="" style="width:96px;height:96px;border-radius:${R}px"></div><figcaption><b>صورة الحسابات</b><span class="muted">واتساب، إنستغرام، Google</span><span class="bg-dl"><a class="b b--sm" href="/icons/icon-512.png" download="wixa-avatar-512.png">PNG 512</a><a class="b b--sm" href="/favicon.svg" download="wixa-favicon.svg">أيقونة المتصفح</a></span></figcaption></figure>
      </div>
      ${list(["صورة الحساب: الرمز أبيض على اللون الأساسي — نفس الملف في كل المنصات.", "منشورات التواصل: خلفية فاتحة أو داكنة من ألوان الهوية، عنوان بخط الهوية 800، والشعار في زاوية ثابتة بمساحته الحرة.", "المطبوعات والعروض (PDF): الشعار أعلى الصفحة، منحنى WIXA تحت الترويسة، والنص بالخط نفسه."])}`)}

    ${card("grid", "الشبكة والقياسات", "مقاسات واحدة لكل الصفحات في الموقع ولوحة التحكم — لا تُضبط صفحة وحدها. تُفحص تلقائياً قبل كل نشر.", `
      ${table("القياسات الثابتة", ["القياس", "جوال", "تابلت", "كمبيوتر"], [
        ["حدود الشاشة — الموقع", "حتى 767px", "768–1199px", "1200px فأكثر"],
        ["حدود الشاشة — لوحة التحكم", "حتى 600px", "601–960px", "961px فأكثر"],
        ["الهامش الجانبي", "16px", "24px", "32px"],
        ["العنوان الأول تحت الشريط العلوي", "40px", "48px", "64px"],
        ["المسافة بين الأقسام", "56px", "80px", "104px"],
        ["حشوة البطاقة — الموقع", "18px", "22px", "26px"],
        ["حشوة اللوحة الكبيرة (نموذج، طلب)", "20px", "28px", "36px"],
        ["حشوة البطاقة — لوحة التحكم", "16px", "20px", "24px"],
        ["المسافة بين البطاقات", "12px", "16px", "16px"],
      ])}
      ${h4("ثلاثة عروض فقط للمحتوى (في الوسط دائماً)")}
      ${table("عروض المحتوى", ["العرض", "الأقصى", "يُستخدم في"], [
        ["واسع", "1240px", "الأقسام، الشبكات، الشريط العلوي، أسفل الصفحة، صفحة الطلب"],
        ["قراءة", "820px", "الأسئلة، الوظائف، النماذج، المقالات، الخصوصية، صفحات الخدمات والمشاريع"],
        ["ضيق", "560px", "نموذج بحقل أو حقلين (تتبع الطلب)"],
        ["لوحة التحكم", "1120px", "كل صفحات اللوحة"],
      ])}
      ${list(["<b>بطاقة وحدها</b> تأخذ عرض المحتوى كاملاً، و<b>صف بطاقات</b> يبدأ وينتهي عند حافتيه — فكل الصفحات بنفس المستطيلات.", "لا شيء أعرض من الشاشة: الجداول والصفوف المتحركة تتحرك داخل إطارها فقط.", "المسافات كلها من هذا السلّم (مبني على 4):"])}
      <div class="bg-space">${space.map((s) => `<span><i style="width:${s}px;height:${s}px;background:${t.primary}"></i>${s}</span>`).join("")}</div>`)}

    ${card("shape", "الزوايا والظلال", "ثلاثة أحجام زوايا وثلاثة مستويات ظل — لا غيرها.", `
      ${table("الزوايا", ["العنصر", "الزاوية"], [["الحقول والاختيارات الصغيرة داخل البطاقة", "14px"], ["البطاقات (خدمة، باقة، سؤال، وظيفة…)", `${R}px`], ["اللوحات الكبيرة (النموذج، الحاسبة، المشروع، النوافذ)", `${R + 6}px`], ["الأزرار والشارات", "حبة كاملة الاستدارة"]])}
      <div class="bg-shadows">${[["البطاقة", `0 1px 2px ${t.text}0A, 0 12px 40px -12px ${t.text}1F`], ["الزر الرئيسي", `0 12px 30px -8px ${t.primary}99`], ["النوافذ والقوائم", `0 24px 60px -20px ${t.text}40`]].map(([n, sh]) => `<span style="box-shadow:${sh}">${n}</span>`).join("")}</div>
      ${list(["الظلال ناعمة بلون النص لا بالأسود. في الوضع الليلي تقل وتحل محلها حدود رفيعة.", "لا ظل على النصوص أو الشعار."])}`)}

    ${card("motion", "الحركة", "الحركة تشرح ما حدث ولا تؤخر الزبون.", `
      ${table("الحركة", ["النوع", "المدة", "المنحنى"], [["مرور وضغط (لون، ظل)", "0.2–0.35 ثانية", "عادي"], ["ظهور الأقسام وفتح القوائم والنماذج", "0.6–0.8 ثانية", `<span dir="ltr">cubic-bezier(.16, 1, .3, 1)</span>`], ["حركات الواجهة الأولى المستمرة", "15 ثانية (الخط) · 24 ثانية (الكرة)", "ثابت"]])}
      ${list(["كل حركة تتوقف لمن فعّل «تقليل الحركة» في جهازه.", "للأجهزة الضعيفة: الحركة بالتحويل والشفافية فقط، كل حركة في طبقة مستقلة، ولا تمويه (blur) يُعاد رسمه."])}`)}

    ${card("buttons", "الأزرار والحقول", "", `
      <div class="bg-btns"><span class="bg-btn" style="background:${WAVE}">ابدأ مشروعك</span><span class="bg-btn" style="background:${t.primary}">زر رئيسي</span><span class="bg-btn bg-btn--ghost" style="color:${t.text};border-color:${t.muted}55">زر ثانوي</span><span class="bg-btn" style="background:#0E7C47">راسلنا على واتساب</span></div>
      ${table("الأزرار", ["النوع", "متى"], [["لون الموجة", "«ابدأ مشروعك» و«تتبع طلبك» فقط"], ["رئيسي (اللون الأساسي)", "الإجراء الأهم في البطاقة أو النموذج — واحد فقط في كل مجموعة"], ["ثانوي (إطار)", "البدائل: تواصل معنا، رجوع، إلغاء"], ["واتساب", "أخضر داكن للأزرار المكتوبة، والأخضر الرسمي للزر الدائري"]])}
      ${list(["الارتفاع 48px (50px على الكمبيوتر)، ولا يقل العرض عن 160px. الحقول 48px وزواياها 14px.", "على الجوال أزرار المجموعة فوق بعض بعرض كامل (حتى 360px) وفي الوسط؛ على التابلت والكمبيوتر جنباً إلى جنب.", "كل ما يُلمس 44×44px على الأقل، و8px بين عنصرين متجاورين.", "الحقل الإجباري بنجمة حمراء، والبريد اختياري في كل الموقع."])}`)}

    ${card("cards", "البطاقات والأشرطة", "", `
      ${h4("أشرطة الاختيار (القوائم الفرعية، الفلاتر، اللغة، الفترة)")}
      <div class="bg-subnav" data-scroll tabindex="0" role="region" aria-label="مثال القائمة الفرعية"><span class="on" style="color:${t.primary};border-color:${t.primary}">المفتوحة <i style="background:${t.primary};color:#fff">3</i></span><span>جديد <i>1</i></span><span>تواصلنا <i>2</i></span><span>مكتمل <i>0</i></span></div>
      ${list(["أزرار منفصلة داخل إطار أبيض بزوايا 14px، و<b>المختار يمتلئ بالبنفسجي</b> ونصه أبيض.", "في شريط مستقل تحت العنوان؛ أكثر من مجموعة = سطر لكل مجموعة. إذا كثرت الخيارات تُسحب جانبياً."])}
      ${h4("الصفوف المتحركة (جوال وتابلت)")}
      <div class="bg-dots"><i></i><i class="on" style="background:${WAVE}"></i><i></i><i></i></div>
      ${list(["الخدمات، حسب المجال، المشاريع، الباقات: صف يُسحب جانبياً وتظهر حافة البطاقة التالية. على الكمبيوتر شبكة.", "النقطة الحالية 24px بلون الموجة، والباقي 8px رمادية، ومساحة الضغط 24px على الأقل."])}`)}

    ${card("nav", "التنقل والأزرار العائمة", "", `
      ${list(["القائمة العلوية 7 روابط أو أقل. «ابدأ مشروعك» في الشريط على الكمبيوتر فقط؛ أقل من 1240px تتحول الروابط إلى زر ☰.", "<b>أقسام الرئيسية</b> (خدماتنا، حلول حسب مجالك، نماذج من عملنا، الباقات والأسعار، الحاسبة، شركاؤنا) تنزلق إلى القسم. <b>صفحات مستقلة فقط:</b> الوظائف، تواصل معنا، المقالات، من نحن، الأسئلة الشائعة.", "الروابط الثانوية في أسفل الصفحة، وفوقها زر «تتبع طلبك» بلون الموجة.", "عند فتح قائمة أو نافذة تثبت الصفحة تحتها."])}
      ${h4("أيقونات التواصل والأزرار العائمة")}
      <div class="bg-social"><span style="background:${t.primary}1A;color:${t.text}">f</span><span style="background:${t.primary}1A;color:${t.text}">◎</span><span style="background:#1877F2;color:#fff">f</span><span style="background:radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%);color:#fff">◎</span></div>
      ${list(["عادةً: دائرة بلون الهوية الفاتح (10%) والأيقونة بلون النص 19px. عند المرور أو الضغط فقط: لون الشبكة الرسمي.", "زرّا الزاوية بنفس الحجم والارتفاع (52px جوال، 56px كمبيوتر): واتساب أخضر، والدردشة سماوية بأيقونة داكنة #062A33.", "يختفيان تلقائياً عندما يغطيان أزرار الواجهة على الجوال."])}`)}

    ${card("patterns", "أنماط الصفحات", "", `
      ${table("أنماط الصفحات", ["النمط", "القاعدة"], [
        ["الواجهة الأولى", "الشعار المتحرك مع الكرة، الشارة بين نجمتين، ثم «نبني المستقبل الرقمي» وزرّان في الوسط"],
        ["عنوان القسم", "في الوسط مع سطره التوضيحي، 28 / 36 / 44px، ومنحنى WIXA فوقه في الرئيسية فقط"],
        ["الصفحة الداخلية", "تبدأ بعنوانها مباشرة (40 / 48 / 64px تحت الشريط)، بنفس الشريط والقائمة وأسفل الصفحة، والأزرار في الوسط"],
        ["الشركاء", "شعار يملأ معظم البطاقة؛ في الشبكة رمادي ويتلوّن عند المرور أو الضغط، وفي الشريط المتحرك ملوّن دائماً"],
        ["الطلب", `صفحة واحدة <b dir="ltr">/order</b>: «طلبك» ثم الاسم والهاتف، وتحت الإرسال سطور طمأنة بعلامة ✓ خضراء`],
        ["الهدايا", "بطاقة بتدرج الهوية وعلبة 🎁 تنقلب إلى وجه أبيض فيه شارة خضراء «مجاناً»"],
        ["تتبع الطلب", `<b dir="ltr">/track</b> أو الدردشة: المنجز دائرة ممتلئة، الحالي بإطار وهالة، القادم رمادي. رقم الطلب <b dir="ltr">WX-YYMMDD-XXXX</b>`],
      ])}
      <div class="bg-gifts"><span style="background:linear-gradient(135deg, ${t.primary}, ${t.accent})">🎁<small>اضغط لكشف الهدية</small></span><span><em style="background:#0E7C47">مجاناً</em><b style="color:${t.primary}">هوية بصرية</b></span></div>`)}

    ${card("dash", "لوحة التحكم", "نفس الهوية بكثافة أعلى: معلومات أكثر، زخرفة أقل.", `
      ${list(["نفس الخط ولون الهوية والزوايا. العنوان بمستوى زر ☰ (19px جوال، 22px كمبيوتر) ووصفه تحته.", "سبع مجموعات: الرئيسية، خدمة الزبائن، المبيعات والتسويق، محتوى الموقع، التصميم، الإعدادات، النظام — كل صفحة في مكان واحد.", "الصفحة الطويلة مقسّمة: فرع ثم أقسامه، ويظهر قسم واحد في كل مرة.", "زر الإضافة دائرة «+» على يسار سطر البحث، والأزرار (تصدير، حفظ) بجانب العنوان.", "ألوان الحالة: النص الثانوي #5B6270، نجاح #0E7C47، تنبيه #8A5A10، خطأ #C62828.", "<b>شاشة التحميل:</b> الشعار ينبض بهدوء و«جارٍ التحميل…» من أول لحظة حتى تظهر شاشة الدخول أو اللوحة — لا صفحة بيضاء أبداً.", "<b>صندوق انقطاع الاتصال:</b> بطاقة بيضاء في الوسط (زوايا 22px) بعنوان «تعذّر الوصول إلى الخادم» وجملة تشرح، وزر رئيسي واحد «إعادة المحاولة». الجلسة تبقى، ولا يُطلب الدخول من جديد."])}`)}

    ${card("std", "إمكانية الوصول", "كل جزء جديد يجب أن يحقق هذه الحدود.", `
      ${table("المعايير", ["القاعدة", "الحد المطلوب", "المرجع"], [
        ["تباين النص العادي", "<b>4.5:1</b> على الأقل", `<span dir="ltr">WCAG 2.2 · 1.4.3</span>`],
        ["تباين النص الكبير (24px، أو 19px عريض)", "<b>3:1</b>", `<span dir="ltr">WCAG 2.2 · 1.4.3</span>`],
        ["الأيقونات وحدود الحقول والأزرار", "<b>3:1</b>", `<span dir="ltr">WCAG 2.2 · 1.4.11</span>`],
        ["ما يُضغط بالإصبع", "44px (48px معتمد عندنا)، و24px لأي عنصر صغير", `<span dir="ltr">Apple HIG · Material · WCAG 2.5.8</span>`],
        ["الروابط داخل النص", "بخط تحتها، لا باللون وحده", `<span dir="ltr">WCAG 2.2 · 1.4.1</span>`],
        ["لوحة المفاتيح", "إطار واضح بلون الهوية (2px) حول العنصر المختار", `<span dir="ltr">WCAG 2.2 · 2.4.7</span>`],
        ["الحركة", "تتوقف مع «تقليل الحركة»", `<span dir="ltr">WCAG 2.2 · 2.3.3</span>`],
        ["التكبير", "النص يكبر حتى 200% دون أن يخرج شيء عن الشاشة", `<span dir="ltr">WCAG 2.2 · 1.4.4 · 1.4.10</span>`],
      ])}`)}

    ${card("content", "المحتوى واللغتان", "", `
      ${list(["العربية من اليمين والإنجليزية من اليسار، بنفس المعنى والطول، والأرقام 1 2 3.", "رقم الهاتف والبريد ورقم الطلب تُكتب من اليسار حتى في الصفحة العربية.", "كل صفحة لها عنوان ووصف لمحركات البحث، وكل صورة لها وصف أو تُعلَّم كزخرفية.", "النماذج تقول ما المطلوب قبل الإرسال، والخطأ يظهر بجانب الحقل بجملة تشرح الحل."])}`)}

    ${card("perf", "الأداء", "الموقع يُفتح بسرعة على جوال متوسط وشبكة عادية.", `
      ${table("الأداء", ["المقياس", "الهدف", "المرجع"], [["ظهور أكبر عنصر (LCP)", "أقل من 2.5 ثانية", `<span dir="ltr">Core Web Vitals</span>`], ["الاستجابة للضغط (INP)", "أقل من 200ms", `<span dir="ltr">Core Web Vitals</span>`], ["ثبات الصفحة (CLS)", "أقل من 0.1", `<span dir="ltr">Core Web Vitals</span>`]])}
      ${list(["الخط والصور والمكتبات (supabase-js، gsap، lenis) مستضافة على الموقع نفسه، والصور WebP بالحجم الذي تظهر به.", "أرقام الزيارات في لوحة التحكم تظهر فوراً من آخر نسخة محفوظة وتُحدَّث في الخلفية — لا انتظار لخدمة خارجية.", "القيم الحقيقية من زوار الموقع تظهر في «الرئيسية» ← سلوك الزوار والسرعة، وأوقات كل طلب في سجلات Cloudflare (Observability)."])}`)}

    ${card("net", "عند ضعف الاتصال", "الزبون أو الفريق على شبكة ضعيفة يرى دائماً ما يحدث وماذا يفعل — لا صفحة بيضاء ولا انتظار بلا نهاية.", `
      ${table("ضعف الاتصال", ["الحالة", "ما يحدث"], [
        ["كود الموقع تأخر أو لم يصل", "بعد 4 ثوانٍ يظهر كل المحتوى بلا حركات (المحتوى نفسه يأتي من الخادم دائماً)"],
        ["فتح لوحة التحكم", "شاشة تحميل من أول لحظة؛ بعد 10 ثوانٍ: «التحميل يتأخر» وزر «إعادة المحاولة»"],
        ["طلب قراءة من اللوحة لم يرد", "يتوقف بعد 20 ثانية مع رسالة «الاتصال بطيء أو منقطع»"],
        ["إرسال (حملة، نسخة احتياطية)", "مهلة 60 ثانية"],
        ["فشل الاتصال أثناء الدخول", "رسالة «تعذّر الوصول إلى الخادم» وزر «إعادة المحاولة» — لا تسجيل خروج ولا رسالة صلاحية خاطئة"],
        ["لم تُحمَّل إعدادات الموقع", "الحفظ ممنوع مع رسالة، حتى لا تُستبدل الإعدادات بالقيم الافتراضية"],
      ])}
      ${list(["كل رسالة تقول ما حدث وما يفعله الشخص، بجملة واحدة، وبزر واحد إن لزم.", "لا يُفترض أبداً أن الخطأ من الشخص: انقطاع الشبكة ليس «لا صلاحية لديك»."])}`)}

    ${card("sec", "الحماية", "قواعد ثابتة تحققت منها اختبارات اختراق (61 محاولة على النسخة التجريبية، نوفمبر 2026) — كلها رُفضت.", `
      ${list(["لوحة التحكم: كل طلب يتحقق من الدخول والصلاحية، وقاعدة البيانات نفسها تفرض الصلاحيات (محرر المحتوى لا يقرأ الطلبات حتى لو طلبها مباشرة).", "المفتاح العام الظاهر في الصفحة لا يقرأ ولا يكتب أي بيانات خاصة؛ الكتابة من الموقع تمر بالخادم وحده بمفتاح سري.", "لا كود من خارج الموقع (لا CDN) ولا كود مضمّن في الصفحات؛ سياسة الأمان تسمح بالموقع نفسه وCloudflare فقط.", "حدود للطلبات على كل نموذج، وفحص الروبوتات على الطلب والتواصل، و6 محادثات جديدة يومياً كحد أقصى من العنوان الواحد.", "كل ما يكتبه الزبون يُعرض كنص عادي — لا يمكن زرع كود في الأسماء أو الرسائل."])}`)}

    ${card("checks", "الفحص التلقائي قبل كل نشر", "القواعد أعلاه ليست توصيات فقط — هذه الفحوص ترفض أي تعديل يخالفها.", `
      ${table("الفحوص", ["الفحص", "ما يتأكد منه"], [
        [`<span dir="ltr">tests/site-layout.mjs</span>`, "كل صفحات الموقع على جوال وتابلت وكمبيوتر: لا شيء أعرض من الشاشة، الزوايا من الأحجام الثلاثة، كل صف بطاقات بأحد العروض الثلاثة وفي الوسط، والعنوان الأول على المسافة نفسها تحت الشريط"],
        [`<span dir="ltr">tests/admin-layout.mjs</span>`, "كل صفحات لوحة التحكم على جوال وكمبيوتر: لا شيء أعرض من الشاشة، والبطاقات بعرض الصفحة"],
        [`<span dir="ltr">tests/admin-phone.mjs</span>`, "كل صفحات اللوحة تفتح على الجوال بلا أخطاء ولا عناصر خارج الشاشة"],
        [`<span dir="ltr">tests/smoke.mjs</span>`, "الصفحات والروابط الأساسية تعمل"],
        [`<span dir="ltr">tests/structure.mjs</span>`, "بنية الخادم: كل ملف يستورد من الطبقات التي قبله فقط، ولا حلقات استيراد"],
        [`<span dir="ltr">tests/stats-cache.mjs</span>`, "أرقام الزيارات لا تنتظر Cloudflare بعد أول مرة"],
        [`<span dir="ltr">tests/no-white-page.mjs</span>`, "لا صفحة بيضاء: الموقع واللوحة يعرضان الشعار و«جارٍ التحميل»، ثم «إعادة المحاولة» بعد 10 ثوانٍ"],
        [`<span dir="ltr">tests/admin-buttons.mjs</span>`, "كل زر في لوحة التحكم يستجيب: يُضغط كل زر في كل صفحة، والزر الذي لا يفعل شيئاً يُفشل الفحص"],
        [`<span dir="ltr">tests/admin-netfail.mjs</span>`, "انقطاع الاتصال عند فتح اللوحة: رسالة «إعادة المحاولة» بدل الانتظار أو تسجيل الخروج"],
      ])}`)}
  </div>`;

  // copy colour codes
  $$("[data-copy]", view).forEach((el) => (el.onclick = async () => { try { await navigator.clipboard.writeText(el.dataset.copy); toast(`نُسخ ${el.dataset.copy} ✓`); } catch { toast(el.dataset.copy); } }));
  // downloads
  const colorOf = { color: t.primary, dark: dk.fg, white: "#FFFFFF", black: "#140F1F", text: t.text };
  $$("[data-dl]", view).forEach((b) => (b.onclick = async () => {
    const [kind, variant, fmt, width] = b.dataset.dl.split(":");
    const svg = svgArt(kind, colorOf[variant]);
    const name = `wixa-${kind === "lockup" ? "logo" : kind}-${variant}`;
    if (fmt === "svg") return download(`${name}.svg`, new Blob([svg], { type: "image/svg+xml" }));
    b.disabled = true;
    try { download(`${name}-${width}.png`, await toPng(svg, Number(width))); } catch { toast("تعذّر تجهيز الصورة", "err"); }
    finally { b.disabled = false; }
  }));
  // ---- sub-menus: identity / design system / standards (each card carries its data-sec) ----
  sectionTabs(view, "brand", [
    { k: "id", label: "الهوية البصرية", items: [["about", "أساس العلامة"], ["logo", "الشعار"], ["colors", "الألوان"], ["type", "الخط"], ["elements", "العناصر المميزة"], ["icons", "الأيقونات والصور"], ["voice", "الكتابة"], ["apps", "التطبيقات"]] },
    { k: "ui", label: "نظام التصميم UI", items: [["grid", "الشبكة والقياسات"], ["shape", "الزوايا والظلال"], ["motion", "الحركة"], ["buttons", "الأزرار والحقول"], ["cards", "البطاقات والأشرطة"], ["nav", "التنقل"], ["patterns", "أنماط الصفحات"], ["dash", "لوحة التحكم"]] },
    { k: "ux", label: "التجربة والمعايير UX", items: [["std", "إمكانية الوصول"], ["content", "المحتوى واللغتان"], ["perf", "الأداء"], ["net", "ضعف الاتصال"], ["sec", "الحماية"], ["checks", "الفحص التلقائي"]] },
  ]);
  // the PDF holds the whole guide, not only the section on screen
  $("#brandPdf").onclick = () => { document.body.classList.add("print-brand"); setTimeout(() => { print(); document.body.classList.remove("print-brand"); }, 50); };
}
