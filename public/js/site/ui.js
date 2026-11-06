/* Header, mobile menu, language switch, magnetic buttons */
import { $, $$, lang, anim, setLang } from "./core.js";
import { render } from "./render.js";
import { openContact } from "./contact.js";

// ---------- interactions ----------
export function setupUI() {
  const header = $("#header"), menu = $("#menu"), btn = $("#menuBtn"), scrim = $("#scrim");
  const toggle = (open) => { btn.setAttribute("aria-expanded", open); menu.classList.toggle("open", open); scrim.classList.toggle("open", open); };
  btn.addEventListener("click", () => toggle(btn.getAttribute("aria-expanded") !== "true"));
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
  const mbar = $("#mbar"), toTop = $("#toTop");
  let atContact = false;
  const io = new IntersectionObserver((es) => { es.forEach((e) => { e.target.dataset.vis = e.isIntersecting ? "1" : ""; }); atContact = !!document.querySelector('#contact[data-vis="1"], .footer[data-vis="1"]'); syncBars(); }, { threshold: 0.15 });
  ["#contact", ".footer"].forEach((s) => { const el = $(s); if (el) io.observe(el); });
  function syncBars() {
    const past = scrollY > innerHeight * 0.8;
    mbar?.classList.toggle("show", past && !atContact);
    toTop?.classList.toggle("show", scrollY > innerHeight * 1.5);
  }
  addEventListener("scroll", syncBars, { passive: true }); syncBars();
  toTop?.addEventListener("click", () => { if (window.__lenis) window.__lenis.scrollTo(0); else scrollTo({ top: 0, behavior: "smooth" }); });
  $("#mbarContact")?.addEventListener("click", (e) => { e.preventDefault(); openContact(); });

  const switchLang = () => {
    setLang(lang === "ar" ? "en" : "ar");
    try { localStorage.setItem("wixa-lang", lang); } catch {}
      document.cookie = `wixa-lang=${lang}; path=/; max-age=31536000; samesite=lax`; // lets the server open the next visit in this language
    document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }).onfinish = () => {
      render(); $(".hero").classList.add("in", "in-hero");
      document.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: "forwards" });
    };
  };
  $("#langBtn").addEventListener("click", switchLang);
  $("#langBtn2").addEventListener("click", switchLang);

  if (matchMedia("(hover: hover)").matches) $$(".magnetic").forEach((el) => {
    el.addEventListener("pointermove", (e) => { if (!anim) return; const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`; });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
}
