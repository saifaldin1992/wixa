/* Dashboard → القوائم: the site's menus edited as iOS Settings rows.
   • one row per link: its name, where it shows (top bar and ☰ menu / footer / hidden) and its footer group, and a
     note when the site hides it by itself (no articles yet, its section is off, its page is not published);
     drag the handle (or ↑ ↓ on it) to change the order; tap the row to edit it in a sheet;
   • «إضافة رابط»: a service, a page added in the dashboard, or any web address;
   • «ابدأ مشروعك»: its name and where it goes;
   • the footer: its groups (rename, add, order) and whether «الخدمات» lists the services by name.
   Everything is kept in the site settings (settings.nav, settings.ui, settings.footer_groups) and shown in the
   preview at once; the site reads it through public/shared.js (navPlan) and public/js/site-structure.js. */
import { $, $$, esc, sb, settings, openModal, closeModal, confirmBox } from "../core.js";
import { UI_DEFAULTS } from "../../../js/ui-strings.js";
import { FOOTER_GROUPS, customLink, footerGroups, groupOf, navLink } from "../../../js/site-structure.js";
import { sitePages } from "../../../js/site-pages.js";
import { changed, quietly } from "../settings.js";

const NAMES = { home: "الرئيسية", services: "الخدمات", projects: "أعمالنا", pricing: "الأسعار", about: "من نحن", partners: "شركاؤنا",
  careers: "الوظائف", contact: "تواصل معنا", faq: "الأسئلة الشائعة", blog: "المقالات", privacy: "سياسة الخصوصية" };
const AT = [["both", "القائمة والأسفل"], ["menu", "القائمة فقط"], ["footer", "الأسفل فقط"], ["hidden", "مخفي"]];
const AT_SHORT = [["both", "القائمة والأسفل"], ["menu", "القائمة"], ["footer", "الأسفل"], ["hidden", "مخفي"]];
const KINDS = [["service", "خدمة"], ["page", "صفحة مضافة"], ["url", "رابط آخر"]];
const CTA = [["order", "صفحة الطلب"], ["contact", "صفحة تواصل معنا"], ["calc", "حاسبة التكلفة"], ["whatsapp", "واتساب"], ["url", "رابط آخر"]];
const UIKEY = (k) => (k === "privacy" ? "privacy" : `nav_${k}`);
const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
const CHEV = '<svg class="ios-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>';
const newId = (p) => `${p}${Math.random().toString(36).slice(2, 9)}`;

// what the site has right now, to say which links it hides by itself (loaded once per visit to this tab)
let known = null;
async function loadKnown() {
  const count = (t) => sb.from(t).select("id", { count: "exact", head: true }).eq("published", true).then((r) => (r.error ? 1 : r.count || 0));
  const [sv, posts, partners] = await Promise.all([sb.from("services").select("id, title_ar, title_en, published").order("sort"), count("posts"), count("partners")]);
  known = { services: (sv.data || []).filter((x) => x.published), posts, partners };
}
const ctx = () => ({ services: known?.services || [], pages: sitePages(settings) });
const nav = () => { quietly(() => { if (!settings.nav || typeof settings.nav !== "object") settings.nav = {}; }); return settings.nav; };
const plan = () => window.WIXA.navPlan(settings);
const saveList = (list) => { nav().items = list; changed(); };
const uiOf = (L) => { quietly(() => { settings.ui ??= {}; settings.ui[L] ??= {}; }); return settings.ui[L]; };

function nameOf(x, L = "ar") {
  if (x.kind) return customLink(x, ctx()).label(L) || (x.kind === "url" ? x.url : "رابط");
  return settings.ui?.[L]?.[UIKEY(x.k)] || UI_DEFAULTS[L][UIKEY(x.k)] || NAMES[x.k] || x.k;
}
// why the site hides a link the owner placed (null when it shows)
function autoHidden(x) {
  if (x.at === "hidden" || !known) return null;
  if (x.kind) {
    if (customLink(x, ctx()).shown) return null;
    return { service: "الخدمة غير منشورة أو حُذفت", page: "الصفحة غير منشورة", url: "الرابط غير صالح" }[x.kind];
  }
  const empty = new Set([...(known.posts ? [] : ["blog"]), ...(known.partners ? [] : ["partners"])]);
  if (navLink(settings, x.k, empty).shown) return null;
  if (x.k === "blog" && !known.posts) return "لا توجد مقالات منشورة بعد";
  if (x.k === "partners" && !known.partners) return "لا يوجد شركاء بعد";
  return "قسمه مخفي في «ترتيب الأقسام»";
}
const groupName = (k) => footerGroups(settings).find((g) => g.k === k)?.name_ar || k;
const kindName = (x) => (x.kind ? KINDS.find(([k]) => k === x.kind)[1] : "");

