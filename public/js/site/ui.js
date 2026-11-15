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
  addEventListener("scroll", () => {
    const y = scrollY, down = y > last;
    header.classList.toggle("hide", down && y > 300 && !menu.classList.contains("open"));
    last = y;
  }, { passive: true });

  // the round buttons at the bottom of the screen (chat, WhatsApp, contact) stay put: nothing at the bottom of the
  // screen moves while the page scrolls (Nov 2026 — they used to slide away and back, which read as a jumping bar)
  $("#mbar")?.classList.add("show");

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
