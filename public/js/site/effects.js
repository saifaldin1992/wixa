/* Scroll progress, custom cursor and GSAP scroll motion */
import { $, $$, lang, anim, state } from "./core.js";
import { updateProcess } from "./sections.js";

// ---------- scroll progress + custom cursor ----------
export function setupProgress() {
  const bar = $("#progressBar");
  const upd = () => { const h = document.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`; updateProcess(); };
  addEventListener("scroll", upd, { passive: true }); addEventListener("resize", upd); upd();
}
export function setupCursor() {
  if (!anim || state.settings.cursor === false || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  document.documentElement.classList.add("has-cursor");
  const cur = $(".cursor"), dot = $(".cursor__dot"), ring = $(".cursor__ring");
  let x = -100, y = -100, rx = -100, ry = -100;
  addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; dot.style.transform = `translate(${x}px, ${y}px)`; }, { passive: true });
  const loop = () => { rx += (x - rx) * 0.18; ry += (y - ry) * 0.18; ring.style.transform = `translate(${rx}px, ${ry}px)`; requestAnimationFrame(loop); };
  loop();
  document.addEventListener("pointerover", (e) => {
    const view = e.target.closest(".project__media, [data-open]");
    const hov = e.target.closest("a, button, .ctype, .cfeat, input, select, textarea");
    cur.classList.toggle("view", !!view); cur.classList.toggle("hover", !view && !!hov);
    ring.textContent = view ? (lang === "ar" ? "عرض" : "View") : "";
  });
  document.addEventListener("pointerleave", () => { x = y = -100; });
}

export function setupMotion() {
  if (!anim || !window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  // touch screens keep the phone's own scrolling (lighter and more natural than a smoothed one)
  if (window.Lenis && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    window.__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]'); if (!a) return;
      const id = a.getAttribute("href"); const t = id === "#top" ? 0 : $(id);
      if (t !== null) { e.preventDefault(); lenis.scrollTo(t, { offset: -90 }); }
    });
  }
  gsap.to(".hero__bg", { yPercent: 18, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.to(".hero__content", { y: 80, opacity: 0.3, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  $$(".project").forEach((p) => {
    gsap.fromTo($(".screen", p), { y: 60 }, { y: -20, ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "bottom top", scrub: true } });
    gsap.fromTo($(".phone", p), { y: 120 }, { y: -40, ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "bottom top", scrub: true } });
    gsap.from(p, { y: 80, opacity: 0, scale: 0.97, duration: 1.2, ease: "power3.out", scrollTrigger: { trigger: p, start: "top 88%" } });
  });
  gsap.from(".stats__inner", { clipPath: "inset(12% 8% 12% 8% round 40px)", duration: 1.4, ease: "power3.out", scrollTrigger: { trigger: ".stats", start: "top 85%" } });
  gsap.from(".partner", { opacity: 0, y: 30, duration: 0.8, stagger: { each: 0.05, from: "random" }, ease: "power2.out", scrollTrigger: { trigger: ".partners__grid", start: "top 85%" } });
}

// Looping animations (hero logo and map, story illustrations) pause while off screen, so scrolling and taps stay smooth on phones.
export function pauseOffscreen() {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("is-off", !e.isIntersecting)), { rootMargin: "80px" });
  $$(".hero, .story-item").forEach((el) => io.observe(el));
}
