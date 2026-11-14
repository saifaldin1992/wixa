/* المحتوى ← «كل الروابط» and the stand-alone pages added from the dashboard:
   - links: every address of the site in one list (count, open, copy, extra addresses that lead to a page);
   - custom: pages written here (terms, payments…) — add, edit (title, address, text), hide, delete;
   - team: the /team page (people, roles, photos).
   Everything is kept in the site settings and goes live with «حفظ ونشر». */
import { $, $$, I, closeModal, confirmBox, esc, openModal, savedJSON, sb, setSaved, settings, toast } from "../core.js";
import { changed, quietly } from "../settings.js";
import { imageField } from "../fields.js";
import { PAGE_DEFAULTS, TEAM_DEFAULTS, pathProblem } from "../../../js/site-pages.js";

// the first edit starts from the default list (saved only with «حفظ ونشر»)
const ensure = (key, def) => {
  if (settings[key] !== undefined) return settings[key];
  const clean = JSON.stringify(settings) === savedJSON;
  settings[key] = structuredClone(def);
  if (clean) setSaved(JSON.stringify(settings));
  return settings[key];
};
const pages = () => ensure("pages", PAGE_DEFAULTS);
const team = () => { const t = ensure("team", TEAM_DEFAULTS); quietly(() => { for (const [k, v] of Object.entries(TEAM_DEFAULTS)) if (t[k] === undefined) t[k] = structuredClone(v); }); return t; };
const aliases = () => { if (!Array.isArray(settings.aliases)) quietly(() => { settings.aliases = []; }); return settings.aliases; };
const origin = location.origin;
const PROBLEM = { format: "الرابط يبدأ بـ / ثم أحرف إنجليزية صغيرة وأرقام و- فقط (مثل /terms)", reserved: "هذا الرابط مستخدم لصفحة أساسية في الموقع", taken: "صفحة أخرى تستخدم هذا الرابط" };
const problemOf = (path, self) => pathProblem(path) || (pages().some((p) => p !== self && p.path === path) || aliases().some((a) => a.from === path) ? "taken" : "");

