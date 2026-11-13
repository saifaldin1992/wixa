/* Links to a section (services, fields, our work, packages, the calculator, partners…).
   On the page that shows that section they glide to it and stop just under the header bar. A link to a section
   that lives on another page now (an old /#calculator or /#about link, a shared link, a search result) opens the
   page that holds it, on that section. Pages of their own (careers, contact, articles…) open normally. */
import { layoutFor, SECTION_PAGES } from "../site-structure.js";
import { state } from "./core.js";

const OFFSET = 90;
const target = (id) => document.getElementById(id === "industries" ? "services" : id);
const page = () => document.documentElement.dataset.page || "home";
// the section is shown on this page (not just present in the HTML, hidden)
const here = (el) => !!el && (el.dataset.pages === undefined || el.dataset.pages.split(" ").includes(page()));
// the first page whose layout shows this section
function pageOf(k) {
  for (const [pg, p] of Object.entries(SECTION_PAGES)) if (layoutFor(state.settings || {}, pg).some((x) => x.k === k && x.on)) return p.path;
  return null;
}

function glide(id) {
  const el = target(id);
  if (!here(el)) return false;
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -OFFSET });
  else scrollTo({ top: el.getBoundingClientRect().top + scrollY - OFFSET, behavior: "smooth" });
  return true;
}

// Pages of their own: start fetching as soon as a finger touches the link or the mouse rests on it,
// so the page is (almost) ready when the tap ends. Chrome does this from /speculation-rules.json already.
const OWN = /^\/(careers|contact|blog|about|faq|privacy|track|services|projects|pricing)(\/|$)/;
function warm(e) {
  const a = e.target.closest?.("a[href]");
  if (!a || HTMLScriptElement.supports?.("speculationrules")) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || !OWN.test(u.pathname) || u.pathname === location.pathname || document.querySelector(`link[rel=prefetch][href="${u.pathname + u.search}"]`)) return;
  const l = document.createElement("link"); l.rel = "prefetch"; l.href = u.pathname + u.search; document.head.appendChild(l);
}

export function setupNavScroll() {
  document.addEventListener("touchstart", warm, { passive: true });
  document.addEventListener("mouseover", (e) => { clearTimeout(warm.t); warm.t = setTimeout(() => warm(e), 80); });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname !== location.pathname || !u.hash) return;
    const id = u.hash.slice(1);
    if (!here(target(id))) return;
    e.preventDefault();
    const menu = document.getElementById("menu");
    if (menu?.classList.contains("open")) document.getElementById("menuBtn")?.click(); // close the phone menu first
    history.replaceState(null, "", u.pathname + u.search + u.hash);
    if (id === "industries") dispatchEvent(new HashChangeEvent("hashchange")); // opens the "by your field" tab
    requestAnimationFrame(() => glide(id));
  });
  // arriving with a section in the address (/pricing#calculator…): settle on it once the page has laid out;
  // if the section lives on another page now, open that page instead
  const id = location.hash.slice(1), el = id && target(id);
  if (!el || !el.dataset.s) return;
  if (here(el)) { setTimeout(() => glide(id), 450); return; }
  const to = pageOf(el.dataset.s);
  if (to && to !== location.pathname) location.replace(to + location.search + location.hash);
}
