/* Appearance: colors, fonts, presets, light/dark mode */
import { $, $$, DEFAULTS, FONTS, I, clone, confirmBox, esc, settings } from "../core.js";
import { bindPreview, changed, previewPane, settingsActions } from "../settings.js";
import { route } from "../shell.js";

// ---------------- view: appearance ----------------
export const PRESETS = [
  { name: "ويكسا بنفسجي", theme: { primary: "#5B21B6", primaryInk: "#FFFFFF", accent: "#1FC8E3", bg: "#F7F6FB", surface: "#FFFFFF", text: "#140F1F", muted: "#625C70", dark: "#120A24" } },
  { name: "خمري تقني", theme: { primary: "#570622", primaryInk: "#FFFFFF", accent: "#1FC8E3", bg: "#F7F6F8", surface: "#FFFFFF", text: "#140C12", muted: "#665C64", dark: "#12070C" } },
  { name: "خمري ذهبي", theme: { primary: "#570622", primaryInk: "#FFFFFF", accent: "#D9A441", bg: "#FAF7F6", surface: "#FFFFFF", text: "#1A0E12", muted: "#6E5F64", dark: "#2A0711" } },
  { name: "أزرق", theme: { primary: "#1F5BFF", primaryInk: "#FFFFFF", accent: "#FFC83D", bg: "#F5F7FB", surface: "#FFFFFF", text: "#0B1220", muted: "#5E6878", dark: "#0B1220" } },
  { name: "زمردي", theme: { primary: "#0E9F6E", primaryInk: "#FFFFFF", accent: "#F5B83D", bg: "#F4F8F6", surface: "#FFFFFF", text: "#0C1A14", muted: "#5B6B63", dark: "#0C1A14" } },
  { name: "بنفسجي", theme: { primary: "#6D4AFF", primaryInk: "#FFFFFF", accent: "#FF8AB3", bg: "#F7F6FC", surface: "#FFFFFF", text: "#141127", muted: "#655F7A", dark: "#141127" } },
  { name: "غروب", theme: { primary: "#F2542D", primaryInk: "#FFFFFF", accent: "#1F2A44", bg: "#FBF7F2", surface: "#FFFFFF", text: "#1D1A16", muted: "#6E665C", dark: "#1D1A16" } },
  { name: "ذهبي فاخر", theme: { primary: "#B08D57", primaryInk: "#0E0E0E", accent: "#E9D8B4", bg: "#F7F4EE", surface: "#FFFFFF", text: "#151310", muted: "#6F685D", dark: "#151310" } },
  { name: "ليلي", theme: { primary: "#4F8CFF", primaryInk: "#FFFFFF", accent: "#22D3EE", bg: "#0B1020", surface: "#121A30", text: "#E8ECF6", muted: "#93A0BC", dark: "#050814" } },
];
export const COLOR_FIELDS = [
  ["primary", "اللون الرئيسي", "الأزرار والعناوين المميزة"], ["primaryInk", "نص الأزرار", "لون الكتابة فوق اللون الرئيسي"],
  ["accent", "لون التمييز", "الأرقام والإشارات"], ["bg", "الخلفية", "خلفية الصفحة"],
  ["surface", "البطاقات", "خلفية البطاقات والنماذج"], ["text", "النص", "لون الكتابة الأساسي"],
  ["muted", "النص الثانوي", "الأوصاف والتفاصيل"], ["dark", "القسم الداكن", "خلفية قسم الأرقام"],
];

