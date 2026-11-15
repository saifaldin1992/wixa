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
  services: { path: "/services", name_ar: "الخدمات", name_en: "Services", main: "services" },
  projects: { path: "/projects", name_ar: "أعمالنا", name_en: "Our work", main: "projects" },
  pricing: { path: "/pricing", name_ar: "الأسعار", name_en: "Pricing", main: "pricing" },
  order: { path: "/order", name_ar: "اطلب مشروعك", name_en: "Order your project" },
};
// Pages built by the server from their own content (articles, policies, status…). Pages added from the dashboard
// (settings.pages) join these at run time (sitePages in site-pages.js).
const OWN_PAGES = {
  blog: { path: "/blog", name_ar: "المقالات", name_en: "Articles" },
  privacy: { path: "/privacy", name_ar: "سياسة الخصوصية", name_en: "Privacy policy" },
  team: { path: "/team", name_ar: "فريقنا", name_en: "Our team" },
};

// Every section, and the pages it may appear on. Keys are the HTML's data-section (and <!--s:key--> markers).
// parts: smaller blocks inside a section, switched on and off on their own (settings.sections) but never moved alone.
const OPEN = ["home", "about", "careers", "faq", "contact", "services", "projects", "pricing"]; // the general pages: any general section may go on any of them
export const SECTIONS = {
  hero: { name_ar: "البداية (العنوان الرئيسي)", pages: ["home"] },
  about: { name_ar: "نبذة عن الشركة", pages: OPEN },
  story: { name_ar: "لماذا ويكسا (المميزات والضمانات)", pages: OPEN, parts: ["guarantees"] },
  partners: { name_ar: "شركاؤنا", pages: OPEN },
  services: { name_ar: "خدماتنا", pages: OPEN, parts: ["industries"] },
  projects: { name_ar: "أعمالنا", pages: OPEN },
  process: { name_ar: "كيف نعمل", pages: OPEN },
  stats: { name_ar: "أرقام نفخر بها", pages: OPEN },
  pricing: { name_ar: "الأسعار", pages: OPEN },
  calculator: { name_ar: "حاسبة التكلفة", pages: OPEN },
  testimonials: { name_ar: "آراء العملاء", pages: OPEN },
  careers: { name_ar: "الوظائف", pages: OPEN },
  faq: { name_ar: "الأسئلة الشائعة", pages: OPEN },
  ways: { name_ar: "طرق التواصل", pages: OPEN },
  order: { name_ar: "نموذج الطلب", pages: ["order"] },
  contact: { name_ar: "الخاتمة: جاهزون لإنجاز مشروعك", pages: OPEN },
};

