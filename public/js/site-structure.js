/* Site structure — the one list of the site's pages, the sections each page is made of, and where each menu link goes.
   Shared by the server (which builds every page from it), the site's script and the dashboard.

   Rules (docs/DEVELOPERS.md → «بنية الموقع»):
   • A page is an ordered list of sections. The order and on/off are kept in the settings (settings.layout[page]),
     never in the HTML; a page without a saved list uses its default below.
   • A saved list is merged with the defaults (layoutFor): unknown sections and sections not allowed on that page are
     dropped, repeats are dropped, and a section added in a later version of the site takes its default place —
     so a saved order never breaks when sections are added to or removed from the code.
   • Removing a section from a page means switching it off (on: false), so it stays in its place if switched on again.
   • Menu links point at a page or at a section by key, never at a typed address. A link to a section goes to the
     first page where that section is on (the home page first); if it is on nowhere, the link is hidden. */

// Pages built from sections (one HTML file, public/index.html). key → address and the section a menu link to the
// page follows (switching that section off everywhere hides the link, as before).
export const SECTION_PAGES = {
  home: { path: "/", name_ar: "الرئيسية", name_en: "Home" },
  about: { path: "/about", name_ar: "من نحن", name_en: "About us", main: "about" },
  careers: { path: "/careers", name_ar: "الوظائف", name_en: "Careers", main: "careers" },
  faq: { path: "/faq", name_ar: "الأسئلة الشائعة", name_en: "FAQ", main: "faq" },
  contact: { path: "/contact", name_ar: "تواصل معنا", name_en: "Contact us", main: "contact" },
  order: { path: "/order", name_ar: "اطلب مشروعك", name_en: "Order your project" },
  track: { path: "/track", name_ar: "تتبع طلبك", name_en: "Track your order" },
};
// Pages built by the server from their own content (articles, policies, status…). Pages added from the dashboard
// (settings.pages) join these at run time (sitePages in site-pages.js).
export const OWN_PAGES = {
  blog: { path: "/blog", name_ar: "المقالات", name_en: "Articles" },
  privacy: { path: "/privacy", name_ar: "سياسة الخصوصية", name_en: "Privacy policy" },
  status: { path: "/status", name_ar: "حالة الخدمات", name_en: "Service status" },
  team: { path: "/team", name_ar: "فريقنا", name_en: "Our team" },
};

// Every section, and the pages it may appear on. Keys are the HTML's data-section (and <!--s:key--> markers).
// parts: smaller blocks inside a section, switched on and off on their own (settings.sections) but never moved alone.
const OPEN = ["home", "about", "careers", "faq", "contact"]; // the general pages: any general section may go on any of them
export const SECTIONS = {
  hero: { name_ar: "البداية (العنوان الرئيسي)", pages: ["home"] },
  about: { name_ar: "نبذة عن الشركة", pages: OPEN },
  story: { name_ar: "القصة (المميزات)", pages: OPEN },
  partners: { name_ar: "شركاؤنا", pages: OPEN },
  services: { name_ar: "خدماتنا", pages: OPEN, parts: ["industries"] },
  projects: { name_ar: "نماذج من عملنا", pages: OPEN },
  process: { name_ar: "كيف نعمل + لماذا تطمئن معنا", pages: OPEN, parts: ["guarantees"] },
  stats: { name_ar: "أرقام نفخر بها", pages: OPEN },
  pricing: { name_ar: "الباقات والأسعار", pages: OPEN },
  calculator: { name_ar: "حاسبة التكلفة", pages: OPEN },
  testimonials: { name_ar: "آراء العملاء", pages: OPEN },
  careers: { name_ar: "الوظائف", pages: OPEN },
  faq: { name_ar: "الأسئلة الشائعة", pages: OPEN },
  ways: { name_ar: "طرق التواصل", pages: OPEN },
  order: { name_ar: "نموذج الطلب", pages: ["order"] },
  track: { name_ar: "تتبع الطلب", pages: ["track"] },
  contact: { name_ar: "الخاتمة: جاهزون لإنجاز مشروعك", pages: OPEN },
};

