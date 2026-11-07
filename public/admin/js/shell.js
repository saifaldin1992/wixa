/* Sidebar, top bar and the hash router */
import { $, $$, DEFAULTS, ROLE_AR, closeModal, confirmBox, esc, merge, role, savedJSON, setSettings } from "./core.js";
import { viewTeam } from "./views/team.js";
import { viewChats } from "./views/chats.js";
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

// ---------------- shell / router ----------------
export const VIEWS = {
  overview: { title: "نظرة عامة", sub: "زوار الموقع ونشاطه", render: viewOverview },
  appearance: { title: "المظهر والخطوط", sub: "الألوان ونوع الخط وحجمه والحركة — مع معاينة مباشرة", render: viewAppearance },
  brand: { title: "الهوية البصرية", sub: "دليل الشعار والألوان والخط — خاص بك ولا يظهر في الموقع", render: viewBrand },
  content: { title: "المحتوى والنصوص", sub: "نصوص الموقع بالعربي والإنجليزي، الأرقام، الأقسام وبيانات التواصل", render: viewContent },
  projects: { title: "المشاريع", sub: "أضف مشاريعك واعرضها في قسم الإنجازات", render: () => viewList("projects") },
  services: { title: "الخدمات", sub: "الخدمات التي تظهر في الموقع", render: () => viewList("services") },
  partners: { title: "الشركاء", sub: "شعارات العملاء والشركاء", render: () => viewList("partners") },
  testimonials: { title: "آراء العملاء", sub: "بطاقات الآراء المتحركة في الموقع", render: () => viewList("testimonials") },
  posts: { title: "المقالات", sub: "اكتب مقالات تساعد الناس على إيجادك في Google", render: viewPosts },
  seo: { title: "البحث والمشاركة", sub: "كيف يظهر موقعك في Google وعند مشاركة الرابط", render: viewSeo },
  integrations: { title: "التكاملات", sub: "التنبيهات والرد التلقائي وأدوات القياس والحماية ووضع الصيانة", render: viewIntegrations },
  diagnose: { title: "الفحص والتشخيص", sub: "فحص كل أجزاء الموقع، مكان أي عطل وطريقة حله، وسجل الأعطال", render: viewDiagnose },
  devguide: { title: "دليل المطوّر", sub: "كيف بُني المشروع وأين يوجد كل جزء — للمطورين", render: viewDevGuide },
  messages: { title: "الرسائل", sub: "رسائل نموذج التواصل", render: viewMessages },
  chats: { title: "المحادثات", sub: "دردشة مباشرة مع زوار الموقع", render: viewChats },
  team: { title: "الفريق والصلاحيات", sub: "من يدخل إلى لوحة التحكم وماذا يستطيع — بالدعوة فقط", render: viewTeam },
  account: { title: "الحساب", sub: "بيانات الدخول والأمان", render: viewAccount },
};
export let current = null;

// which pages each role sees (the server and the database enforce the same rules)
const ROLE_VIEWS = {
  owner: null, // everything
  editor: ["overview", "content", "projects", "services", "partners", "testimonials", "posts", "appearance", "brand", "seo", "devguide", "account"],
  support: ["overview", "messages", "chats", "account"],
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
  $("#viewTitle").textContent = v.title; $("#viewSub").textContent = v.sub;
  $("#topActions").innerHTML = "";
  const view = $("#view");
  view.style.animation = "none"; view.offsetHeight; view.style.animation = "";
  view.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  try { await v.render(view); } catch (e) { console.error(e); view.innerHTML = `<div class="empty">حدث خطأ: ${esc(e.message)}</div>`; }
}