// ---------------------------------------------------------------- drag to reorder (touch, mouse and keyboard)
function sortable(list, onMove) {
  $$("[data-grip]", list).forEach((g) => {
    g.addEventListener("keydown", (e) => {
      const i = +g.dataset.grip, d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = list.querySelectorAll("[data-grip]").length;
      if (i + d >= 0 && i + d < n) onMove(i, i + d, true);
    });
    g.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      e.preventDefault();
      const rows = [...list.querySelectorAll(".ios-row[data-i]")], row = g.closest(".ios-row"), from = rows.indexOf(row);
      const boxes = rows.map((r) => r.getBoundingClientRect()), h = boxes[from].height, y0 = e.clientY;
      let to = from;
      g.setPointerCapture(e.pointerId); row.classList.add("is-drag");
      const move = (ev) => {
        const dy = Math.max(boxes[0].top - boxes[from].top, Math.min(boxes[rows.length - 1].bottom - boxes[from].bottom, ev.clientY - y0));
        row.style.transform = `translateY(${dy}px)`;
        const mid = boxes[from].top + h / 2 + dy;
        to = 0; boxes.forEach((b, i) => { if (i !== from && b.top + b.height / 2 < mid) to++; });
        rows.forEach((r, i) => { if (i === from) return; const s = from < to && i > from && i <= to ? -h : from > to && i < from && i >= to ? h : 0; r.style.transform = s ? `translateY(${s}px)` : ""; });
      };
      const up = () => {
        g.removeEventListener("pointermove", move);
        rows.forEach((r) => (r.style.transform = "")); row.classList.remove("is-drag");
        if (to !== from) onMove(from, to);
      };
      g.addEventListener("pointermove", move);
      g.addEventListener("pointerup", up, { once: true });
      g.addEventListener("pointercancel", up, { once: true });
    });
  });
}
const moved = (arr, from, to) => { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };
const segHtml = (id, opts, val) => `<div class="seg seg--full" id="${id}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === val ? "on" : ""}">${l}</button>`).join("")}</div>`;
const bindSeg = (root, id, onPick) => root.querySelectorAll(`#${id} button`).forEach((b) => (b.onclick = () => { root.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b)); onPick(b.dataset.v); }));

