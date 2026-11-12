/* Sidebar, top bar and the hash router */
import { $, $$, setSubnav, sectionize, composeView, endSections, DEFAULTS, ROLE_AR, closeModal, confirmBox, esc, merge, role, savedJSON, setSettings } from "./core.js";
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
import { viewMessages } from "./views/messages.js";
import { viewOverview } from "./views/overview.js";
import { viewPosts } from "./views/posts.js";
import { viewSeo } from "./views/seo.js";
import { viewDiagnose } from "./views/diagnose.js";
import { viewDevGuide } from "./views/devguide.js";
import { viewAudit } from "./views/audit.js";

// ---------------- shell / router ----------------
export const VIEWS = {
  overview: { title: "الرئيسية", sub: "ملخص اليوم وزوار الموقع ونشاطه", render: viewOverview },
  appearance: { title: "المظهر", sub: "الألوان ونوع الخط وحجمه والحركة — مع معاينة مباشرة", render: viewAppearance },
  brand: { title: "UI / UX", sub: "الهوية البصرية ومكوّنات الواجهة والمعايير — خاص بك ولا يظهر في الموقع", render: viewBrand },
  content: { title: "صفحات الموقع", sub: "نصوص الموقع بالعربي والإنجليزي، الأرقام، الأقسام وبيانات التواصل", render: viewContent },
  projects: { title: "المشاريع", sub: "أضف مشاريعك واعرضها في قسم الإنجازات", render: () => viewList("projects") },
  services: { title: "الخدمات", sub: "الخدمات التي تظهر في الموقع", render: () => viewList("services") },
  partners: { title: "الشركاء", sub: "شعارات العملاء والشركاء", render: () => viewList("partners") },
  testimonials: { title: "آراء العملاء", sub: "بطاقات الآراء المتحركة في الموقع", render: () => viewList("testimonials") },
  posts: { title: "المقالات", sub: "اكتب مقالات تساعد الناس على إيجادك في Google", render: viewPosts },
  seo: { title: "البحث والمشاركة", sub: "كيف يظهر موقعك في Google وعند مشاركة الرابط", render: viewSeo },
  integrations: { title: "التكاملات", sub: "بوابة الدفع، أدوات القياس والإعلانات، والتقارير والمراقبة", render: (v) => composeView(v, [[viewIntegrations, ["#cAddons", "#cHooks", "#cKeys", "#cTags", "#cReports"]]]) },
  notify: { title: "الإشعارات والبريد", sub: "تنبيهات الرسائل الجديدة، الرد التلقائي للزبون، والردود الجاهزة", render: (v) => composeView(v, [[viewIntegrations, ["#cAlerts", "#cReply", "#cTpl"]], [viewAccount, ["بريد تنبيهات"]]]) },
  protect: { title: "الحماية", sub: "الحماية من الرسائل المزعجة ووضع الصيانة", render: (v) => composeView(v, [[viewIntegrations, ["#cSpam", "#cMaint"]]]) },
  backup: { title: "النسخ الاحتياطي", sub: "النسخة التلقائية، نسخة المحتوى، والاسترجاع", render: (v) => composeView(v, [[viewIntegrations, ["#cBackup"]], [viewAccount, ["نسخة احتياطية"]]]) },
  diagnose: { title: "الفحص والتشخيص", sub: "فحص كل أجزاء الموقع، مكان أي عطل وطريقة حله، وسجل الأعطال", render: (v) => composeView(v, [[viewIntegrations, ["#cPublish"]], [viewDiagnose, ["*"]]]) },
  audit: { title: "سجل التعديلات", sub: "من عدّل ماذا ومتى — للمالك فقط، ولا يمكن تعديله أو حذفه", render: viewAudit },
  devguide: { title: "دليل المطوّر", sub: "كيف بُني المشروع وأين يوجد كل جزء — للمطورين", render: viewDevGuide },
  orders: { title: "الطلبات", sub: "كل طلبات المشاريع من الموقع في مكان واحد: ماذا اختار الزبون، ومن أين، وهداياه وخصمه", render: viewOrders },
  messages: { title: "الرسائل", sub: "رسائل نموذج التواصل", render: viewMessages },
  sales: { title: "لوحة المبيعات", sub: "من تواصل، ومن اشترى، ومن أين جاؤوا، وكيف نخدمهم", render: viewSales },
  campaigns: { title: "العروض والحملات", sub: "هدايا وخصم طلب المشروع، شريط العروض، عرض الحاسبة، والحملات البريدية", render: viewCampaigns },
  customers: { title: "الزبائن", sub: "كل من تواصل معك من الموقع — للمتابعة والعروض", render: viewCustomers },
  chats: { title: "المحادثات", sub: "دردشة مباشرة مع زوار الموقع", render: viewChats },
  team: { title: "الفريق والصلاحيات", sub: "من يدخل إلى لوحة التحكم وماذا يستطيع — بالدعوة فقط", render: viewTeam },
  account: { title: "الحساب", sub: "بيانات الدخول والأمان", render: (v) => composeView(v, [[viewAccount, ["الحساب", "تغيير بريد", "التحقق بخطوتين", "تغيير كلمة"]]]) },
};

