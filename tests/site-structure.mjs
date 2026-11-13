// The site's structure rules (public/js/site-structure.js, docs/DEVELOPERS.md → «بنية الموقع»):
//  A. a saved page layout is merged safely: unknown, repeated and not-allowed sections are dropped, switched-off ones
//     keep their place, and a section the saved list does not know yet takes its default place;
//  B. the server puts a page's sections in its layout order and keeps every section in the page exactly once;
//  C. a menu link follows its section (to the first page where it is on) and hides when its page or section is off;
//  D. on the running site: every page opens, has one main heading, shows exactly its layout's sections, has the same
//     header and footer as every other page, and every visible menu link opens a real page.
// Usage: node tests/site-structure.mjs          (A–C, no server)
//        BASE=http://localhost:8787 node tests/site-structure.mjs   (A–D)
import { readFileSync } from "node:fs";
const { layoutFor, navLink, DEFAULT_LAYOUTS, SECTION_PAGES, SECTIONS } = await import("../public/js/site-structure.js");
const { arrangeSections } = await import("../src/lib/arrange.js");
let bad = 0;
const check = (ok, label) => { if (!ok) bad++; console.log(`${ok ? "✓" : "✗"} ${label}`); };
const keys = (l) => l.map((x) => x.k + (x.on ? "" : "·")).join(" ");

// ---------- A. layout merge
check(keys(layoutFor({}, "home")) === DEFAULT_LAYOUTS.home.join(" "), "no saved layout → today's default order");
for (const p of Object.keys(DEFAULT_LAYOUTS)) check(DEFAULT_LAYOUTS[p].every((k) => SECTIONS[k]?.pages.includes(p)), `default layout of «${p}» uses only sections allowed there`);
const saved = { layout: { home: [{ k: "stats" }, "hero", { k: "story", on: false }, "nonsense", "hero", { k: "order" }] } };
const merged = layoutFor(saved, "home");
const at = (k) => merged.findIndex((x) => x.k === k);
check(at("stats") < at("hero") && at("hero") < at("story"), "saved order is kept");
check(merged.filter((x) => x.k === "hero").length === 1, "a repeated section appears once");
check(!merged.some((x) => x.k === "nonsense"), "an unknown section is dropped");
check(!merged.some((x) => x.k === "order"), "a section not allowed on the page is dropped (order form on home)");
check(merged.find((x) => x.k === "story")?.on === false, "a switched-off section keeps its place, off");
check(DEFAULT_LAYOUTS.home.every((k) => merged.some((x) => x.k === k)), "every default section is still there (new ones take their default place)");
const newer = layoutFor({ layout: { about: ["about", "story", "process", "stats", "testimonials", "contact"] } }, "about");
check(keys(newer) === "about story partners process stats testimonials contact", "a section missing from an older saved list goes back after its default neighbour");

// ---------- B. arranging the HTML
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const markers = [...html.matchAll(/<!--s:([a-z]+)-->/g)].map((m) => m[1]);
check(markers.length === new Set(markers).size, "every section is marked once in index.html");
check(markers.every((k) => SECTIONS[k]), "every marked section is in the site structure");
check(Object.keys(SECTIONS).every((k) => markers.includes(k)), "every section in the site structure is in index.html");
const out = arrangeSections(html, saved, "home");
const shown = [...out.matchAll(/<!--s:([a-z]+)-->\s*<section[^>]*data-pages="home"/g)].map((m) => m[1]);
check(shown.join(" ") === merged.filter((x) => x.on).map((x) => x.k).join(" "), "the page shows its layout's sections in order");
check([...out.matchAll(/<!--s:([a-z]+)-->/g)].length === markers.length, "no section is lost or repeated");
check(out.slice(0, out.indexOf("<!--s:")) === html.slice(0, html.indexOf("<!--s:")), "everything before the sections is untouched");