// What each page shows when nothing is saved — exactly the site as it was before layouts existed.
export const DEFAULT_LAYOUTS = {
  home: ["hero", "story", "partners", "services", "projects", "process", "stats", "pricing", "calculator", "testimonials", "contact"],
  about: ["about", "story", "partners", "process", "stats", "testimonials", "contact"],
  careers: ["careers", "contact"],
  faq: ["faq", "contact"],
  contact: ["ways", "contact"],
  order: ["order"],
  track: ["track"],
};

// A page's sections in order, each { k, on } — the saved list merged with the defaults (see the rules above).
export function layoutFor(settings, page) {
  const def = DEFAULT_LAYOUTS[page];
  if (!def) return [];
  const allowed = (k) => typeof k === "string" && SECTIONS[k] && SECTIONS[k].pages.includes(page);
  const saved = settings && settings.layout && Array.isArray(settings.layout[page]) ? settings.layout[page] : null;
  if (!saved) return def.map((k) => ({ k, on: true }));
  const out = [], seen = new Set();
  for (const x of saved) {
    const k = typeof x === "string" ? x : x && x.k;
    if (!allowed(k) || seen.has(k)) continue;
    seen.add(k); out.push({ k, on: !(x && x.on === false) });
  }
  // a default section the saved list does not mention is new: it goes right after the default section before it
  def.forEach((k, i) => {
    if (seen.has(k)) return;
    seen.add(k);
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const p = out.findIndex((x) => x.k === def[j]); if (p >= 0) { at = p + 1; break; } }
    out.splice(at, 0, { k, on: true });
  });
  return out;
}

// Is a section shown on the site at all: not switched off (dashboard → إظهار الأقسام) and not empty.
// empty: keys of sections with nothing to show (no partners yet…), worked out by whoever has the content.
export const sectionShown = (settings, k, empty) => !(settings && settings.sections && settings.sections[k] === false) && !(empty && empty.has(k));

// Menu links: what each one points at. A section link goes to the first page where that section is on.
export const NAV_TARGETS = {
  home: { page: "home" }, about: { page: "about" }, careers: { page: "careers" }, contact: { page: "contact" }, faq: { page: "faq" },
  blog: { page: "blog" }, privacy: { page: "privacy" },
  services: { section: "services" }, industries: { section: "services", part: "industries" }, projects: { section: "projects" },
  pricing: { section: "pricing" }, calc: { section: "calculator" }, partners: { section: "partners" },
};
const ANCHOR = { services: "services", industries: "industries", projects: "projects", pricing: "pricing", calculator: "calculator", partners: "partners" };
const PAGE_ORDER = ["home", "about", "careers", "faq", "contact"];

// Where a menu link goes and whether it shows: { href (without ?lang), shown }.
export function navLink(settings, k, empty) {
  const t = NAV_TARGETS[k];
  if (!t) return { href: "/", shown: false };
  if (t.page) {
    const p = SECTION_PAGES[t.page] || OWN_PAGES[t.page];
    const main = SECTION_PAGES[t.page] && SECTION_PAGES[t.page].main;
    return { href: p ? p.path : "/", shown: !!p && (!main || sectionShown(settings, main, empty)) };
  }
  const anchor = ANCHOR[t.part || t.section] || t.section;
  if (!sectionShown(settings, t.section, empty) || (t.part && !sectionShown(settings, t.part, empty))) return { href: `/#${anchor}`, shown: false };
  for (const pg of PAGE_ORDER) {
    if (layoutFor(settings, pg).some((x) => x.k === t.section && x.on)) return { href: `${SECTION_PAGES[pg].path === "/" ? "/" : SECTION_PAGES[pg].path}#${anchor}`, shown: true };
  }
  return { href: `/#${anchor}`, shown: false };
}