// Every long page as sub-menus (the shared rule): branch row, then its sections; one section shows at a time.
// [match, section]: "#id" a card id, ".class" a card class, otherwise the start of the card's title.
const ONE = (items) => [{ k: "main", label: "", items }];
const SECTIONS = {
  overview: { groups: ONE([["today", "ملخص اليوم"], ["visits", "الزيارات"], ["behave", "سلوك الزوار والسرعة"]]), fallback: "today",
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
  notify: { groups: ONE([["alerts", "تنبيهات الرسائل"], ["reply", "الرد التلقائي"], ["tpl", "الردود الجاهزة"]]), rules: [["#cAlerts", "alerts"], ["بريد تنبيهات", "alerts"], ["#cReply", "reply"], ["#cTpl", "tpl"]] },
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
  editor: ["overview", "content", "projects", "services", "partners", "testimonials", "posts", "appearance", "brand", "seo", "devguide", "account"],
  support: ["overview", "orders", "messages", "chats", "customers", "account"],
};
export const canSee = (name) => !ROLE_VIEWS[role] || ROLE_VIEWS[role].includes(name);
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
  // large title: shrinks into the bar as soon as the page scrolls (like iOS)
  const top = $(".top");
  const onScroll = () => top.classList.toggle("top--compact", scrollY > 24);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
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
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
}

export async function route() {
  let name = location.hash.slice(1) || "overview";
  if (name === "status") { name = "diagnose"; history.replaceState(null, "", "#diagnose"); } // the old Connections page lives inside diagnostics now
  applyRoleNav();
  if (!canSee(name)) { name = "overview"; history.replaceState(null, "", "#overview"); }
  const v = VIEWS[name] || VIEWS.overview;
  if (current && ["appearance", "content", "seo"].includes(current) && !["appearance", "content", "seo"].includes(name) && isDirty()) {
    if (!(await confirmBox("لديك تغييرات غير محفوظة", "هل تريد المغادرة دون حفظ؟", "مغادرة"))) { history.replaceState(null, "", `#${current}`); return; }
    setSettings(merge(DEFAULTS, JSON.parse(savedJSON)));
  }
  current = VIEWS[name] ? name : "overview";
  $$("#sideNav a").forEach((a) => a.classList.toggle("on", a.dataset.view === current));
  const view = $("#view");
  // the page changes with a short cross-fade (View Transitions), only for the switch itself — never while loading
  const swap = () => {
    $("#viewTitle").textContent = v.title; $("#viewSub").textContent = v.sub;
    endSections(); $("#topActions").innerHTML = ""; setSubnav("");
    view.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  };
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) { try { await document.startViewTransition(swap).updateCallbackDone; } catch { swap(); } }
  else { swap(); view.style.animation = "none"; view.offsetHeight; view.style.animation = ""; }
  try { await v.render(view); const S = SECTIONS[current]; if (S && view.querySelector(".card")) sectionize(view, current, S.groups, S.rules, S.fallback); }
  catch (e) { console.error(e); view.innerHTML = `<div class="empty">حدث خطأ: ${esc(e.message)}</div>`; }
}