// ---------------------------------------------------------------- all addresses
const BUILT_IN = [
  ["/", "الرئيسية"], ["/about", "من نحن"], ["/order", "اطلب مشروعك"], ["/portal", "بوابة العملاء وتتبع الطلب"], ["/contact", "تواصل معنا"],
  ["/faq", "الأسئلة الشائعة"], ["/careers", "الوظائف"], ["/blog", "المقالات"], ["/privacy", "سياسة الخصوصية"],
];
export async function renderLinks(body) {
  body.innerHTML = '<div class="empty">جارٍ جمع الروابط…</div>';
  let site = {}, posts = [];
  try { site = await (await fetch("/api/site", { cache: "no-store" })).json(); } catch {}
  try { posts = (await sb.from("posts").select("slug, title_ar, title_en, published").order("created_at", { ascending: false })).data || []; } catch {}
  const t = team();
  const groups = [
    ["الصفحات الأساسية", [...BUILT_IN.map(([p, n]) => ({ path: p, name: n, on: true, fixed: true })),
      { path: "/team", name: "فريقنا", on: !!t.on, fixed: true, note: t.on ? "" : "غير مفعّلة", edit: "team" }]],
    ["الصفحات المضافة", pages().map((p) => ({ path: p.path, name: p.title_ar || p.title_en || "بدون عنوان", on: !!p.published && !pathProblem(p.path), note: p.published ? "" : "مخفية", edit: "custom", id: p.id }))],
    ["صفحات الخدمات", (site.services || []).map((s) => ({ path: `/services/${encodeURIComponent(s.slug)}`, name: s.title_ar || s.title_en, on: true }))],
    ["صفحات المشاريع", (site.projects || []).map((s) => ({ path: `/projects/${encodeURIComponent(s.slug)}`, name: s.title_ar || s.title_en, on: true }))],
    ["المقالات", posts.map((s) => ({ path: `/blog/${encodeURIComponent(s.slug)}`, name: s.title_ar || s.title_en || "بدون عنوان", on: !!s.published, note: s.published ? "" : "مسودة" }))],
    ["صفحات خاصة (لا تظهر في القوائم)", [{ path: "/review", name: "إضافة رأي عميل — تُفتح من الرابط الذي ترسله للعميل", on: true, noOpen: true }, { path: "/unsubscribe", name: "إلغاء الاشتراك في العروض — من رابط في البريد", on: true, noOpen: true }]],
  ];
  const live = groups.flatMap(([, l]) => l).filter((x) => x.on).length;
  const row = (x) => {
    const al = aliases().filter((a) => a.to === x.path);
    return `<div class="lnk ${x.on ? "" : "lnk--off"}">
      <div class="lnk__main"><b>${esc(x.name)}</b><a dir="ltr" href="${esc(x.path)}" target="_blank" rel="noopener">${esc(x.path)}</a>${x.note ? ` <span class="pill off">${esc(x.note)}</span>` : ""}
        ${al.length ? `<div class="lnk__al">${al.map((a) => `<span class="tag" dir="ltr">${esc(a.from)} <button type="button" data-al-del="${esc(a.from)}" aria-label="حذف الرابط الإضافي" title="حذف">×</button></span>`).join("")}</div>` : ""}</div>
      <div class="lnk__btns">
        ${x.on && !x.noOpen ? `<a class="b b--sm b--ghost" href="${esc(x.path)}" target="_blank" rel="noopener" title="فتح الصفحة">${I.eye}</a>` : ""}
        <button type="button" class="b b--sm b--ghost" data-copy="${esc(x.path)}" title="نسخ الرابط">نسخ</button>
        ${x.fixed || x.edit === "custom" ? `<button type="button" class="b b--sm b--ghost" data-al-add="${esc(x.path)}" title="رابط إضافي يؤدي إلى هذه الصفحة">${I.plus}رابط إضافي</button>` : ""}
        ${x.edit ? `<button type="button" class="b b--sm" data-goto="${x.edit}" data-id="${esc(x.id || "")}">${I.edit}تعديل</button>` : ""}
      </div></div>`;
  };
  body.innerHTML = `<p class="muted" style="margin-top:0">في الموقع الآن <b>${live}</b> صفحة منشورة. الروابط الأساسية ثابتة لأن الموقع والرسائل تعتمد عليها؛ لكل صفحة يمكنك إضافة <b>رابط إضافي</b> يؤدي إليها (مثل <span dir="ltr">/t</span> لصفحة التتبع)، ورابط الصفحات المضافة يُعدَّل من «تعديل».</p>
    ${groups.filter(([, l]) => l.length).map(([g, l]) => `<div class="sec-title">${esc(g)} <span class="muted" style="font-weight:500">(${l.length})</span></div><div class="lnks">${l.map(row).join("")}</div>`).join("")}`;
  $$("[data-copy]", body).forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(origin + b.dataset.copy); toast("نُسخ الرابط ✓"); } catch { toast(origin + b.dataset.copy); } }));
  $$("[data-goto]", body).forEach((b) => (b.onclick = () => { if (b.dataset.id) editing = b.dataset.id; document.dispatchEvent(new CustomEvent("wixa:content-tab", { detail: b.dataset.goto })); }));
  $$("[data-al-del]", body).forEach((b) => (b.onclick = () => { settings.aliases = aliases().filter((a) => a.from !== b.dataset.alDel); changed(); renderLinks(body); }));
  $$("[data-al-add]", body).forEach((b) => (b.onclick = () => {
    const to = b.dataset.alAdd;
    const foot = document.createElement("div"); foot.style.cssText = "display:flex;gap:8px";
    foot.innerHTML = `<button class="b" data-close>إلغاء</button><button class="b b--primary" data-go>${I.plus}إضافة</button>`;
    openModal("رابط إضافي", `<label class="f"><span>رابط جديد يؤدي إلى <b dir="ltr">${esc(to)}</b></span><input id="alFrom" dir="ltr" maxlength="50" placeholder="/t"></label>
      <p class="muted" style="margin:8px 0 0;font-size:13px">من يفتح هذا الرابط يُنقل إلى الصفحة تلقائياً. أحرف إنجليزية صغيرة وأرقام و- فقط.</p>`, foot, true);
    const go = () => {
      const from = $("#alFrom").value.trim().toLowerCase();
      const p = problemOf(from, null);
      if (p) return toast(PROBLEM[p], "err");
      aliases().push({ from, to }); changed(); closeModal(); renderLinks(body);
      toast("أُضيف ✓ — اضغط «حفظ ونشر» ليعمل");
    };
    $("[data-go]", foot).onclick = go;
    $("#alFrom").onkeydown = (e) => { if (e.key === "Enter") go(); };
  }));
}

