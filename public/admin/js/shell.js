/* Sidebar, top bar and the hash router */
import { $, $$, setHubRow, setSubnav, sectionize, composeView, endSections, DEFAULTS, ROLE_AR, closeModal, confirmBox, esc, merge, role, savedJSON, setSettings } from "./core.js";
import { viewTeam } from "./views/team.js";
import { viewChats } from "./views/chats.js";
import { viewCustomers } from "./views/customers.js";
import { viewSales } from "./views/sales.js";
import { viewCampaigns } from "./views/campaigns.js";
import { viewOrders } from "./views/orders.js";
import { isDirty } from "./settings.js";
import { viewAccount } from "./views/account.js";
import { viewAppearance } from "./views/appearance.js";
import { viewContent } from "./views/content.js";
import { viewBrand } from "./views/brand.js";
import { viewIntegrations } from "./views/integrations.js";
import { viewList } from "./views/lists.js";
import { viewOverview } from "./views/overview.js";
import { viewPosts } from "./views/posts.js";
import { viewMedia } from "./views/media.js";
import { viewDevice } from "./views/device.js";
import { setInboxFilter, viewInbox } from "./views/inbox.js";
import { viewSeo } from "./views/seo.js";
import { viewDiagnose } from "./views/diagnose.js";
import { viewDevGuide } from "./views/devguide.js";
import { viewAudit } from "./views/audit.js";

// ---------------- shell / router ----------------
export const VIEWS = {
  overview: { title: "الرئيسية", sub: "ملخص اليوم وزوار الموقع ونشاطه", render: viewOverview },
  visits: { title: "الزيارات والسلوك", sub: "زوار الموقع، من أين جاؤوا، ماذا فعلوا، وسرعة الموقع", render: viewOverview },
  appearance: { title: "المظهر", sub: "الألوان ونوع الخط وحجمه والحركة — مع معاينة مباشرة", render: viewAppearance },
  brand: { title: "دليل الهوية", sub: "الهوية البصرية ومكوّنات الواجهة والمعايير — خاص بك ولا يظهر في الموقع", render: viewBrand },
  content: { title: "صفحات الموقع", sub: "نصوص الموقع بالعربي والإنجليزي، الأرقام، الأقسام وبيانات التواصل", render: viewContent },
  projects: { title: "المشاريع", sub: "أضف مشاريعك واعرضها في قسم الإنجازات", render: () => viewList("projects") },
  services: { title: "الخدمات", sub: "الخدمات التي تظهر في الموقع", render: () => viewList("services") },
  partners: { title: "الشركاء", sub: "شعارات العملاء والشركاء", render: () => viewList("partners") },
  testimonials: { title: "آراء العملاء", sub: "بطاقات الآراء المتحركة في الموقع", render: () => viewList("testimonials") },
  posts: { title: "المقالات", sub: "اكتب مقالات تساعد الناس على إيجادك في Google", render: viewPosts },
  media: { title: "مكتبة الوسائط", sub: "كل صور الموقع في مكان واحد: ارفع، انسخ الرابط، واعرف أين تُستخدم كل صورة", render: viewMedia },
  seo: { title: "البحث والمشاركة", sub: "كيف يظهر موقعك في Google وعند مشاركة الرابط", render: viewSeo },
  integrations: { title: "التكاملات", sub: "بوابة الدفع، أدوات القياس والإعلانات، والتقارير والمراقبة", render: (v) => composeView(v, [[viewIntegrations, ["#cAddons", "#cHooks", "#cKeys", "#cTags", "#cReports"]]]) },
  notify: { title: "الإشعارات والبريد", sub: "تنبيهات الرسائل الجديدة، الرد التلقائي للزبون، والردود الجاهزة", render: (v) => composeView(v, [[viewDevice, ["#cDevice"]], [viewIntegrations, ["#cAlerts", "#cReply", "#cTpl"]], [viewAccount, ["بريد تنبيهات"]]]) },
  protect: { title: "الحماية", sub: "الحماية من الرسائل المزعجة ووضع الصيانة", render: (v) => composeView(v, [[viewIntegrations, ["#cSpam", "#cMaint"]]]) },
  backup: { title: "النسخ الاحتياطي", sub: "النسخة التلقائية، نسخة المحتوى، والاسترجاع", render: (v) => composeView(v, [[viewIntegrations, ["#cBackup"]], [viewAccount, ["نسخة احتياطية"]]]) },
  diagnose: { title: "الفحص والتشخيص", sub: "فحص كل أجزاء الموقع، مكان أي عطل وطريقة حله، وسجل الأعطال", render: (v) => composeView(v, [[viewIntegrations, ["#cPublish"]], [viewDiagnose, ["*"]]]) },
  audit: { title: "سجل التعديلات", sub: "من عدّل ماذا ومتى — للمالك فقط، ولا يمكن تعديله أو حذفه", render: viewAudit },
  devguide: { title: "دليل المطوّر", sub: "كيف بُني المشروع وأين يوجد كل جزء — للمطورين", render: viewDevGuide },
  inbox: { title: "الوارد", sub: "كل ما وصلك من الموقع: المحادثات، الطلبات، الرسائل، المواعيد، التوظيف — ما ينتظر ردك أولاً، والرسائل تُعالَج هنا مباشرة", render: viewInbox },
  orders: { title: "الطلبات", sub: "كل طلبات المشاريع من الموقع في مكان واحد: ماذا اختار الزبون، ومن أين، وهداياه وخصمه", render: viewOrders },
  messages: { title: "الوارد", sub: "كل ما وصلك من الموقع في مكان واحد", render: (v) => { setInboxFilter("message"); history.replaceState(null, "", "#inbox"); return viewInbox(v); } },
  sales: { title: "لوحة المبيعات", sub: "من تواصل، ومن اشترى، ومن أين جاؤوا، وكيف نخدمهم", render: viewSales },
  campaigns: { title: "العروض والحملات", sub: "هدايا وخصم طلب المشروع، شريط العروض، عرض الحاسبة، والحملات البريدية", render: viewCampaigns },
  customers: { title: "الزبائن", sub: "كل من تواصل معك من الموقع — للمتابعة والعروض", render: viewCustomers },
  chats: { title: "المحادثات", sub: "دردشة مباشرة مع زوار الموقع", render: viewChats },
  team: { title: "الفريق والصلاحيات", sub: "من يدخل إلى لوحة التحكم وماذا يستطيع — بالدعوة فقط", render: viewTeam },
  account: { title: "الحساب", sub: "بيانات الدخول والأمان", render: (v) => composeView(v, [[viewAccount, ["الحساب", "تغيير بريد", "التحقق بخطوتين", "تغيير كلمة"]]]) },
};

