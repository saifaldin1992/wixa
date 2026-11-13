/* «ترتيب الأقسام»: each page's sections, in order, with on/off, moving up and down, adding a section allowed on that page,
   and a button to that section's own editor. Saved in settings.layout[page] (public/js/site-structure.js → layoutFor),
   the same list the server builds the page from. The preview shows the chosen page and follows every change. */
import { $, $$, I, esc, sb, settings } from "../core.js";
import { changed } from "../settings.js";
import { DEFAULT_LAYOUTS, SECTIONS, SECTION_PAGES, layoutFor } from "../../../js/site-structure.js";

// pages whose sections can be arranged (the order and tracking pages are a single form each)
const PAGES = ["home", "about", "careers", "faq", "contact"];
// where each section is edited: a tab of «صفحات الموقع» or a page of the dashboard
const EDIT = {
  hero: ["tab", "texts"], about: ["tab", "about"], story: ["tab", "story"], partners: ["view", "partners"], services: ["view", "services"],
  projects: ["view", "projects"], process: ["tab", "process"], stats: ["tab", "stats"], pricing: ["tab", "pricing"], calculator: ["tab", "calc"],
  testimonials: ["view", "testimonials"], careers: ["tab", "careers"], faq: ["tab", "faq"], ways: ["tab", "contact"], contact: ["tab", "texts"],
};
export let layoutPage = "home";
let counts = null; // rows in the partners and testimonials tables (a section with nothing in it does not show)

async function loadCounts() {
  const n = async (t) => { const { count } = await sb.from(t).select("id", { count: "exact", head: true }).eq("published", true); return count ?? 0; };
  try { counts = { partners: await n("partners"), testimonials: await n("testimonials") }; } catch { counts = {}; }
}
const isEmpty = (k) => {
  if (k === "partners" || k === "testimonials") return counts && counts[k] === 0;
  if (k === "stats") return !(settings.stats || []).length;
  if (k === "faq") return !((settings.content?.ar?.faq) || []).some((x) => x.q && x.a);
  return false;
};

// the page in the preview follows the page being arranged
function previewPage() {
  const fr = $("#pvFrame"); if (!fr) return;
  const want = `${SECTION_PAGES[layoutPage].path}?preview=1`;
  if (!fr.getAttribute("src")?.startsWith(SECTION_PAGES[layoutPage].path + "?")) fr.setAttribute("src", want);
}

export async function renderLayout(body) {
  if (!counts) await loadCounts();
  const list = layoutFor(settings, layoutPage);
  const save = (next) => { settings.layout = { ...(settings.layout || {}), [layoutPage]: next.map(({ k, on }) => ({ k, on })) }; changed(); renderLayout(body); };
  const def = DEFAULT_LAYOUTS[layoutPage];
  const addable = Object.keys(SECTIONS).filter((k) => SECTIONS[k].pages.includes(layoutPage) && !list.some((x) => x.k === k));
  const custom = !!settings.layout?.[layoutPage];
  body.innerHTML = `
    <p class="muted" style="margin-top:0">اختر الصفحة، ثم رتّب أقسامها بالأسهم وأظهر أو أخفِ أي قسم. الروابط في القوائم تتبع الأقسام وحدها: إذا أخفيت قسماً يختفي رابطه، وإذا نقلته لصفحة أخرى ينتقل رابطه معه.</p>
    <div class="seg seg--wide" id="lyPage" style="margin-bottom:14px">${PAGES.map((p) => `<button type="button" data-p="${p}" class="${p === layoutPage ? "on" : ""}">${SECTION_PAGES[p].name_ar}</button>`).join("")}</div>
    <div class="ly" id="lyList">${list.map((x, i) => {
      const s = SECTIONS[x.k], globalOff = settings.sections?.[x.k] === false, empty = isEmpty(x.k);
      const note = globalOff ? `<span class="tag off">مخفي في كل الصفحات</span><button type="button" class="b b--sm b--ghost" data-show="${x.k}">إظهار</button>`
        : empty && x.on ? '<span class="tag off">فارغ — يظهر عند إضافة محتوى</span>' : "";
      return `<div class="ly__row${x.on ? "" : " is-off"}" data-k="${x.k}">
        <div class="ly__move"><button type="button" class="b b--icon b--ghost" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="لأعلى">${I.up}</button><button type="button" class="b b--icon b--ghost" data-down="${i}" ${i === list.length - 1 ? "disabled" : ""} aria-label="لأسفل">${I.down}</button></div>
        <div class="ly__name"><b>${esc(s.name_ar)}</b>${note}</div>
        <label class="switch" title="${x.on ? "ظاهر في هذه الصفحة" : "مخفي في هذه الصفحة"}"><input type="checkbox" data-on="${i}" ${x.on ? "checked" : ""}><i></i></label>
        <div class="ly__end">${EDIT[x.k] ? `<button type="button" class="b b--sm" data-edit="${x.k}">${I.edit}تعديل</button>` : ""}${def.includes(x.k) ? "" : `<button type="button" class="b b--icon b--ghost b--danger" data-del="${i}" aria-label="إزالة من الصفحة">${I.trash || "×"}</button>`}</div>
      </div>`;
    }).join("")}</div>
    <div class="ly__foot">
      ${addable.length ? `<label class="f" style="flex:1 1 220px;margin:0"><span>إضافة قسم إلى «${SECTION_PAGES[layoutPage].name_ar}»</span><select id="lyAdd"><option value="">— اختر قسماً —</option>${addable.map((k) => `<option value="${k}">${esc(SECTIONS[k].name_ar)}</option>`).join("")}</select></label>` : ""}
      ${custom ? `<button type="button" class="b" id="lyReset">${I.reset}الترتيب الافتراضي</button>` : ""}
    </div>`;
  $$("#lyPage button", body).forEach((b) => (b.onclick = () => { layoutPage = b.dataset.p; renderLayout(body); }));
  $$("[data-up]", body).forEach((b) => (b.onclick = () => { const i = +b.dataset.up; const n = list.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; save(n); }));
  $$("[data-down]", body).forEach((b) => (b.onclick = () => { const i = +b.dataset.down; const n = list.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; save(n); }));
  $$("[data-on]", body).forEach((c) => (c.onchange = () => { const n = list.slice(); n[+c.dataset.on] = { ...n[+c.dataset.on], on: c.checked }; save(n); }));
  $$("[data-del]", body).forEach((b) => (b.onclick = () => { const n = list.slice(); n.splice(+b.dataset.del, 1); save(n); }));
  $$("[data-show]", body).forEach((b) => (b.onclick = () => { settings.sections = { ...(settings.sections || {}), [b.dataset.show]: true }; changed(); renderLayout(body); }));
  $$("[data-edit]", body).forEach((b) => (b.onclick = () => {
    const [kind, where] = EDIT[b.dataset.edit];
    if (kind === "view") location.hash = `#${where}`;
    else document.dispatchEvent(new CustomEvent("wixa:content-tab", { detail: where }));
  }));
  const add = $("#lyAdd", body);
  if (add) add.onchange = () => { if (add.value) save([...list, { k: add.value, on: true }]); };
  const reset = $("#lyReset", body);
  if (reset) reset.onclick = () => { const l = { ...(settings.layout || {}) }; delete l[layoutPage]; settings.layout = l; changed(); renderLayout(body); };
  previewPage();
}