// ---------- C. menu links
check(navLink({}, "services").href === "/services" && navLink({}, "services").shown, "a hub link goes to its page (/services)");
check(navLink({}, "industries").href === "/services#industries", "«حلول حسب مجالك» opens the services page on its «by field» tab");
check(navLink({}, "calc").href === "/pricing#calculator" && navLink({}, "calc").shown, "the calculator link follows the calculator to the pricing page");
check(!navLink({ sections: { services: false } }, "services").shown, "a link to a switched-off section is hidden");
check(!navLink({ sections: { industries: false } }, "industries").shown, "a link to a switched-off part (industries) is hidden");
const moved = { layout: { home: DEFAULT_LAYOUTS.home.map((k) => ({ k, on: k !== "partners" })) } };
check(navLink(moved, "partners").href === "/about#partners", "a section moved off the home page: the link follows it (/about#partners)");
check(!navLink({ layout: { home: DEFAULT_LAYOUTS.home.map((k) => ({ k, on: k !== "partners" })), about: DEFAULT_LAYOUTS.about.map((k) => ({ k, on: k !== "partners" })) } }, "partners").shown, "a section on no page: its link is hidden");
check(!navLink({}, "partners", new Set(["partners"])).shown, "an empty section (no partners): its link is hidden");
check(!navLink({ sections: { faq: false } }, "faq").shown && navLink({}, "faq").href === "/faq", "a page link hides with its page's main section");

// ---------- D. the running site
const BASE = process.env.BASE;
if (BASE) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const PAGES = [...Object.values(SECTION_PAGES).map((x) => x.path), "/blog", "/privacy", "/status", "/terms", "/payment"];
  const shells = new Map(), links = new Set();
  for (const path of PAGES) {
    const r = await p.goto(BASE + path, { waitUntil: "load" });
    await p.waitForTimeout(300);
    const info = await p.evaluate(() => {
      const vis = (e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed";
      const norm = (el) => [...(el.length !== undefined ? el : [el])].flatMap((x) => [...x.querySelectorAll("a")]).filter((a) => !a.hidden && !a.closest("[hidden]")).map((a) => `${a.textContent.trim()}→${new URL(a.href).pathname}${new URL(a.href).hash}`).sort().join("|");
      return {
        h1: [...document.querySelectorAll("h1")].filter(vis).length,
        page: document.documentElement.dataset.page || "",
        shown: [...document.querySelectorAll("main [data-pages]")].filter(vis).map((s) => s.dataset.pages),
        header: norm(document.querySelector(".header__menu")) + "#" + document.querySelectorAll(".header .theme-btn, .header #langBtn, .header .menu-btn").length,
        footer: norm(document.querySelectorAll(".footer__nav")) + "#" + document.querySelectorAll(".footer .track-btn, .footer__brand, .footer__credit, .fgroup").length,
        hrefs: [...document.querySelectorAll(".header a[data-nav]:not([hidden]), .footer__nav a:not([hidden])")].map((a) => new URL(a.href).pathname),
      };
    });
    check(r.status() === 200, `${path} opens`);
    check(info.h1 === 1, `${path} has one main heading (${info.h1})`);
    if (info.page && SECTION_PAGES[info.page]) check(info.shown.every((x) => x === info.page), `${path} shows only its own sections`);
    shells.set(path, info.header + "\n" + info.footer);
    info.hrefs.forEach((h) => links.add(h));
  }
  const ref = shells.get("/");
  for (const [path, s] of shells) check(s === ref, `${path}: same header and footer as the home page`);
  for (const h of links) { const r = await p.request.get(BASE + h); check(r.status() === 200, `menu link ${h} opens`); }
  // old links to a section that moved to its own page open that page, on the section
  for (const [from, to] of [["/#calculator", "/pricing#calculator"], ["/#about", "/about#about"], ["/?lang=en#calculator", "/pricing?lang=en#calculator"]]) {
    await p.goto(BASE + from, { waitUntil: "load" }); await p.waitForURL((u) => u.pathname !== "/", { timeout: 4000 }).catch(() => {});
    check(await p.evaluate(() => location.pathname + location.search + location.hash) === to, `old link ${from} opens ${to}`);
  }
  // inner pages have their own title (not the home page's)
  const titles = new Set();
  for (const path of ["/services", "/projects", "/pricing", "/about"]) { await p.goto(BASE + path, { waitUntil: "load" }); await p.waitForTimeout(300); titles.add(await p.title()); }
  check(titles.size === 4, "each section page keeps its own title");
  await b.close();
}
process.exit(bad ? 1 : 0);
