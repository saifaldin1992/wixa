/* Header, mobile menu, language switch, magnetic buttons */
import { $, $$, lang, anim, setLang } from "./core.js";
import { render } from "./render.js";

// ---------- interactions ----------
export function setupUI() {
  const header = $("#header"), menu = $("#menu"), btn = $("#menuBtn"), scrim = $("#scrim");
  const toggle = (open) => { btn.setAttribute("aria-expanded", open); menu.classList.toggle("open", open); scrim.classList.toggle("open", open); };
  btn.addEventListener("click", () => toggle(btn.getAttribute("aria-expanded") !== "true"));
  scrim.addEventListener("click", () => toggle(false));
  $$("a", menu).forEach((a) => a.addEventListener("click", () => toggle(false)));

  let last = 0;
  addEventListener("scroll", () => {
    const y = scrollY;
    header.classList.toggle("hide", y > last && y > 300 && !menu.classList.contains("open"));
    last = y;
  }, { passive: true });

  const switchLang = () => {
    setLang(lang === "ar" ? "en" : "ar");
    try { localStorage.setItem("wixa-lang", lang); } catch {}
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