// Groups of pages shown as ONE item in the sidebar, the way Shopify, HubSpot and Wix gather them: the group's pages
// become a first row of tabs. The pages keep their own addresses (#notify, #team…), so old links and notifications
// still land in the right tab; the group's own address (#settings…) opens its first page this person may see.
export const HUBS = {
  settings: { title: "الإعدادات", items: [["account", "الحساب"], ["team", "الفريق"], ["notify", "الإشعارات والبريد"], ["integrations", "التكاملات"], ["protect", "الحماية"], ["backup", "النسخ الاحتياطي"], ["diagnose", "الفحص والتشخيص"], ["audit", "سجل التعديلات"], ["devguide", "دليل المطوّر"]] },
  reports: { title: "التقارير", items: [["sales", "المبيعات"], ["visits", "الزيارات والسلوك"]] },
  look: { title: "المظهر", items: [["appearance", "الألوان والخطوط"], ["brand", "دليل الهوية"]] },
  reputation: { title: "آراء العملاء والشركاء", items: [["testimonials", "آراء العملاء"], ["partners", "الشركاء"]] },
};
export const hubOf = (name) => Object.keys(HUBS).find((h) => HUBS[h].items.some(([k]) => k === name)) || null;

// Every long page as sub-menus (the shared rule): branch row, then its sections; one section shows at a time.
// [match, section]: "#id" a card id, ".class" a card class, otherwise the start of the card's title.
const ONE = (items) => [{ k: "main", label: "", items }];
const SECTIONS = {
  overview: { groups: ONE([["today", "ملخص اليوم"]]), fallback: "today",
    rules: [[".kpis", "today"], ["اليوم في خدمة الزبائن", "today"], ["الزيارات اليومية", "visits"], ["الأجهزة", "visits"], ["أكثر الصفحات", "visits"], ["مصادر الزيارات", "visits"], ["ماذا فعل", "behave"], ["سرعة الموقع", "behave"]] },
  visits: { groups: ONE([["visits", "الزيارات"], ["behave", "سلوك الزوار والسرعة"]]), fallback: "visits",
    rules: [[".kpis", "today"], ["اليوم في خدمة الزبائن", "today"], ["الزيارات اليومية", "visits"], ["الأجهزة", "visits"], ["أكثر الصفحات", "visits"], ["مصادر الزيارات", "visits"], ["ماذا فعل", "behave"], ["سرعة الموقع", "behave"]] },
  sales: { groups: ONE([["sum", "الملخص"], ["stages", "مراحل البيع"], ["src", "المصادر"], ["top", "الأكثر طلباً"], ["ch", "طرق التواصل"], ["lost", "أسباب الخسارة"], ["rate", "التقييمات"]]), fallback: "sum",
    rules: [[".cust__kpi", "sum"], ["مراحل البيع", "stages"], ["من أين", "src"], ["أكثر ما يطلبه", "top"], ["طرق التواصل", "ch"], ["لماذا نخسر", "lost"], ["آخر التقييمات", "rate"]] },
  campaigns: { groups: ONE([["gifts", "هدايا وخصم الطلب"], ["bar", "شريط العرض"], ["calc", "عرض الحاسبة"], ["mail", "حملة بريدية"]]),
    rules: [["🎁", "gifts"], ["شريط العرض", "bar"], ["عرض «نرسل", "calc"], ["حملة بريدية", "mail"]] },
  seo: { groups: ONE([["google", "نتائج Google"], ["share", "الأيقونة وصورة المشاركة"], ["gsc", "Google Search Console"], ["check", "فحص سريع"]]),
    rules: [["كيف تظهر", "google"], ["العنوان والوصف", "google"], ["أيقونة الموقع", "share"], ["صورة المشاركة", "share"], ["ربط Google", "gsc"], ["فحص سريع", "check"]] },
  appearance: { groups: ONE([["presets", "قوالب الألوان"], ["colors", "الألوان"], ["type", "الخط والحجم والوضع"], ["reset", "إعادة الضبط"]]),
    rules: [["قوالب ألوان", "presets"], ["الألوان", "colors"], ["نوع الخط", "type"], ["حجم الخط", "type"], ["إعادة الضبط", "reset"]] },
  team: { groups: ONE([["invite", "دعوة شخص"], ["members", "الأعضاء"], ["pending", "الدعوات"]]), rules: [["دعوة شخص", "invite"], ["أعضاء الفريق", "members"], ["دعوات بانتظار", "pending"]] },
  account: { groups: ONE([["me", "البيانات"], ["email", "تغيير البريد"], ["pass", "كلمة المرور"], ["mfa", "التحقق بخطوتين"]]), rules: [["الحساب", "me"], ["تغيير بريد", "email"], ["تغيير كلمة", "pass"], ["التحقق بخطوتين", "mfa"]] },
  notify: { groups: ONE([["device", "التطبيق والإشعارات"], ["alerts", "تنبيهات الرسائل"], ["reply", "الرد التلقائي"], ["tpl", "الردود الجاهزة"]]), rules: [["#cDevice", "device"], ["#cAlerts", "alerts"], ["بريد تنبيهات", "alerts"], ["#cReply", "reply"], ["#cTpl", "tpl"]] },
  integrations: { groups: ONE([["addons", "الإضافات"], ["hooks", "Webhooks"], ["keys", "المفاتيح"], ["tags", "أدوات القياس والإعلانات"], ["reports", "التقارير والمراقبة"]]), rules: [["#cAddons", "addons"], ["#cHooks", "hooks"], ["#cKeys", "keys"], ["#cTags", "tags"], ["#cReports", "reports"]] },
  protect: { groups: ONE([["spam", "الرسائل المزعجة"], ["maint", "وضع الصيانة"]]), rules: [["#cSpam", "spam"], ["#cMaint", "maint"]] },
  backup: { groups: ONE([["auto", "النسخة التلقائية والاسترجاع"], ["manual", "نسخة المحتوى"]]), rules: [["#cBackup", "auto"], ["نسخة احتياطية", "manual"]] },
  diagnose: { groups: ONE([["checks", "الفحص"], ["conn", "الاتصالات"], ["errors", "سجل الأعطال"], ["publish", "تحديث الموقع"]]), fallback: "checks",
    rules: [["#diagSum", "checks"], ["الاتصالات", "conn"], ["سجل الأعطال", "errors"], ["#cPublish", "publish"]] },
};
export let current = null;

