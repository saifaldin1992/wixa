/* Brand guide — for the owner only (inside the dashboard, never linked from the public site).
   Logo files to download, colours, light/dark palettes, typography, the WIXA wave, components, spacing and usage rules.
   Colours and font follow the current site settings, so the guide always matches the live site. */
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
  const variants = [
    ["color", "الأساسي — على خلفية فاتحة", t.primary, t.bg],
    ["dark", "على خلفية داكنة (الوضع الليلي)", dk.fg, dk.bg],
    ["white", "أبيض على لون الهوية", "#FFFFFF", t.primary],
    ["black", "أحادي اللون (طباعة، أختام)", "#140F1F", "#FFFFFF"],
  ];
  const colors = [
    ["اللون الأساسي", "Primary", t.primary, "الأزرار الرئيسية، الشعار، الروابط، العناصر المهمة"],
    ["اللون المساعد", "Accent", t.accent, "لمسات صغيرة فقط: نقاط، خطوط، تدرجات — ليس للنصوص الطويلة"],
    ["الداكن", "Dark", t.dark, "الأقسام الداكنة (الأرقام، الحاسبة) والخلفيات العميقة"],
    ["النص", "Text", t.text, "العناوين والنص الأساسي"],
    ["النص الثانوي", "Muted", t.muted, "الوصف والملاحظات"],
    ["الخلفية", "Background", t.bg, "خلفية الصفحة"],
    ["السطح", "Surface", t.surface, "البطاقات والنماذج"],
    ["واتساب (أيقونة)", "WhatsApp", "#25D366", "للزر الدائري بالأيقونة فقط — لا يوضع عليه نص أبيض (تباين ضعيف)"],
    ["واتساب (نص)", "WhatsApp ink", "#0E7C47", "خلفية أزرار واتساب التي فيها كتابة بيضاء (5.3:1)"],
  ];
  const sw = ([ar, en, hex, use]) => {
    const onW = ratio(hex, "#FFFFFF"), onD = ratio(hex, t.text);
    return `<div class="bg-sw"><button type="button" class="bg-sw__chip" style="background:${hex}" data-copy="${hex}" title="نسخ"></button>
      <div class="bg-sw__info"><b>${ar} <small>${en}</small></b><code data-copy="${hex}">${hex.toUpperCase()}</code><span class="muted">RGB ${rgb(hex).join(", ")}</span>
      <span class="muted" style="font-size:12px">${use}</span>
      <span class="bg-ct">نص أبيض فوقه: <b>${onW.toFixed(1)}:1</b> ${grade(onW)} · نص داكن فوقه: <b>${onD.toFixed(1)}:1</b> ${grade(onD)}</span></div></div>`;
  };
  const scale = [["H1 — العنوان الرئيسي", "36", "48", "64", 800, "1.2"], ["H2 — عنوان القسم", "28", "36", "44", 800, "1.25"], ["عنوان بارز (القصة، المشاريع)", "20", "24", "28", 800, "1.3"], ["H3 — عنوان البطاقة", "17", "20", "20", 700, "1.35"], ["الأرقام البارزة (السعر)", "32", "40", "48", 800, "1.1"], ["نص المقدمة", "16", "17", "18", 400, "1.7"], ["النص الأساسي", "16", "16", "16", 400, "1.7"], ["نص البطاقات", "15", "16", "16", 400, "1.7"], ["الملاحظات الصغيرة", "14", "14", "14", 400, "1.6"], ["الأزرار", "15", "16", "16", 500, "1.2"]];
  const space = [4, 8, 12, 16, 24, 32, 48, 56, 80, 104];

  view.innerHTML = `<div class="brand-doc" id="brandDoc">
    <div class="card bg-cover" style="background:linear-gradient(135deg, ${t.primary}, ${dk.dark})">
      <div class="bg-cover__art">${svgArt("lockup", "#FFFFFF")}</div>
      <div><h2>دليل الهوية البصرية</h2><p>${esc(brandAr)} · ${esc(brandEn)} — مرجع لكل من يصمم أو يكتب باسم الشركة. خاص بلوحة التحكم ولا يظهر في الموقع. يتبع ألوان وخط الموقع الحاليين تلقائياً.</p></div>
    </div>

    <div class="card"><div class="card__head"><div><h3>1. الشعار</h3><p>يتكون من الرمز (المنحنى المزدوج المأخوذ من حرفي W) والاسم WIXA. استخدم الملفات أدناه دائماً ولا تعِد رسم الشعار.</p></div></div>
      <div class="bg-logos">${variants.map(([k, label, fg, bg]) => `<figure class="bg-logo"><div class="bg-logo__stage" style="background:${bg}">${svgArt("lockup", fg)}</div>
        <figcaption><b>${label}</b><span class="bg-dl"><button type="button" class="b b--sm" data-dl="lockup:${k}:svg">SVG</button><button type="button" class="b b--sm" data-dl="lockup:${k}:png:1200">PNG</button><button type="button" class="b b--sm" data-dl="lockup:${k}:png:3000">PNG كبير</button></span></figcaption></figure>`).join("")}</div>
      <div class="bg-row">
        <figure class="bg-logo bg-logo--sm"><div class="bg-logo__stage" style="background:${t.bg}">${svgArt("mark", t.primary)}</div><figcaption><b>الرمز وحده</b><span class="muted">للأيقونات وصور الحسابات</span><span class="bg-dl"><button type="button" class="b b--sm" data-dl="mark:color:svg">SVG</button><button type="button" class="b b--sm" data-dl="mark:color:png:1024">PNG</button><button type="button" class="b b--sm" data-dl="mark:white:png:1024">PNG أبيض</button></span></figcaption></figure>
        <figure class="bg-logo bg-logo--sm"><div class="bg-logo__stage" style="background:${t.bg}">${svgArt("word", t.text)}</div><figcaption><b>الاسم وحده</b><span class="muted">عندما يكون الرمز ظاهراً في مكان آخر</span><span class="bg-dl"><button type="button" class="b b--sm" data-dl="word:text:svg">SVG</button><button type="button" class="b b--sm" data-dl="word:text:png:1600">PNG</button></span></figcaption></figure>
        <figure class="bg-logo bg-logo--sm"><div class="bg-logo__stage" style="background:${t.primary}"><img src="/icons/icon-512.png" alt="" style="width:96px;height:96px;border-radius:22px"></div><figcaption><b>صورة الحسابات</b><span class="muted">واتساب، إنستغرام، Google</span><span class="bg-dl"><a class="b b--sm" href="/icons/icon-512.png" download="wixa-avatar-512.png">PNG 512</a><a class="b b--sm" href="/favicon.svg" download="wixa-favicon.svg">أيقونة المتصفح</a></span></figcaption></figure>
      </div>
      <div class="bg-rules">
        <div><h4>المساحة الحرة</h4><div class="bg-clear" style="--p:${t.primary}">${svgArt("lockup", t.primary)}</div><p>اترك حول الشعار مساحة فارغة لا تقل عن <b>ربع ارتفاع الرمز</b> من كل جهة، لا يدخلها نص أو صورة.</p></div>
        <div><h4>أصغر حجم</h4><p>الشعار الكامل: <b>120px</b> عرضاً على الشاشة و<b>30mm</b> في الطباعة.<br>الرمز وحده: <b>24px</b> ارتفاعاً على الشاشة و<b>8mm</b> في الطباعة. أصغر من ذلك يفقد وضوحه.<br><b>النِّسَب:</b> ارتفاع الاسم = 58٪ من ارتفاع الرمز، والمسافة بينهما = 46٪ منه. في الموقع: الرمز 26px في الأعلى و30px في التذييل.</p></div>
        <div><h4>ممنوع</h4><ul class="bg-dont"><li>تمديد الشعار أو ضغطه أو تدويره</li><li>تغيير ألوانه خارج الألوان أدناه</li><li>إضافة ظل أو حدود أو توهج — عدا «النسخة المتحركة» أدناه</li><li>وضعه فوق صورة مزدحمة دون طبقة لون</li><li>إعادة كتابة الاسم بخط آخر</li><li>تغيير المسافة بين الرمز والاسم</li><li>إضافة حركة دوران أو تشويه</li></ul><h4 style="margin:14px 0 6px">النسخة المتحركة</h4><p>في الواجهة الرئيسية فقط، بحجم كبير: يُرسم الشعار ثم يظهر حوله <b>توهج</b> هادئ، و<b>لمعة</b> تعبر عليه، و<b>نقطة سماوية</b> تتحرك على مساره، مع طفو بطيء. لا تُستخدم هذه المؤثرات على الشعار الصغير أو في المطبوعات.</p><ul style="display:none"></ul></div>
      </div></div>

    <div class="card"><div class="card__head"><div><h3>2. الألوان</h3><p>اضغط على أي لون لنسخ رمزه. النسب: نحو <b>60٪</b> خلفيات فاتحة، <b>30٪</b> اللون الأساسي والداكن، <b>10٪</b> اللون المساعد.</p></div></div>
      <div class="bg-ratio"><i style="flex:6;background:${t.bg}"></i><i style="flex:3;background:${t.primary}"></i><i style="flex:1;background:${t.accent}"></i></div>
      <div class="bg-sws">${colors.map(sw).join("")}</div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">التقييم حسب معيار WCAG: <b>AA</b> = مناسب للنص العادي (4.5:1 فأكثر)، <b>AAA</b> = ممتاز (7:1)، «AA كبير» = للعناوين الكبيرة فقط.</p></div>

    <div class="card"><div class="card__head"><div><h3>3. الوضع النهاري والليلي</h3><p>ألوان الوضع الليلي مشتقة تلقائياً من اللون الأساسي، فتبقى الهوية نفسها في الوضعين.</p></div></div>
      <div class="bg-modes">${[["النهاري", t.bg, t.surface, t.text, t.muted, t.primary], ["الليلي", dk.bg, dk.surface, dk.text, dk.muted, dk.fg]].map(([n, bg, sf, tx, mu, br]) => `
        <div class="bg-mode" style="background:${bg};color:${tx}"><b>${n}</b>
          <div class="bg-mode__card" style="background:${sf}"><span style="color:${br};font-weight:800">${svgArt("mark", br)}</span><strong style="color:${tx}">عنوان البطاقة</strong><span style="color:${mu}">وصف قصير بلون النص الثانوي.</span><em style="background:${br};color:#fff">زر رئيسي</em></div>
          <div class="bg-mode__codes">${[["الخلفية", bg], ["السطح", sf], ["النص", tx], ["الثانوي", mu], ["الهوية", br]].map(([k, v]) => `<span><i style="background:${v}"></i>${k} <code>${v.toUpperCase()}</code></span>`).join("")}</div>
        </div>`).join("")}</div></div>

    <div class="card"><div class="card__head"><div><h3>4. الخط</h3><p>الخط الرسمي: <b>${esc(font)}</b> — عائلة واحدة للعربية والإنجليزية معاً. ${font === "Alexandria" ? "مستضاف على موقعك نفسه، ومرخّص للاستخدام التجاري المجاني (SIL OFL)." : ""}</p></div></div>
      <div class="bg-type" style="font-family:'${esc(font)}', system-ui">
        ${[[800, "عريض جداً — العناوين"], [700, "عريض — عناوين البطاقات"], [500, "متوسط — الأزرار"], [400, "عادي — النصوص"]].map(([w, n]) => `<div class="bg-type__row"><span class="muted">${w}</span><p style="font-weight:${w}">نبني المستقبل الرقمي · Building the digital future</p><small class="muted">${n}</small></div>`).join("")}
      </div>
      <h4 style="margin:18px 0 8px">سلّم الأحجام (بكسل)</h4>
      <div class="table-wrap" tabindex="0" role="region" aria-label="المقاسات"><table class="bg-table"><thead><tr><th>العنصر</th><th>جوال</th><th>تابلت</th><th>كمبيوتر</th><th>الوزن</th><th>ارتفاع السطر</th></tr></thead>
        <tbody>${scale.map(([n, a, b, c, w, lh]) => `<tr><td>${n}</td><td>${a}</td><td>${b}</td><td>${c}</td><td>${w}</td><td>${lh}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted" style="font-size:12px">الأوزان المستخدمة أربعة فقط: 400 و500 و700 و800. كل الأحجام من هذا السلّم، والأصغر 14px. الأرقام بالإنجليزية (123) في الأسعار وأرقام الهواتف لوضوحها. لا تستخدم أكثر من وزنين في نفس السطر.</p>
      ${font === "Alexandria" ? `<p style="margin:0"><a href="/fonts/alexandria/OFL.txt" target="_blank" rel="noopener">ترخيص الخط</a> · <a href="https://fonts.google.com/specimen/Alexandria" target="_blank" rel="noopener">تنزيل الخط للتصميم (Google Fonts)</a></p>` : ""}</div>

    <div class="card"><div class="card__head"><div><h3>5. منحنى WIXA</h3><p>الموجة المأخوذة من منحنيي الشعار. علامة مميزة تفتتح كل قسم في الموقع.</p></div></div>
      <svg class="bg-wave" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="bgwv" x1="0" x2="1"><stop offset="0" stop-color="${t.primary}"/><stop offset=".5" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.primary}"/></linearGradient></defs><path fill="none" stroke="url(#bgwv)" stroke-width="2.5" stroke-linecap="round" d="M0 20 C 100 0, 200 0, 300 20 S 500 40, 600 20 S 800 0, 900 20 S 1100 40, 1200 20"/></svg>
      <ul class="bg-list"><li>خط واحد بسمك <b>2px</b> وتدرج من اللون الأساسي إلى المساعد ثم الأساسي.</li><li>يُستخدم فاصلاً أعلى العناوين أو بين الأقسام، وفي المطبوعات أسفل الترويسة.</li><li>لا يُملأ ولا يُكرر كخلفية ولا يُوضع خلف النص.</li></ul></div>

    <div class="card"><div class="card__head"><div><h3>6. العناصر والمسافات</h3><p>المقاسات المعتمدة في الموقع، مبنية على إرشادات Apple وGoogle.</p></div></div>
      <div class="bg-btns"><span class="bg-btn" style="background:${t.primary}">زر رئيسي</span><span class="bg-btn bg-btn--ghost" style="color:${t.text};border-color:${t.muted}55">زر ثانوي</span><span class="bg-btn" style="background:#0E7C47">راسلنا على واتساب</span></div>
      <ul class="bg-list"><li>الأزرار: ارتفاع <b>48px</b> (جوال وتابلت) و<b>50px</b> (كمبيوتر)، حواف دائرية كاملة.</li><li>أي عنصر يُلمس لا يقل عن <b>44×44px</b>، والمسافة بين عنصرين متجاورين لا تقل عن <b>8px</b>.</li><li>الأزرار العائمة (المحادثة وواتساب) تختفي تلقائياً عندما تكون فوق أزرار الواجهة على الجوال.</li><li>شعارات الشركاء تُعرض بألوانها الأصلية وبدقة لا تقل عن <b>ضعف</b> حجم ظهورها (مثلاً 400px عرضاً لشعار يظهر بعرض 200px).</li><li>زوايا البطاقات: <b>${Number(t.radius) || 22}px</b>.</li><li>المسافة بين الأقسام: 56 / 80 / 104px (جوال / تابلت / كمبيوتر).</li></ul>
      <div class="bg-space">${space.map((s) => `<span><i style="width:${s}px;height:${s}px;background:${t.primary}"></i>${s}</span>`).join("")}</div></div>

    <div class="card"><div class="card__head"><div><h3>الظلال والطبقات</h3><p>ظلال ناعمة بلون النص نفسه وليست سوداء، حتى تبقى الواجهة صافية.</p></div></div>
      <div class="bg-shadows">${[["البطاقة", `0 1px 2px ${t.text}0A, 0 12px 40px -12px ${t.text}1F`], ["الزر الرئيسي", `0 12px 30px -8px ${t.primary}99`], ["النوافذ والقوائم", `0 24px 60px -20px ${t.text}40`]].map(([n, sh]) => `<span style="box-shadow:${sh}">${n}</span>`).join("")}</div>
      <ul class="bg-list"><li>ثلاثة مستويات فقط: البطاقة، الزر الرئيسي (بلون الهوية)، النوافذ المنبثقة.</li><li>في الوضع الليلي تقل الظلال وتُستبدل بحدود رفيعة.</li><li>لا ظلال على النصوص أو الشعار.</li></ul></div>

    <div class="card"><div class="card__head"><div><h3>مكوّنات الواجهة</h3><p>أنماط ثابتة تتكرر في الموقع ولوحة التحكم، حتى يبقى كل جزء جديد بنفس الهوية.</p></div></div>
      <h4 style="margin:4px 0 8px">القائمة الفرعية (شريط تحت عنوان الصفحة)</h4>
      <div class="bg-subnav" data-scroll tabindex="0" role="region" aria-label="مثال القائمة الفرعية"><span class="on" style="color:${t.primary};border-color:${t.primary}">المفتوحة <i style="background:${t.primary};color:#fff">3</i></span><span>جديد <i>1</i></span><span>تواصلنا <i>2</i></span><span>مكتمل <i>0</i></span></div>
      <ul class="bg-list"><li>كل قوائم الصفحة (الحالات، الفلاتر، الأقسام، الفترة) في <b>شريط واحد تحت العنوان</b> — نفس الشكل على الجوال والتابلت والكمبيوتر.</li><li>المختار: نص بلون الهوية + خط سفلي <b>3px</b>؛ الأعداد في دائرة صغيرة تمتلئ بلون الهوية عند الاختيار.</li><li>إذا كثرت التبويبات تُسحب جانبياً داخل الشريط ولا تمدّ الصفحة. أزرار الصفحة (تصدير، حفظ) بجانب العنوان وليست داخل الشريط.</li></ul>
      <h4 style="margin:18px 0 8px">البطاقات المتحركة (الجوال والتابلت)</h4>
      <div class="bg-dots"><i></i><i class="on" style="background:${t.primary}"></i><i></i><i></i></div>
      <ul class="bg-list"><li>الخدمات، حسب المجال، المشاريع، والباقات: <b>صف يُسحب يميناً ويساراً</b> بدل قائمة طويلة، وتظهر حافة البطاقة التالية لتدل على المزيد.</li><li>تحته نقاط: النقطة الحالية أطول (24px) بلون الهوية، والباقي 8px رمادية. على الكمبيوتر تبقى شبكة.</li></ul>
      <h4 style="margin:18px 0 8px">القوائم</h4>
      <ul class="bg-list"><li>القائمة العلوية <b>7 روابط أو أقل</b> + زر «ابدأ مشروعك» البارز دائماً في نهايتها.</li><li>زر «ابدأ مشروعك» في الشريط العلوي <b>على الكمبيوتر فقط</b>. أقل من <b>1240px</b> تتحول الروابط إلى زر ☰، ويبقى «ابدأ مشروعك» داخل القائمة وزراً كبيراً في أعلى الصفحة.</li><li>الروابط الثانوية (من نحن، الأسئلة، الخصوصية) في أسفل الصفحة فقط. أماكنها تُدار من المحتوى ← القوائم.</li><li><b>أقسام الصفحة الرئيسية</b> (خدماتنا، حلول حسب مجالك، نماذج من عملنا، الباقات والأسعار، الحاسبة، شركاؤنا): الضغط عليها يحرّك الصفحة الرئيسية إلى القسم ويقف تحت الشريط العلوي مباشرة. <b>صفحات مستقلة فقط:</b> الوظائف، تواصل معنا، المقالات، من نحن، الأسئلة الشائعة.</li><li>عند فتح قائمة أو نافذة تثبت الصفحة التي تحتها.</li></ul>
      <h4 style="margin:18px 0 8px">لون الموجة (لمسة مميزة قليلة جداً)</h4>
      <div class="bg-wave"><span style="background:linear-gradient(100deg, ${t.primary}, color-mix(in srgb, ${t.accent} 45%, ${t.primary}))">02</span><i style="background:linear-gradient(100deg, ${t.primary}, color-mix(in srgb, ${t.accent} 45%, ${t.primary}))"></i><em style="background:linear-gradient(100deg, ${t.primary}, color-mix(in srgb, ${t.accent} 45%, ${t.primary}))">الأكثر مناسبة</em></div>
      <ul class="bg-list"><li>تدرّج من اللون الأساسي إلى مزيج 45% من اللون المساعد — نفس ألوان منحنى WIXA وخط الشعار، وأغمق قليلاً في طرفه حتى يبقى النص الأبيض عليه بتباين ≈5:1.</li><li>يُستخدم <b>فقط</b> لما يجب أن يلفت النظر: كل أزرار «ابدأ مشروعك» (الشريط العلوي، القائمة، أعلى الصفحة، آخر الصفحة)، زر «تتبع طلبك»، رقم الخطوة الحالية في «كيف نعمل»، النقطة الحالية تحت الصفوف المتحركة، وشارة «الأكثر مناسبة».</li><li>لا يُستخدم لباقي الأزرار ولا للنصوص الطويلة ولا للخلفيات الكبيرة — باقي الأزرار (اطلب هذه الباقة، أرسل…) تبقى باللون الأساسي حتى يبقى «ابدأ مشروعك» هو الأبرز.</li></ul>
      <h4 style="margin:18px 0 8px">العناوين</h4>
      <ul class="bg-list"><li>كل عنوان صفحة أو قسم <b>في الوسط</b> ومعه سطره التوضيحي، بنفس الحجم في كل الصفحات: <b>28px</b> على الجوال، <b>36px</b> على التابلت، <b>44px</b> على الكمبيوتر.</li><li>نص الفقرات 16px على الجوال و18px على الكمبيوتر. خط واحد (Alexandria) في الموقع ولوحة التحكم، بالعربية والإنجليزية، في الوضعين.</li><li>كل صفحة — حتى صفحات الخدمات والمشاريع والمقالات — تتبع اختيار الزائر للوضع النهاري أو الليلي وفيها زر التبديل.</li></ul>
      <h4 style="margin:18px 0 8px">الطلب والهدايا</h4>
      <div class="bg-gifts"><span style="background:linear-gradient(135deg, ${t.primary}, ${t.accent})">🎁<small>اضغط لكشف الهدية</small></span><span><em style="background:#0E7C47">مجاناً</em><b style="color:${t.primary}">هوية بصرية</b></span></div>
      <ul class="bg-list"><li>كل أزرار الطلب تؤدي إلى صفحة واحدة <b dir="ltr">/order</b>: بطاقة «طلبك» ثم الاسم والهاتف فقط (البريد اختياري في كل الموقع).</li><li>تحت زر الإرسال سطور الطمأنة بعلامة ✓ خضراء: لا دفع الآن · نتصل خلال يوم عمل · 75% / 25%.</li><li>الهدايا: بطاقة بتدرج الهوية وعلبة 🎁 تنقلب إلى وجه أبيض فيه شارة خضراء «مجاناً». الخصم شارة «محفوظ لك».</li><li>رقم الطلب بصيغة <b dir="ltr">WX-YYMMDD-XXXX</b>، بخط عريض وبلون الهوية.</li></ul>
      <h4 style="margin:18px 0 8px">تتبع الطلب</h4>
      <div class="bg-social"><span style="width:auto;padding:0 18px;border-radius:99px;background:linear-gradient(100deg, ${t.primary}, color-mix(in srgb, ${t.accent} 45%, ${t.primary}));color:#fff;font-weight:700">📦 تتبع طلبك</span></div>
      <ul class="bg-list"><li>زر بلون <b>الموجة</b> (حبة كاملة الاستدارة، 44px) <b>فوق أيقونات التواصل</b> في أسفل كل صفحة — مختلف عنها عمداً حتى لا يضيع بينها.</li><li>يفتح <b dir="ltr">/track</b>: رقم الطلب + الهاتف الذي طُلب به، فتظهر المراحل: وصلنا طلبك ← تواصلنا ← أرسلنا العرض ← العمل جارٍ ← تم التسليم.</li><li>المرحلة المنجزة دائرة ممتلئة بلون الهوية، والحالية بإطار وهالة، والقادمة رمادية. التواريخ بأرقام 1 2 3 في اللغتين.</li><li>المتابعة تكون <b>بالدردشة المباشرة</b> (واتساب فقط إذا كانت الدردشة متوقفة): أول خيار فيها «تتبع طلبي»، وتعرض آخر طلب للجهاز تلقائياً، ومن نسي رقمه يكتب هاتفه واسمه. كل حالة لها جملة ودّية قصيرة تُعدّل من إعدادات الدردشة.</li></ul>
      <h4 style="margin:18px 0 8px">الشركاء</h4>
      <ul class="bg-list"><li>العنوان «شركاؤنا» بحجم عناوين الأقسام، وبلا منحنى فوقه لأنه يلي الواجهة الأولى مباشرة.</li><li>الشعار يملأ معظم البطاقة (90% عرضاً) على بطاقة فاتحة في الوضعين.</li><li><b>الشبكة:</b> الشعارات رمادية باهتة، وتظهر ألوانها عند المرور أو الضغط. <b>الشريط المتحرك:</b> ملوّنة دائماً.</li></ul>
      <h4 style="margin:18px 0 8px">أيقونات التواصل الاجتماعي</h4>
      <div class="bg-social"><span style="background:${t.primary}1A;color:${t.text}">f</span><span style="background:${t.primary}1A;color:${t.text}">◎</span><span style="background:#1877F2;color:#fff">f</span><span style="background:radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%);color:#fff">◎</span></div>
      <ul class="bg-list"><li>في الوضع العادي: دائرة ممتلئة بلون الهوية الفاتح (10%) بلا إطار، والأيقونة بلون النص بحجم <b>19px</b>.</li><li>عند المرور أو الضغط فقط: لون الشبكة الرسمي والأيقونة بيضاء (فيسبوك أزرق، إنستغرام تدرّجه، البريد بنفسجي الهوية).</li><li>لا تُلوّن كلها دائماً — الألوان المتجاورة تشتت العين وتسرق الانتباه من المحتوى.</li><li>زرّا الزاوية: واتساب (أخضر) والدردشة المباشرة (<b>سماوي</b> بلون خط الشعار وأيقونة داكنة #062A33 — الأيقونة البيضاء على السماوي ضعيفة الوضوح) — نفس الحجم (52px جوال، 56px كمبيوتر) ونفس الارتفاع، كلٌّ في زاوية.</li></ul>
      <h4 style="margin:18px 0 8px">لوحة التحكم</h4>
      <ul class="bg-list"><li>نفس خط الموقع (Alexandria) ونفس لون الهوية.</li><li>عنوان الصفحة بمستوى زر القائمة ☰ (19px جوال، 22px كمبيوتر) ووصفه تحته بخط صغير.</li><li>زر الإضافة دائرة «+» فقط على <b>يسار سطر البحث</b>، واسمه يظهر عند المرور («إضافة مشروع»).</li><li>القوائم الفرعية في الشريط تحت العنوان، والأزرار (تصدير، حفظ) بجانب العنوان.</li></ul>
      <h4 style="margin:18px 0 8px">النصوص</h4>
      <ul class="bg-list"><li>جملة أو جملتان لكل جواب أو وصف؛ الفائدة أولاً.</li><li>العربي والإنجليزي بنفس المعنى والطول تقريباً.</li><li>بلا مبالغة («رائدة»، «استثنائية»)، وكل وعد في الموقع يطابق الضمانات والهدايا (لا تُعرض كهدية ميزة مضمونة أصلاً).</li></ul>
      <h4 style="margin:18px 0 8px">الواجهة الأولى (الشعار)</h4>
      <div class="bg-hero"><svg viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="${t.primary}" stroke-opacity=".35" stroke-width="1"><circle cx="100" cy="100" r="96"/><ellipse cx="100" cy="100" rx="96" ry="34"/><ellipse cx="100" cy="100" rx="96" ry="66"/><ellipse cx="100" cy="100" rx="34" ry="96"/><ellipse cx="100" cy="100" rx="66" ry="96"/></g><svg x="12" y="68" width="176" height="64" viewBox="0 0 2021 982"><use href="/logo.svg#m" fill="${t.primary}" style="color:${t.primary}"/></svg></svg><span><i style="color:${t.accent}">✦</i> الشريك التقني لمشاريعك <i style="color:${t.accent}">✦</i></span></div>
      <ul class="bg-list"><li><b>كرة أرضية</b> خطية خلف الشعار، أكبر منه قليلاً (112%)، شفافة جداً (9% نهاري، 20% ليلي)، وخطوط الطول تدور ببطء (24 ثانية).</li><li>أعلى الكرة تحت الشريط العلوي مباشرة، وعبارة الشارة داخل أسفل الكرة <b>بين نجمتين ✦</b> باللون المساعد، و«نبني المستقبل الرقمي» يبدأ عند نهاية الكرة.</li><li><b>خط نيون قصير</b> باللون المساعد (السماوي نفسه في الوضعين) يرسم نفسه على حافة الشعار وينحني مع منحنياته: طوله 10% من المحيط، دورة كل 15 ثانية، توهّج خفيف.</li><li>للأداء على الجوالات الضعيفة: كل حركة في طبقة مستقلة، ولا تأثير تمويه (blur) يُعاد رسمه مع الحركة.</li></ul>
      <h4 style="margin:18px 0 8px">الصفحات الداخلية</h4>
      <ul class="bg-list"><li>الصفحة الداخلية تبدأ بعنوانها مباشرة، <b>بلا</b> منحنى WIXA فوقه؛ المنحنى يفصل بين أقسام الرئيسية فقط.</li><li>لا تُلصق كلمة إنجليزية بحرف عربي (مثل «وAndroid») — الخط يشوّه شكلها؛ اكتبها بالعربية أو اترك مسافة.</li></ul></div>

    <div class="card"><div class="card__head"><div><h3>المعايير العالمية المعتمدة</h3><p>كل جزء جديد في الموقع أو لوحة التحكم يجب أن يحقق هذه القواعد. تُفحص آلياً قبل كل نشر.</p></div></div>
      <div class="table-wrap" tabindex="0" role="region" aria-label="المعايير"><table class="bg-table"><thead><tr><th>القاعدة</th><th>الحد المطلوب</th><th>المرجع</th></tr></thead><tbody>
        <tr><td>تباين النص العادي مع خلفيته</td><td><b>4.5:1</b> على الأقل</td><td dir="ltr">WCAG 2.2 · 1.4.3</td></tr>
        <tr><td>تباين النص الكبير (24px، أو 19px عريض)</td><td><b>3:1</b></td><td dir="ltr">WCAG 2.2 · 1.4.3</td></tr>
        <tr><td>تباين الأيقونات وحدود الحقول والأزرار</td><td><b>3:1</b></td><td dir="ltr">WCAG 2.2 · 1.4.11</td></tr>
        <tr><td>حجم ما يُضغط بالإصبع</td><td><b>44px</b> للأزرار (48px معتمد عندنا)، و24px أدنى حد لأي عنصر صغير</td><td dir="ltr">Apple HIG · Material · WCAG 2.5.8</td></tr>
        <tr><td>الروابط داخل النص</td><td>بخط تحتها، لا باللون وحده</td><td dir="ltr">WCAG 2.2 · 1.4.1</td></tr>
        <tr><td>التنقل بلوحة المفاتيح</td><td>إطار واضح بلون الهوية (2px) حول العنصر المختار</td><td dir="ltr">WCAG 2.2 · 2.4.7</td></tr>
        <tr><td>الحركة</td><td>تتوقف لمن فعّل «تقليل الحركة» في جهازه</td><td dir="ltr">WCAG 2.2 · 2.3.3</td></tr>
        <tr><td>اللغة والاتجاه</td><td>عربي من اليمين وإنجليزي من اليسار، بنفس المعنى، والأرقام 1 2 3</td><td dir="ltr">W3C i18n</td></tr>
      </tbody></table></div>
      <ul class="bg-list"><li><b>الزوايا:</b> البطاقات 22px، النماذج الكبيرة 28px، الحقول 14px، الأزرار حبة كاملة الاستدارة.</li><li><b>الأزرار:</b> ارتفاع 48px في كل الموقع. <b>الحقول:</b> 48px.</li><li><b>العناوين:</b> 28 / 36 / 44px (جوال / تابلت / كمبيوتر)، والفقرات 16 / 18px — في الموقع ولوحة التحكم وكل الصفحات المستقلة.</li><li><b>النص الثانوي</b> في لوحة التحكم #5B6270 (بدل #6B7280 الذي كان دون الحد)، و<b>الأخضر</b> #0E7C47 للنجاح والعدّادات، و<b>البرتقالي</b> #8A5A10 للتنبيه، و<b>الأحمر</b> #C62828 للخطأ والحذف.</li><li>استثناءات مقصودة: زر واتساب بلونه الرسمي، ومعاينة جوجل بخط جوجل.</li></ul></div>

    <div class="card"><div class="card__head"><div><h3>7. الأيقونات</h3><p>خطية بسيطة بسمك 1.8، بزوايا دائرية، داخل مربع بخلفية فاتحة من لون الهوية.</p></div></div>
      <div class="bg-icons">${Object.entries(ICONS).map(([k, svg]) => `<span title="${k}" style="color:${t.primary};background:${t.primary}14">${svg}</span>`).join("")}</div></div>

    <div class="card"><div class="card__head"><div><h3>8. أسلوب الكتابة</h3><p>كيف نتحدث باسم ${esc(brandAr)}.</p></div></div>
      <ul class="bg-list"><li><b>واضح ومباشر:</b> جمل قصيرة، الفائدة قبل التقنية.</li><li><b>نخاطب الشخص:</b> «مشروعك» و«نبقى معك» وليس «مشروعكم».</li><li><b>بلا مبالغة:</b> لا أرقام أو وعود غير مثبتة.</li><li><b>الإنجليزية:</b> بالتهجئة الأمريكية (analyze, center) وبنفس النبرة.</li><li><b>الاسم:</b> «ويكسا» بالعربي و«WIXA» بالإنجليزي، بأحرف كبيرة دائماً.</li></ul></div>
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
  $("#brandPdf").onclick = () => { document.body.classList.add("print-brand"); setTimeout(() => { print(); document.body.classList.remove("print-brand"); }, 50); };
}
