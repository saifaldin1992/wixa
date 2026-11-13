/* Menu links to sections of the home page (services, fields, our work, packages, the calculator, partners…).
   On the home page they glide to the section and stop just under the header bar; from any other page the browser
   opens the home page on that section. Pages of their own (careers, contact, articles, about, FAQ) open normally. */
const OFFSET = 90;
const target = (id) => document.getElementById(id === "industries" ? "services" : id);

function glide(id) {
  const el = target(id);
  if (!el) return false;
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
    if (u.origin !== location.origin || u.pathname !== "/" || !u.hash || document.documentElement.dataset.page !== "home") return;
    const id = u.hash.slice(1);
    if (!target(id)) return;
    e.preventDefault();
    const menu = document.getElementById("menu");
    if (menu?.classList.contains("open")) document.getElementById("menuBtn")?.click(); // close the phone menu first
    history.replaceState(null, "", u.hash);
    if (id === "industries") dispatchEvent(new HashChangeEvent("hashchange")); // opens the "by your field" tab
    requestAnimationFrame(() => glide(id));
  });
  // arriving from another page (/#pricing…): settle on the section once the page has laid out
  const id = location.hash.slice(1);
  if (id && document.documentElement.dataset.page === "home" && target(id)) setTimeout(() => glide(id), 450);
}