// which pages each role sees (the server and the database enforce the same rules)
const ROLE_VIEWS = {
  owner: null, // everything
  editor: ["overview", "content", "projects", "services", "partners", "testimonials", "posts", "media", "appearance", "brand", "seo", "devguide", "account"],
  support: ["overview", "inbox", "orders", "messages", "chats", "customers", "account"], // «messages» opens «الوارد»
};
export const canSee = (name) => HUBS[name] ? HUBS[name].items.some(([k]) => canSee(k)) : !ROLE_VIEWS[role] || ROLE_VIEWS[role].includes(name);
function applyRoleNav() {
  $$("#sideNav a").forEach((a) => (a.hidden = !canSee(a.dataset.view)));
  // a group title disappears when none of its pages is available
  $$("#sideNav .side__group").forEach((g) => {
    let n = g.nextElementSibling, any = false;
    while (n && !n.classList.contains("side__group")) { if (n.tagName === "A" && !n.hidden) any = true; n = n.nextElementSibling; }
    g.hidden = !any;
  });
  const tag = $(".side .logo small"); if (tag) tag.textContent = role === "owner" ? "لوحة التحكم" : ROLE_AR[role];
}

export function setupShell() {
  if (setupShell.done) return; setupShell.done = true;
  addEventListener("hashchange", route);
  const side = $("#side"), scrim = $("#scrim");
  const close = () => { side.classList.remove("open"); scrim.classList.remove("open"); };
  $("#menuBtn").onclick = () => { side.classList.add("open"); scrim.classList.add("open"); };
  scrim.onclick = close;
  $$("#sideNav a").forEach((a) => a.addEventListener("click", close));
  // light / dark / follow the device (public/admin/theme.js applies it before the page paints)
  const T = { auto: "تلقائي", light: "فاتح", dark: "داكن" }, NEXT = { auto: "light", light: "dark", dark: "auto" };
  const paintTheme = () => { $("#themeLabel").textContent = `المظهر: ${T[window.wixaTheme?.get() || "auto"]}`; };
  paintTheme();
  $("#themeBtn").onclick = () => { window.wixaTheme?.set(NEXT[window.wixaTheme.get()] || "auto"); paintTheme(); };
  // large title: shrinks into the bar when the page scrolls (like iOS).
  // The bar gets shorter when it shrinks (description and tabs hide). If the page moved up by that much, the
  // browser would pull the scroll back to keep the content in place, the bar would grow again, and so on —
  // the page shook. So the space the bar gives up is kept as an empty margin under it (nothing below moves),
  // and it shrinks only past 40px and grows back only near the very top (no flip-flopping at one point).
  const top = $(".top");
  let compact = false;
  const onScroll = () => {
    const want = compact ? scrollY > 4 : scrollY > 40;
    if (want === compact) return;
    compact = want;
    if (want) {
      // measure where the content starts, shrink the bar, then fill the gap exactly (margins can merge, so check)
      // (the space is held first: if the page got shorter even for a moment, the browser would cut the scroll back)
      const next = top.nextElementSibling, y0 = next?.getBoundingClientRect().top ?? 0;
      const before = top.offsetHeight, m = parseFloat(getComputedStyle(top).marginBottom) || 0;
      top.style.marginBottom = `${m + before}px`;
      top.classList.add("top--compact");
      top.style.marginBottom = `${m + Math.max(0, before - top.offsetHeight)}px`;
      const fix = y0 - (next?.getBoundingClientRect().top ?? y0);
      if (Math.abs(fix) > 0.5) top.style.marginBottom = `${parseFloat(top.style.marginBottom) + fix}px`;
    } else {
      top.classList.remove("top--compact");
      top.style.marginBottom = "";
    }
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  // a new page starts with the full bar (its tabs and title may differ)
  window.wixaTopReset = () => { compact = false; top.classList.remove("top--compact"); top.style.marginBottom = ""; requestAnimationFrame(onScroll); };
  // phones: dialogs are bottom sheets — drag the handle or the title down to close
  const box = $(".modal__box");
  let y0 = null, dy = 0;
  const grab = (e) => e.target.closest(".modal__grab, .modal__head") && matchMedia("(max-width: 640px)").matches;
  box.addEventListener("touchstart", (e) => { if (!grab(e)) return; y0 = e.touches[0].clientY; dy = 0; box.style.transition = "none"; }, { passive: true });
  box.addEventListener("touchmove", (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); box.style.transform = `translateY(${dy}px)`; }, { passive: true });
  box.addEventListener("touchend", () => {
    if (y0 === null) return; y0 = null; box.style.transition = ""; box.style.transform = "";
    if (dy > 90) closeModal();
  });
  addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });
  // a group's tabs (الإعدادات، التقارير…) are links to its pages
  $("#subNav").addEventListener("click", (e) => { const t = e.target.closest("[data-hub-to]"); if (t && location.hash !== `#${t.dataset.hubTo}`) location.hash = `#${t.dataset.hubTo}`; });
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
}

