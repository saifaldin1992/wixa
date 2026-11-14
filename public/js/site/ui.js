/* Header, mobile menu, language switch, magnetic buttons */
import { $, $$, lang, anim } from "./core.js";
import { openContact } from "./contact.js";

// ---------- interactions ----------
export function setupUI() {
  const header = $("#header"), menu = $("#menu"), btn = $("#menuBtn"), scrim = $("#scrim");
  const toggle = (open) => {
    btn.setAttribute("aria-expanded", open); menu.classList.toggle("open", open); scrim.classList.toggle("open", open);
    document.documentElement.classList.toggle("menu-open", open); // the page underneath stays still
    open ? window.__lenis?.stop() : window.__lenis?.start();
    // keyboard users land on the first link of the open menu, and back on the button when it closes
    if (open) setTimeout(() => $("a", menu)?.focus({ preventScroll: true }), 280); // after the slide-in, once the links can take focus
  };
  btn.addEventListener("click", () => toggle(btn.getAttribute("aria-expanded") !== "true"));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") { toggle(false); btn.focus(); }
  });
  // «تخطَّ إلى المحتوى»: the smooth scroller would swallow the jump, so move the focus to the content by hand
  $(".skip")?.addEventListener("click", (e) => {
    const c = document.getElementById("content"); if (!c) return;
    e.preventDefault(); c.focus({ preventScroll: true }); window.__lenis ? window.__lenis.scrollTo(c, { immediate: true }) : c.scrollIntoView();
  });
  scrim.addEventListener("click", () => toggle(false));
  $$("a", menu).forEach((a) => a.addEventListener("click", () => toggle(false)));

  let last = 0;
  const wa = $("#wa");
  let waTimer;
  addEventListener("scroll", () => {
    const y = scrollY, down = y > last;
    header.classList.toggle("hide", down && y > 300 && !menu.classList.contains("open"));
    // the floating WhatsApp button steps aside while reading, and comes back when scrolling stops or goes up
    if (wa) {
      wa.classList.toggle("wa--away", down && y > 200);
      clearTimeout(waTimer); waTimer = setTimeout(() => wa.classList.remove("wa--away"), 900);
    }
    last = y;
  }, { passive: true });

  // phones: contact + WhatsApp bar once past the first screen, out of the way at the contact form and the footer
  const mbar = $("#mbar");
  let atContact = false;
  const io = new IntersectionObserver((es) => { es.forEach((e) => { e.target.dataset.vis = e.isIntersecting ? "1" : ""; }); atContact = !!document.querySelector('#contact[data-vis="1"], .footer[data-vis="1"]'); syncBars(); }, { threshold: 0.15 });
  ["#contact", ".footer"].forEach((s) => { const el = $(s); if (el) io.observe(el); });
  function syncBars() {
    const past = scrollY > innerHeight * 0.8;
    mbar?.classList.toggle("show", past && !atContact);
  }
  addEventListener("scroll", syncBars, { passive: true }); syncBars();

  // phones: the round chat/WhatsApp buttons never cover the hero's main buttons
  const ctas = $(".hero__ctas");
  const clearFabs = () => {
    const r = ctas?.getBoundingClientRect();
    document.documentElement.classList.toggle("fab-clear", !!r && innerWidth <= 760 && r.height > 0 && r.top < innerHeight && r.bottom > innerHeight - 90);
  };
  if (ctas) { addEventListener("scroll", clearFabs, { passive: true }); addEventListener("resize", clearFabs); setTimeout(clearFabs, 100); }
  // phones: while the page is being scrolled down the round button steps aside so it never sits on the text being
  // read; it comes back as soon as the visitor scrolls up or stops for a moment
  let lastY = scrollY, idle = 0;
  addEventListener("scroll", () => {
    const y = scrollY, root = document.documentElement;
    if (innerWidth <= 760 && y > lastY + 4 && y > 120) root.classList.add("fab-away");
    else if (y < lastY - 4) root.classList.remove("fab-away");
    lastY = y;
    clearTimeout(idle); idle = setTimeout(() => root.classList.remove("fab-away"), 900);
  }, { passive: true });
  $("#mbarContact")?.addEventListener("click", (e) => { e.preventDefault(); openContact(); });

  // FAQ: one tap opens or closes an answer
  $("#faqList")?.addEventListener("click", (e) => {
    const q = e.target.closest(".faq__q"); if (!q) return;
    const open = q.getAttribute("aria-expanded") !== "true";
    q.setAttribute("aria-expanded", String(open));
    q.closest(".faq__item").classList.toggle("open", open);
    $(`#${q.getAttribute("aria-controls")}`).hidden = !open;
  });

  // the page is opened again in the other language (built by the server, like a first visit), at the same place
  const switchLang = () => {
    const next = lang === "ar" ? "en" : "ar";
    try { localStorage.setItem("wixa-lang", next); sessionStorage.setItem("wixa-scroll-y", String(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight))); } catch {}
    document.cookie = `wixa-lang=${next}; path=/; max-age=31536000; samesite=lax`; // lets the server open the next visit in this language
    const u = new URL(location.href); u.searchParams.set("lang", next); u.hash = "";
    location.replace(u.toString());
  };
  $("#langBtn").addEventListener("click", (e) => { e.preventDefault(); switchLang(); });
  // phones: the footer's link groups start folded (a tap on a title opens it); computers show them open
  if (matchMedia("(max-width: 760px)").matches) $$(".fgroup[open]").forEach((d) => { d.open = false; });
  // back at the same place after a language switch
  try {
    const f = parseFloat(sessionStorage.getItem("wixa-scroll-y"));
    sessionStorage.removeItem("wixa-scroll"); sessionStorage.removeItem("wixa-scroll-y");
    if (f > 0) requestAnimationFrame(() => scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)));
  } catch {}

  if (matchMedia("(hover: hover)").matches) $$(".magnetic").forEach((el) => {
    el.addEventListener("pointermove", (e) => { if (!anim) return; const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`; });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
}