// What each page shows when nothing is saved. The home page is a summary of the hub pages (services, our work,
// pricing): each of those sections ends there with a link to its page; the cost calculator lives on the pricing page.
// Each page ends in its own way: the contact block where a visitor may want it, nothing extra on the contact page
// (it is the contact page) or on careers (its own «send your CV» ends it).
export const DEFAULT_LAYOUTS = {
  home: ["hero", "story", "partners", "services", "projects", "process", "stats", "testimonials", "pricing", "contact"],
  services: ["services", "contact"],
  projects: ["projects", "contact"],
  pricing: ["pricing", "calculator", "contact"],
  // the company page: who we are, its values, partners and figures — «لماذا ويكسا» and «كيف نعمل» stay on the home page
  // (they repeated the values almost word for word); the owner can still add them back (ترتيب الأقسام)
  about: ["about", "partners", "stats", "testimonials", "contact"],
  careers: ["careers"],
  faq: ["faq", "contact"],
  contact: ["ways"],
  order: ["order"],
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
const NAV_TARGETS = {
  home: { page: "home" }, about: { page: "about" }, careers: { page: "careers" }, contact: { page: "contact" }, faq: { page: "faq" },
  blog: { page: "blog" }, privacy: { page: "privacy" },
  services: { page: "services" }, industries: { page: "services", hash: "industries", part: "industries" }, projects: { page: "projects" },
  pricing: { page: "pricing" }, calc: { section: "calculator" }, partners: { section: "partners" },
  // industries and calc are not menu links any more (they are parts of the services and pricing pages, and are not in
  // the menu list: DEFAULTS.nav in shared.js); they stay here for the in-page buttons that point at them (data-more)
};
const ANCHOR = { services: "services", industries: "industries", projects: "projects", pricing: "pricing", calculator: "calculator", partners: "partners" };
const PAGE_ORDER = ["home", "services", "projects", "pricing", "about", "careers", "faq", "contact"];

// Where a menu link goes and whether it shows: { href (without ?lang), shown }.
export function navLink(settings, k, empty) {
  const t = NAV_TARGETS[k];
  if (!t) return { href: "/", shown: false };
  if (t.page) {
    const p = SECTION_PAGES[t.page] || OWN_PAGES[t.page];
    const main = SECTION_PAGES[t.page] && SECTION_PAGES[t.page].main;
    // a page with nothing on it yet (no articles) keeps its link out of the menus
    const on = !!p && !(empty && empty.has(k)) && (!main || sectionShown(settings, main, empty)) && (!t.part || sectionShown(settings, t.part, empty));
    return { href: p ? `${p.path}${t.hash ? `#${t.hash}` : ""}` : "/", shown: on };
  }
  const anchor = ANCHOR[t.part || t.section] || t.section;
  if (!sectionShown(settings, t.section, empty) || (t.part && !sectionShown(settings, t.part, empty))) return { href: `/#${anchor}`, shown: false };
  for (const pg of PAGE_ORDER) {
    if (layoutFor(settings, pg).some((x) => x.k === t.section && x.on)) return { href: `${SECTION_PAGES[pg].path === "/" ? "/" : SECTION_PAGES[pg].path}#${anchor}`, shown: true };
  }
  return { href: `/#${anchor}`, shown: false };
}

// The footer's link groups, in order. A menu link goes to the group given here unless the owner chose another one
// (dashboard → القوائم; kept as `g` on the link in settings.nav). Pages added from the dashboard go to «قانوني» unless
// they say otherwise (page.group); the team page goes to «الشركة». The owner may rename these groups and add new ones
// (settings.footer_groups); «قانوني» always exists and is shown as one small line under the other groups.
export const FOOTER_GROUPS = [
  { k: "services", name_ar: "الخدمات", name_en: "Services" },
  { k: "company", name_ar: "الشركة", name_en: "Company" },
  { k: "support", name_ar: "الدعم", name_en: "Support" },
  { k: "legal", name_ar: "قانوني", name_en: "Legal" },
];
// apple.com's footer is the site map: «الخدمات» lists the services themselves, the company's pages go under «الشركة»
const LINK_GROUP = { services: "services", pricing: "services", projects: "company",
  about: "company", careers: "company", blog: "company", partners: "company", home: "company",
  contact: "support", faq: "support", privacy: "legal" };
const str = (v, n = 80) => (typeof v === "string" ? v.trim().slice(0, n) : "");
// the groups as saved by the owner (names, order, added groups), always with «قانوني» last
export function footerGroups(settings) {
  const saved = settings && Array.isArray(settings.footer_groups) ? settings.footer_groups : null;
  if (!saved) return FOOTER_GROUPS.map((g) => ({ ...g }));
  const out = [], seen = new Set();
  for (const g of saved) {
    const k = str(g && g.k, 24);
    if (!/^[a-z0-9-]+$/.test(k) || seen.has(k)) continue;
    const def = FOOTER_GROUPS.find((d) => d.k === k) || {};
    seen.add(k); out.push({ k, name_ar: str(g.name_ar) || def.name_ar || k, name_en: str(g.name_en) || def.name_en || str(g.name_ar) || k });
  }
  if (!seen.has("legal")) out.push({ ...FOOTER_GROUPS[3] });
  return [...out.filter((g) => g.k !== "legal"), out.find((g) => g.k === "legal")];
}
export const groupOf = (x, settings) => {
  const gs = footerGroups(settings);
  if (gs.some((g) => g.k === x.g)) return x.g;
  const d = LINK_GROUP[x.k] || (x.kind === "page" ? "legal" : "company");
  return gs.some((g) => g.k === d) ? d : gs[0].k;
};

// Links the owner added (dashboard → القوائم → «إضافة رابط»): a service, a page added in the dashboard, or any web
// address. Kept in settings.nav.items as { k: "x-…", kind, ref | url, label_ar, label_en, at, g }.
// services: [{ slug, title_ar, title_en }] and pages: [{ path, title_ar, title_en, published }] as the caller has them.
// → { href, label(lang), external, shown }
export function customLink(x, { services = [], pages = [] } = {}) {
  const none = { href: "/", label: () => "", external: false, shown: false };
  if (!x || typeof x.k !== "string" || !x.k.startsWith("x-")) return none;
  const own = (lang, fb) => str(x[`label_${lang}`]) || str(x.label_ar) || str(x.label_en) || fb(lang) || "";
  if (x.kind === "service") {
    const s = services.find((v) => v && (v.slug === x.ref || String(v.id) === String(x.ref)));
    return s ? { href: `/services/${encodeURIComponent(s.slug)}`, label: (l) => own(l, (q) => s[`title_${q}`] || s.title_ar), external: false, shown: true } : none;
  }
  if (x.kind === "page") {
    const p = pages.find((v) => v && v.path === x.ref);
    return p ? { href: p.path, label: (l) => own(l, (q) => p[`title_${q}`] || p.title_ar), external: false, shown: p.published !== false } : none;
  }
  if (x.kind === "url") {
    const u = str(x.url, 500);
    const ok = /^https:\/\/[^\s/]+\.[^\s]+$/i.test(u) || /^\/[^\s/][^\s]*$/.test(u) || /^(mailto|tel):[^\s]+$/i.test(u);
    return ok ? { href: u, label: (l) => own(l, () => u.replace(/^https:\/\//, "")), external: /^https:/i.test(u), shown: true } : none;
  }
  return none;
}

// Where «ابدأ مشروعك» (top bar, phone menu, local bars) takes the visitor: the order page unless the owner chose
// another place (dashboard → القوائم). → { href (without ?lang for site pages), order: true when it is the order page }
export function ctaTarget(settings, whatsapp) {
  const c = (settings && settings.nav && settings.nav.cta) || {};
  const wa = String(whatsapp || "").replace(/\D/g, "");
  if (c.to === "contact") return { href: "/contact", order: false };
  if (c.to === "calc") return { href: "/pricing#calculator", order: false };
  if (c.to === "whatsapp" && wa) return { href: `https://wa.me/${wa}`, order: false, external: true };
  if (c.to === "url") { const l = customLink({ k: "x-cta", kind: "url", url: c.url }); if (l.shown) return { href: l.href, order: false, external: l.external }; }
  return { href: "/order", order: true };
}