export async function route() {
  let name = location.hash.slice(1) || "overview";
  if (name === "status") { name = "diagnose"; history.replaceState(null, "", "#diagnose"); } // the old Connections page lives inside diagnostics now
  applyRoleNav();
  if (HUBS[name]) { const first = HUBS[name].items.find(([k]) => canSee(k)); name = first ? first[0] : "overview"; history.replaceState(null, "", `#${name}`); }
  if (!canSee(name)) { name = "overview"; history.replaceState(null, "", "#overview"); }
  const v = VIEWS[name] || VIEWS.overview;
  if (current && ["appearance", "content", "seo"].includes(current) && !["appearance", "content", "seo"].includes(name) && isDirty()) {
    if (!(await confirmBox("لديك تغييرات غير محفوظة", "هل تريد المغادرة دون حفظ؟", "مغادرة"))) { history.replaceState(null, "", `#${current}`); return; }
    setSettings(merge(DEFAULTS, JSON.parse(savedJSON)));
  }
  current = VIEWS[name] ? name : "overview";
  const hub = hubOf(current);
  $$("#sideNav a").forEach((a) => a.classList.toggle("on", a.dataset.view === current || (!!hub && a.dataset.view === hub)));
  const view = $("#view");
  // the page changes with a short cross-fade (View Transitions), only for the switch itself — never while loading
  const swap = () => {
    $("#viewTitle").textContent = hub ? HUBS[hub].title : v.title; $("#viewSub").textContent = v.sub;
    setHubRow(hub ? `<div class="seg seg--hub" data-hub>${HUBS[hub].items.filter(([k]) => canSee(k)).map(([k, l]) => `<button type="button" data-hub-to="${k}" class="${k === current ? "on" : ""}">${esc(l)}</button>`).join("")}</div>` : "");
    endSections(); $("#topActions").innerHTML = ""; setSubnav(""); window.wixaTopReset?.();
    view.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  };
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) { try { await document.startViewTransition(swap).updateCallbackDone; } catch { swap(); } }
  else { swap(); view.style.animation = "none"; view.offsetHeight; view.style.animation = ""; }
  // a page split into sub-tabs is drawn whole first, then split: keep it hidden behind a placeholder until it is
  // split, so it appears once, already in its tabs (no flash of every section, then the tabs)
  const S = SECTIONS[current];
  let hold = null;
  if (S) { hold = document.createElement("div"); hold.className = "skeleton view-hold"; hold.style.height = "120px"; view.before(hold); view.classList.add("is-building"); }
  try { await v.render(view); if (S && view.querySelector(".card")) sectionize(view, current, S.groups, S.rules, S.fallback); }
  catch (e) { console.error(e); view.innerHTML = `<div class="empty">حدث خطأ: ${esc(e.message)}</div>`; }
  finally { hold?.remove(); view.classList.remove("is-building"); }
}