export async function viewAppearance(view) {
  settingsActions();
  const t = settings.theme, f = settings.font;
  view.innerHTML = `<div class="split">
    <div>
      <div class="card"><div class="card__head"><div><h3>قوالب ألوان جاهزة</h3><p>اختر قالباً ثم عدّل عليه كما تحب</p></div></div>
        <div class="presets">${PRESETS.map((p, i) => `<button class="preset" data-p="${i}"><i style="background:linear-gradient(135deg,${p.theme.primary} 50%,${p.theme.accent} 50%)"></i>${p.name}</button>`).join("")}</div></div>
      <div class="card"><div class="card__head"><div><h3>الألوان</h3><p>كل لون في الموقع قابل للتغيير</p></div></div>
        <div class="colors">${COLOR_FIELDS.map(([k, label, hint]) => `<label class="color"><input type="color" data-color="${k}" value="${esc(t[k])}"><div><b style="font-size:13px">${label}</b><span>${hint}</span></div><input type="text" data-hex="${k}" value="${esc(t[k])}" maxlength="7" spellcheck="false"></label>`).join("")}</div></div>
      <div class="card"><div class="card__head"><div><h3>نوع الخط</h3><p>خطوط عربية احترافية من Google Fonts</p></div></div>
        <div class="fonts">${Object.keys(FONTS).map((name) => `<button class="font-opt ${name === f.family ? "on" : ""}" data-font="${esc(name)}"><b style="font-family:'${esc(name)}'">ويكسا Wixa</b><span>${esc(name)}</span></button>`).join("")}</div></div>
      <div class="card"><div class="card__head"><div><h3>حجم الخط والشكل</h3></div></div>
        <div class="stack">
          <label class="f"><span>حجم الخط العام</span><div class="range-row"><input type="range" min="80" max="130" step="5" id="scale" value="${Math.round(f.scale * 100)}"><output id="scaleOut">${Math.round(f.scale * 100)}%</output></div></label>
          <label class="f"><span>سماكة العناوين</span><div class="range-row"><input type="range" min="400" max="800" step="100" id="hw" value="${f.headingWeight}"><output id="hwOut">${f.headingWeight}</output></div></label>
          <label class="f"><span>استدارة الزوايا</span><div class="range-row"><input type="range" min="0" max="36" step="2" id="radius" value="${t.radius}"><output id="radiusOut">${t.radius}px</output></div></label>
          <label class="switch"><input type="checkbox" id="anim" ${settings.animations !== false ? "checked" : ""}><i></i>تفعيل الحركات والتأثيرات</label>
          <label class="f"><span>الوضع الافتراضي للزائر الجديد (يستطيع الزائر تغييره من زر 🌙)</span>
            <div class="seg" id="modeSeg">${[["auto", "حسب جهاز الزائر"], ["light", "فاتح"], ["dark", "ليلي"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${(settings.mode || "auto") === v ? "on" : ""}">${l}</button>`).join("")}</div></label>
        </div></div>
      <div class="card"><div class="card__head"><div><h3>إعادة الضبط</h3><p>استرجاع الألوان والخط الافتراضية</p></div><button class="b b--danger b--sm" id="resetTheme">${I.reset}إعادة الافتراضي</button></div></div>
    </div>
    ${previewPane()}
  </div>`;
  bindPreview();

  const setColor = (k, v) => {
    if (!/^#[0-9a-f]{6}$/i.test(v)) return;
    settings.theme[k] = v.toUpperCase();
    $(`[data-color="${k}"]`).value = v; $(`[data-hex="${k}"]`).value = v.toUpperCase();
    changed();
  };
  $$("[data-color]").forEach((i) => (i.oninput = () => setColor(i.dataset.color, i.value)));
  $$("[data-hex]").forEach((i) => (i.oninput = () => setColor(i.dataset.hex, i.value.startsWith("#") ? i.value : `#${i.value}`)));
  $$("[data-p]").forEach((b) => (b.onclick = () => {
    const pr = PRESETS[b.dataset.p];
    Object.entries(pr.theme).forEach(([k, v]) => setColor(k, v));
    if (pr.mode) { settings.mode = pr.mode; $$("#modeSeg button").forEach((x) => x.classList.toggle("on", x.dataset.v === pr.mode)); changed(); }
  }));
  $$("[data-font]").forEach((b) => {
    window.WIXA.loadFont && loadPreviewFont(b.dataset.font);
    b.onclick = () => { settings.font.family = b.dataset.font; $$("[data-font]").forEach((x) => x.classList.toggle("on", x === b)); changed(); };
  });
  const range = (id, fn, out) => { const el = $(`#${id}`); el.oninput = () => { fn(+el.value); $(`#${id}Out`).textContent = out(+el.value); changed(); }; };
  range("scale", (v) => (settings.font.scale = v / 100), (v) => `${v}%`);
  range("hw", (v) => (settings.font.headingWeight = v), (v) => v);
  range("radius", (v) => (settings.theme.radius = v), (v) => `${v}px`);
  $("#anim").onchange = (e) => { settings.animations = e.target.checked; changed(); };
  $$("#modeSeg button").forEach((b) => (b.onclick = () => { settings.mode = b.dataset.v; $$("#modeSeg button").forEach((x) => x.classList.toggle("on", x === b)); changed(); }));
  $("#resetTheme").onclick = async () => {
    if (!(await confirmBox("إعادة الافتراضي", "سيتم استرجاع الألوان والخط الافتراضية (لن يُحفظ حتى تضغط حفظ).", "استرجاع", false))) return;
    settings.theme = clone(DEFAULTS.theme); settings.font = clone(DEFAULTS.font); settings.animations = true; route();
  };
}
export const loadedFonts = new Set();
export function loadPreviewFont(name) {
  if (loadedFonts.has(name)) return; loadedFonts.add(name);
  const l = document.createElement("link"); l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}:wght@700&display=swap&text=${encodeURIComponent("ويكسا Wixa")}`;
  document.head.append(l);
}