// ---------------------------------------------------------------- pages added here
let editing = null, L = "ar";
export function renderCustom(body) {
  const list = pages();
  const pg = editing && list.find((p) => p.id === editing);
  if (!pg) { editing = null; return drawList(); }
  drawEditor();

  function drawList() {
    body.innerHTML = `<div class="toolbar"><p class="muted" style="margin:0">صفحات نصية مستقلة لها رابطها الخاص، مثل الشروط والأحكام وسياسة الدفع. تظهر في سطر أسفل الموقع إذا اخترت ذلك.</p>
        <button type="button" class="add-fab" id="pgAdd" aria-label="إضافة صفحة" title="إضافة صفحة">${I.plus}</button></div>
      ${list.length ? `<div class="lnks">${list.map((p) => { const bad = pathProblem(p.path); return `<div class="lnk ${p.published && !bad ? "" : "lnk--off"}">
        <div class="lnk__main"><b>${esc(p.title_ar || p.title_en || "بدون عنوان")}</b><span dir="ltr" class="muted">${esc(p.path || "—")}</span>
          <span class="pill ${p.published ? "ok" : "off"}">${p.published ? "منشورة" : "مخفية"}</span>${p.footer ? '<span class="pill">في أسفل الموقع</span>' : ""}${bad ? `<span class="pill warn">${PROBLEM[bad]}</span>` : ""}</div>
        <div class="lnk__btns">${p.published && !bad ? `<a class="b b--sm b--ghost" href="${esc(p.path)}" target="_blank" rel="noopener" title="فتح">${I.eye}</a>` : ""}
          <button type="button" class="b b--sm" data-ed="${esc(p.id)}">${I.edit}تعديل</button>
          <button type="button" class="b b--sm b--ghost b--danger" data-rm="${esc(p.id)}" title="حذف">${I.trash}</button></div></div>`; }).join("")}</div>`
        : '<div class="empty">لا توجد صفحات مضافة. اضغط «+» لإضافة صفحة.</div>'}
      <p class="muted" style="font-size:13px">التعديلات تظهر في الموقع بعد «حفظ ونشر». الصفحات المحذوفة يصبح رابطها «غير موجود».</p>`;
    $("#pgAdd").onclick = () => {
      let n = 1; while (list.some((p) => p.path === `/page-${n}`)) n++;
      const p = { id: `p${Date.now().toString(36)}`, path: `/page-${n}`, title_ar: "", title_en: "", desc_ar: "", desc_en: "", published: false, footer: true, updated: new Date().toISOString().slice(0, 10), ar: [{ h: "", p: "" }], en: [] };
      list.push(p); editing = p.id; changed(); renderCustom(body);
    };
    $$("[data-ed]", body).forEach((b) => (b.onclick = () => { editing = b.dataset.ed; renderCustom(body); }));
    $$("[data-rm]", body).forEach((b) => (b.onclick = async () => {
      const p = list.find((x) => x.id === b.dataset.rm);
      if (!(await confirmBox("حذف الصفحة", `حذف «${p.title_ar || p.path}»؟ يصبح رابطها ${p.path} غير موجود بعد «حفظ ونشر».`, "حذف"))) return;
      list.splice(list.indexOf(p), 1); settings.aliases = aliases().filter((a) => a.to !== p.path); changed(); renderCustom(body);
    }));
  }

  function drawEditor() {
    const items = Array.isArray(pg[L]) ? pg[L] : (pg[L] = []);
    const bad = problemOf(pg.path, pg);
    let was = pg.path; // extra addresses follow the page when its address changes
    body.innerHTML = `<button type="button" class="b b--sm b--ghost" id="pgBack">→ كل الصفحات المضافة</button>
      <div class="stack" style="margin-top:12px">
        <div class="grid2"><label class="f"><span>العنوان (عربي)</span><input data-k="title_ar" value="${esc(pg.title_ar || "")}" maxlength="80"></label>
          <label class="f"><span>Title (English)</span><input data-k="title_en" dir="ltr" value="${esc(pg.title_en || "")}" maxlength="80"></label></div>
        <label class="f"><span>الرابط</span><input data-k="path" dir="ltr" value="${esc(pg.path || "")}" maxlength="50" placeholder="/terms">
          <small class="${bad ? "err" : "muted"}" id="pgPathMsg">${bad ? PROBLEM[bad] : `${esc(origin)}${esc(pg.path || "")}`}</small></label>
        <div class="grid2"><label class="f"><span>وصف قصير لمحركات البحث (عربي)</span><input data-k="desc_ar" value="${esc(pg.desc_ar || "")}" maxlength="160"></label>
          <label class="f"><span>Short description (English)</span><input data-k="desc_en" dir="ltr" value="${esc(pg.desc_en || "")}" maxlength="160"></label></div>
        <label class="f" style="max-width:240px"><span>تاريخ آخر تحديث</span><input type="date" data-k="updated" dir="ltr" value="${esc(pg.updated || "")}"></label>
        <label class="switch"><input type="checkbox" data-k="published" ${pg.published ? "checked" : ""}><i></i>منشورة (يراها الزوار)</label>
        <label class="switch"><input type="checkbox" data-k="footer" ${pg.footer ? "checked" : ""}><i></i>رابطها في أسفل الموقع</label>
        <label class="f" style="max-width:240px"><span>مجموعتها في أسفل الموقع</span><select data-k="group">${[["legal", "قانوني"], ["company", "الشركة"], ["support", "الدعم"], ["services", "الخدمات"]].map(([v, l]) => `<option value="${v}" ${(pg.group || "legal") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div class="seg" id="pgLang" style="margin:18px 0 12px"><button type="button" data-v="ar" class="${L === "ar" ? "on" : ""}">النص العربي</button><button type="button" data-v="en" class="${L === "en" ? "on" : ""}">English text</button></div>
      <p class="muted" style="margin-top:0;font-size:13px">كل فقرة لها عنوان ونص. اكتب <code>{email}</code> ليظهر بريد التواصل كرابط.${L === "en" ? " إذا تُرك النص الإنجليزي فارغاً يظهر العربي." : ""}</p>
      <div class="stack" dir="${L === "ar" ? "rtl" : "ltr"}">${items.map((x, i) => `<div class="sec-title">${L === "ar" ? "الفقرة" : "Section"} ${i + 1} <span>
          <button type="button" class="b b--sm b--ghost" data-mv="${i}" data-d="-1" ${i ? "" : "disabled"} title="أعلى">${I.up}</button><button type="button" class="b b--sm b--ghost" data-mv="${i}" data-d="1" ${i < items.length - 1 ? "" : "disabled"} title="أسفل">${I.down}</button><button type="button" class="b b--sm b--ghost b--danger" data-del="${i}" title="حذف">${I.trash}</button></span></div>
        <label class="f"><span>${L === "ar" ? "العنوان" : "Heading"}</span><input data-i="${i}" data-f="h" value="${esc(x.h || "")}"></label>
        <label class="f"><span>${L === "ar" ? "النص" : "Text"}</span><textarea data-i="${i}" data-f="p" rows="4">${esc(x.p || "")}</textarea></label>`).join("")}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"><button type="button" class="b b--sm" id="pgAddSec">${I.plus}إضافة فقرة</button>
        ${L === "en" && !items.length && (pg.ar || []).length ? '<button type="button" class="b b--sm b--ghost" id="pgCopyAr">ابدأ بنسخة من فقرات العربي</button>' : ""}
        ${PAGE_DEFAULTS.some((d) => d.id === pg.id) ? `<button type="button" class="b b--sm b--ghost" id="pgReset">${I.reset}استعادة النص الافتراضي</button>` : ""}</div>`;
    $("#pgBack").onclick = () => { editing = null; renderCustom(body); };
    $$("[data-k]", body).forEach((el) => el.addEventListener(el.type === "checkbox" ? "change" : "input", () => {
      const k = el.dataset.k;
      pg[k] = el.type === "checkbox" ? el.checked : k === "path" ? el.value.trim().toLowerCase() : el.value;
      if (k === "path") {
        const p = problemOf(pg.path, pg), msg = $("#pgPathMsg");
        msg.className = p ? "err" : "muted"; msg.textContent = p ? PROBLEM[p] : origin + pg.path;
        aliases().forEach((a) => { if (a.to === was) a.to = pg.path; });
        was = pg.path;
      }
      changed();
    }));
    $$("[data-i]", body).forEach((el) => el.addEventListener("input", () => { items[+el.dataset.i][el.dataset.f] = el.value; changed(); }));
    $$("#pgLang button").forEach((b) => (b.onclick = () => { L = b.dataset.v; drawEditor(); }));
    $$("[data-del]", body).forEach((b) => (b.onclick = () => { items.splice(+b.dataset.del, 1); changed(); drawEditor(); }));
    $$("[data-mv]", body).forEach((b) => (b.onclick = () => { const i = +b.dataset.mv, j = i + +b.dataset.d; [items[i], items[j]] = [items[j], items[i]]; changed(); drawEditor(); }));
    $("#pgAddSec").onclick = () => { items.push({ h: "", p: "" }); changed(); drawEditor(); };
    if ($("#pgCopyAr")) $("#pgCopyAr").onclick = () => { pg.en = structuredClone(pg.ar); changed(); drawEditor(); };
    if ($("#pgReset")) $("#pgReset").onclick = async () => {
      if (!(await confirmBox("استعادة النص الافتراضي", "تُستبدل فقرات هذه اللغة بالنص الافتراضي.", "استعادة"))) return;
      pg[L] = structuredClone(PAGE_DEFAULTS.find((d) => d.id === pg.id)[L]); changed(); drawEditor();
    };
  }
}
export const openCustomPage = (id) => { editing = id; };

// ---------------------------------------------------------------- our team (/team)
export function renderTeam(body) {
  const t = team();
  const draw = () => {
    body.innerHTML = `<p class="muted" style="margin-top:0">صفحة <a href="/team" target="_blank" rel="noopener" dir="ltr">/team</a> تعرّف الزوار بفريقك. فعّلها بعد إضافة الأشخاص.</p>
      <div class="stack">
        <label class="switch"><input type="checkbox" data-t="on" ${t.on ? "checked" : ""}><i></i>الصفحة منشورة</label>
        <label class="switch"><input type="checkbox" data-t="footer" ${t.footer ? "checked" : ""}><i></i>رابطها في أسفل الموقع</label>
        <div class="grid2"><label class="f"><span>العنوان (عربي)</span><input data-t="title_ar" value="${esc(t.title_ar || "")}"></label><label class="f"><span>Title (English)</span><input data-t="title_en" dir="ltr" value="${esc(t.title_en || "")}"></label></div>
        <div class="grid2"><label class="f"><span>الوصف (عربي)</span><input data-t="sub_ar" value="${esc(t.sub_ar || "")}"></label><label class="f"><span>Description (English)</span><input data-t="sub_en" dir="ltr" value="${esc(t.sub_en || "")}"></label></div>
      </div>
      <div class="sec-title" style="margin-top:18px">الأشخاص (${t.members.length})</div>
      <div class="stack" id="tmList"></div>
      <button type="button" class="b b--sm" id="tmAdd" style="margin-top:12px">${I.plus}إضافة شخص</button>`;
    const box = $("#tmList", body);
    t.members.forEach((m, i) => {
      const card = document.createElement("div"); card.className = "card team-ed";
      card.innerHTML = `<div class="sec-title" style="margin-top:0">${esc(m.name_ar || m.name_en || `الشخص ${i + 1}`)} <span>
          <button type="button" class="b b--sm b--ghost" data-mv="-1" ${i ? "" : "disabled"} title="أعلى">${I.up}</button><button type="button" class="b b--sm b--ghost" data-mv="1" ${i < t.members.length - 1 ? "" : "disabled"} title="أسفل">${I.down}</button><button type="button" class="b b--sm b--ghost b--danger" data-del title="حذف">${I.trash}</button></span></div>
        <div class="grid2"><label class="f"><span>الاسم (عربي)</span><input data-m="name_ar" value="${esc(m.name_ar || "")}"></label><label class="f"><span>Name (English)</span><input data-m="name_en" dir="ltr" value="${esc(m.name_en || "")}"></label></div>
        <div class="grid2"><label class="f"><span>الدور (عربي)</span><input data-m="role_ar" value="${esc(m.role_ar || "")}" placeholder="مثال: مطوّر واجهات"></label><label class="f"><span>Role (English)</span><input data-m="role_en" dir="ltr" value="${esc(m.role_en || "")}"></label></div>
        <div class="grid2"><label class="f"><span>نبذة قصيرة (عربي)</span><textarea data-m="bio_ar" rows="2">${esc(m.bio_ar || "")}</textarea></label><label class="f"><span>Short bio (English)</span><textarea data-m="bio_en" rows="2" dir="ltr">${esc(m.bio_en || "")}</textarea></label></div>
        <div class="f"><span>الصورة</span></div>`;
      card.lastElementChild.append(imageField(m.photo || "", "team", (u) => { m.photo = u; changed(); }));
      $$("[data-m]", card).forEach((el) => el.addEventListener("input", () => { m[el.dataset.m] = el.value; changed(); }));
      $("[data-del]", card).onclick = async () => { if (!(await confirmBox("حذف الشخص", `حذف «${m.name_ar || m.name_en || "هذا الشخص"}» من صفحة الفريق؟`, "حذف"))) return; t.members.splice(i, 1); changed(); draw(); };
      $$("[data-mv]", card).forEach((b) => (b.onclick = () => { const j = i + +b.dataset.mv; [t.members[i], t.members[j]] = [t.members[j], t.members[i]]; changed(); draw(); }));
      box.append(card);
    });
    $$("[data-t]", body).forEach((el) => el.addEventListener(el.type === "checkbox" ? "change" : "input", () => { t[el.dataset.t] = el.type === "checkbox" ? el.checked : el.value; changed(); }));
    $("#tmAdd").onclick = () => { t.members.push({ name_ar: "", name_en: "", role_ar: "", role_en: "", bio_ar: "", bio_en: "", photo: "" }); changed(); draw(); };
  };
  draw();
}