// ---------------------------------------------------------------- the tab
export async function renderMenus(body, { seg, bindLangSeg }) {
  body.innerHTML = `<p class="muted">جارٍ التحميل…</p>`;
  if (!known) await loadKnown().catch(() => { known = { services: [], posts: 1, partners: 1 }; });
  const draw = () => {
    const items = plan();
    const inMenu = items.filter((x) => (x.at === "both" || x.at === "menu") && !autoHidden(x)).length;
    const row = (x, i) => {
      const why = autoHidden(x);
      const where = AT.find(([v]) => v === x.at)[1] + (x.at === "both" || x.at === "footer" ? ` · ${groupName(groupOf(x, settings))}` : "");
      return `<div class="ios-row${x.at === "hidden" ? " is-off" : ""}" data-i="${i}">
        <button type="button" class="ios-row__grip" data-grip="${i}" aria-label="اسحب لتغيير ترتيب «${esc(nameOf(x))}» (أو استخدم الأسهم)">${GRIP}</button>
        <button type="button" class="ios-row__main" data-edit="${i}">
          <span class="ios-row__t">${esc(nameOf(x))}${x.kind ? `<small class="ios-tag">${kindName(x)}</small>` : ""}</span>
          <span class="ios-row__s">${where}${why ? `<span class="ios-warn">مخفي تلقائياً: ${why}</span>` : ""}</span>
          ${CHEV}</button></div>`;
    };
    const ui = { ar: settings.ui?.ar || {}, en: settings.ui?.en || {} };
    const cta = nav().cta || {};
    const groups = footerGroups(settings);
    body.innerHTML = `
      <p class="muted" style="margin-top:0"><b>القائمة</b> = الشريط العلوي على الكمبيوتر وقائمة ☰ على الجوال. <b>الأسفل</b> = أسفل كل صفحة. اسحب المقبض ≡ لتغيير الترتيب، واضغط على الرابط لتعديله.</p>
      <div class="ios-head"><span>الروابط</span><span class="${inMenu > 6 ? "ios-warn" : "muted"}">في القائمة ${inMenu}${inMenu > 6 ? " — نقترح 6 أو أقل كما في apple.com" : ""}</span></div>
      <div class="ios-list" id="navList">${items.map(row).join("")}</div>
      <div class="ios-actions"><button type="button" class="b" id="navAdd">+ إضافة رابط</button><button type="button" class="b b--ghost" id="navReset">↺ الترتيب المقترح</button></div>

      <div class="ios-head"><span>زر «ابدأ مشروعك»</span></div>
      <div class="ios-list ios-list--form">
        <label class="f"><span>الاسم بالعربي</span><input id="ctaAr" value="${esc(ui.ar.nav_start || "")}" placeholder="${esc(UI_DEFAULTS.ar.nav_start)}"></label>
        <label class="f"><span>الاسم بالإنجليزي</span><input id="ctaEn" dir="ltr" value="${esc(ui.en.nav_start || "")}" placeholder="${esc(UI_DEFAULTS.en.nav_start)}"></label>
        <label class="f"><span>يفتح</span><select id="ctaTo">${CTA.map(([v, l]) => `<option value="${v}" ${(cta.to || "order") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="f" id="ctaUrlRow" ${cta.to === "url" ? "" : "hidden"}><span>الرابط</span><input id="ctaUrl" dir="ltr" value="${esc(cta.url || "")}" placeholder="https://… أو /صفحة"></label>
      </div>
      ${cta.to === "whatsapp" && !String(settings.contact?.whatsapp || "").replace(/\D/g, "") ? `<p class="ios-warn" style="margin:6px 4px 0">لا يوجد رقم واتساب في «بيانات الشركة ← التواصل»؛ سيفتح الزر صفحة الطلب حتى تضيفه.</p>` : ""}

      <div class="ios-head"><span>أسفل الموقع</span></div>
      <div class="ios-list ios-list--form">
        <label class="switch"><input type="checkbox" id="footSvc" ${nav().footer_services !== false ? "checked" : ""}><i></i>«الخدمات» تعرض كل خدمة باسمها</label>
      </div>
      <div class="ios-head"><span>مجموعات الروابط</span></div>
      <div class="ios-list" id="grpList">${groups.filter((g) => g.k !== "legal").map((g, i) => `<div class="ios-row" data-i="${i}">
          <button type="button" class="ios-row__grip" data-grip="${i}" aria-label="اسحب لتغيير ترتيب مجموعة «${esc(g.name_ar)}»">${GRIP}</button>
          <button type="button" class="ios-row__main" data-grp="${esc(g.k)}"><span class="ios-row__t">${esc(g.name_ar)}</span><span class="ios-row__s" dir="ltr">${esc(g.name_en)}</span>${CHEV}</button></div>`).join("")}
        <div class="ios-row ios-row--fixed"><span class="ios-row__grip" aria-hidden="true"></span><button type="button" class="ios-row__main" data-grp="legal"><span class="ios-row__t">${esc(groupName("legal"))}</span><span class="ios-row__s">سطر صغير في آخر الصفحة، يبقى أخيراً دائماً</span>${CHEV}</button></div>
      </div>
      <div class="ios-actions"><button type="button" class="b" id="grpAdd">+ إضافة مجموعة</button></div>`;

    // links
    sortable($("#navList"), (from, to, keys) => { saveList(moved(plan(), from, to)); draw(); if (keys) $(`#navList [data-grip="${to}"]`)?.focus(); });
    $$("#navList [data-edit]").forEach((b) => (b.onclick = () => editLink(+b.dataset.edit, draw)));
    $("#navAdd").onclick = () => editLink(-1, draw);
    $("#navReset").onclick = async () => {
      if (!(await confirmBox("الترتيب المقترح", "تعود الروابط الأساسية إلى ترتيبها وأماكنها المقترحة. الروابط التي أضفتها تبقى في آخر القائمة.", "إعادة الترتيب", false))) return;
      saveList([...structuredClone(window.WIXA.DEFAULTS.nav.items), ...plan().filter((x) => x.kind)]); draw();
    };
    // «ابدأ مشروعك»
    const setName = (L, v) => { const u = uiOf(L); if (v.trim()) u.nav_start = v; else delete u.nav_start; changed(); };
    $("#ctaAr").oninput = (e) => setName("ar", e.target.value);
    $("#ctaEn").oninput = (e) => setName("en", e.target.value);
    $("#ctaTo").onchange = (e) => { nav().cta = { ...(nav().cta || {}), to: e.target.value }; changed(); draw(); };
    $("#ctaUrl") && ($("#ctaUrl").oninput = (e) => { nav().cta = { ...(nav().cta || {}), to: "url", url: e.target.value.trim() }; changed(); });
    // footer
    $("#footSvc").onchange = (e) => { nav().footer_services = e.target.checked; changed(); };
    const saveGroups = (gs) => { settings.footer_groups = gs; changed(); };
    sortable($("#grpList"), (from, to, keys) => { const gs = footerGroups(settings); const main = gs.filter((g) => g.k !== "legal"); saveGroups([...moved(main, from, to), gs.find((g) => g.k === "legal")]); draw(); if (keys) $(`#grpList [data-grip="${to}"]`)?.focus(); });
    $$("#grpList [data-grp]").forEach((b) => (b.onclick = () => editGroup(b.dataset.grp, draw)));
    $("#grpAdd").onclick = () => editGroup(null, draw);
    bindLangSeg?.();
  };
  draw();
}

// ---------------------------------------------------------------- a link's sheet (edit, or add when i < 0)
function editLink(i, redraw) {
  const list = plan(), adding = i < 0;
  const x = adding ? { k: newId("x-"), kind: "service", at: "both", ref: "", url: "", label_ar: "", label_en: "" } : { ...list[i] };
  const services = known?.services || [], pages = sitePages(settings).filter((p) => p.path);
  const groups = footerGroups(settings);
  const body = document.createElement("div");
  body.className = "stack";
  const paint = () => {
    const builtin = !x.kind;
    body.innerHTML = `
      ${adding ? `<div class="f"><span>نوع الرابط</span>${segHtml("lkKind", KINDS, x.kind)}</div>` : ""}
      ${x.kind === "service" ? `<label class="f"><span>الخدمة</span><select id="lkRef">${services.length ? services.map((s) => `<option value="${s.id}" ${String(s.id) === String(x.ref) ? "selected" : ""}>${esc(s.title_ar || s.title_en)}</option>`).join("") : `<option value="">لا توجد خدمات منشورة</option>`}</select></label>` : ""}
      ${x.kind === "page" ? `<label class="f"><span>الصفحة</span><select id="lkRef">${pages.length ? pages.map((p) => `<option value="${esc(p.path)}" ${p.path === x.ref ? "selected" : ""}>${esc(p.title_ar || p.title_en || p.path)}${p.published ? "" : " (غير منشورة)"}</option>`).join("") : `<option value="">لا توجد صفحات مضافة</option>`}</select></label>` : ""}
      ${x.kind === "url" ? `<label class="f"><span>الرابط</span><input id="lkUrl" dir="ltr" value="${esc(x.url || "")}" placeholder="https://… أو /صفحة"></label>` : ""}
      <div class="grid2">
        <label class="f"><span>الاسم بالعربي</span><input id="lkAr" value="${esc(builtin ? settings.ui?.ar?.[UIKEY(x.k)] || "" : x.label_ar || "")}" placeholder="${esc(builtin ? UI_DEFAULTS.ar[UIKEY(x.k)] || NAMES[x.k] : "اسم الخدمة أو الصفحة")}"></label>
        <label class="f"><span>الاسم بالإنجليزي</span><input id="lkEn" dir="ltr" value="${esc(builtin ? settings.ui?.en?.[UIKEY(x.k)] || "" : x.label_en || "")}" placeholder="${esc(builtin ? UI_DEFAULTS.en[UIKEY(x.k)] || "" : "")}"></label>
      </div>
      <div class="f"><span>يظهر في</span>${segHtml("lkAt", AT_SHORT, x.at)}</div>
      <label class="f"><span>مجموعته في أسفل الموقع</span><select id="lkG" ${x.at === "both" || x.at === "footer" ? "" : "disabled"}>${groups.map((g) => `<option value="${esc(g.k)}" ${g.k === groupOf(x, settings) ? "selected" : ""}>${esc(g.name_ar)}</option>`).join("")}</select></label>
      ${builtin ? `<p class="muted" style="margin:0;font-size:13px">اترك الاسم فارغاً ليظهر الاسم الأصلي. إلى أين يذهب الرابط يتبع مكان قسمه في «ترتيب الأقسام».</p>` : ""}`;
    if (adding) bindSeg(body, "lkKind", (v) => { read(); x.kind = v; x.ref = ""; paint(); });
    bindSeg(body, "lkAt", (v) => { x.at = v; body.querySelector("#lkG").disabled = !(v === "both" || v === "footer"); });
  };
  const read = () => {
    const q = (sel) => body.querySelector(sel);
    q("#lkUrl")?.setCustomValidity("");
    x.ref = q("#lkRef")?.value ?? x.ref; x.url = q("#lkUrl")?.value.trim() ?? x.url;
    x.g = q("#lkG")?.value || x.g;
    x.label_ar = q("#lkAr")?.value.trim() ?? ""; x.label_en = q("#lkEn")?.value.trim() ?? "";
  };
  paint();
  const foot = document.createElement("div");
  foot.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;width:100%";
  foot.innerHTML = `<button type="button" class="b b--primary" id="lkOk">${adding ? "إضافة" : "تم"}</button><button type="button" class="b b--ghost" id="lkNo">إلغاء</button>${!adding && x.kind ? `<button type="button" class="b b--ghost b--danger" id="lkDel" style="margin-inline-start:auto">حذف الرابط</button>` : ""}`;
  openModal(adding ? "إضافة رابط" : `«${nameOf(x)}»`, body, foot, true);
  $("#lkNo").onclick = closeModal;
  $("#lkOk").onclick = () => {
    read();
    if (x.kind === "url" && !customLink({ ...x, k: "x-check" }).shown) { $("#lkUrl").focus(); $("#lkUrl").setCustomValidity("اكتب رابطاً يبدأ بـ https:// أو / (مثل /contact)"); $("#lkUrl").reportValidity(); return; }
    if ((x.kind === "service" || x.kind === "page") && !x.ref) return closeModal();
    const out = { k: x.k, at: x.at };
    if (x.g && (x.at === "both" || x.at === "footer")) out.g = x.g;
    if (x.kind) Object.assign(out, { kind: x.kind, ref: x.ref || "", url: x.url || "", label_ar: x.label_ar, label_en: x.label_en });
    else for (const [L, v] of [["ar", x.label_ar], ["en", x.label_en]]) { const u = uiOf(L); if (v) u[UIKEY(x.k)] = v; else delete u[UIKEY(x.k)]; }
    const l = plan();
    if (adding) l.push(out); else l[i] = out;
    saveList(l); closeModal(); redraw();
  };
  const del = $("#lkDel");
  if (del) del.onclick = () => { const l = plan(); l.splice(i, 1); saveList(l); closeModal(); redraw(); };
}

// ---------------------------------------------------------------- a footer group's sheet (edit, or add when k is null)
function editGroup(k, redraw) {
  const gs = footerGroups(settings), g = k ? gs.find((x) => x.k === k) : { k: newId("g-"), name_ar: "", name_en: "" };
  const fixed = FOOTER_GROUPS.some((d) => d.k === g.k);
  const body = `<div class="stack"><div class="grid2">
      <label class="f"><span>الاسم بالعربي</span><input id="gAr" value="${esc(g.name_ar)}"></label>
      <label class="f"><span>الاسم بالإنجليزي</span><input id="gEn" dir="ltr" value="${esc(g.name_en)}"></label></div>
    ${k ? `<p class="muted" style="margin:0;font-size:13px">${g.k === "legal" ? "روابط الصفحات القانونية تظهر في سطر صغير آخر الصفحة." : "اختر الروابط التي تظهر فيها من «الروابط» أعلاه (مجموعته في أسفل الموقع)."}</p>` : ""}</div>`;
  const foot = `<button type="button" class="b b--primary" id="gOk">${k ? "تم" : "إضافة"}</button><button type="button" class="b b--ghost" id="gNo">إلغاء</button>${k && g.k !== "legal" ? `<button type="button" class="b b--ghost b--danger" id="gDel" style="margin-inline-start:auto">حذف المجموعة</button>` : ""}`;
  openModal(k ? `مجموعة «${g.name_ar}»` : "مجموعة جديدة", body, foot, true);
  $("#gNo").onclick = closeModal;
  $("#gOk").onclick = () => {
    const ar = $("#gAr").value.trim(), en = $("#gEn").value.trim();
    if (!ar) { $("#gAr").focus(); return; }
    const next = { k: g.k, name_ar: ar, name_en: en || ar };
    const list = k ? gs.map((x) => (x.k === g.k ? next : x)) : [...gs.filter((x) => x.k !== "legal"), next, gs.find((x) => x.k === "legal")];
    settings.footer_groups = list; changed(); closeModal(); redraw();
  };
  const del = $("#gDel");
  if (del) del.onclick = async () => {
    closeModal();
    if (!(await confirmBox("حذف المجموعة", `روابط «${g.name_ar}» تعود إلى مجموعاتها الأصلية.${fixed ? " يمكنك إعادة المجموعة لاحقاً من «إضافة مجموعة»." : ""}`, "حذف"))) return;
    settings.footer_groups = gs.filter((x) => x.k !== g.k);
    saveList(plan().map((x) => { if (x.g !== g.k) return x; const y = { ...x }; delete y.g; return y; }));
    redraw();
  };
}
