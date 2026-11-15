/* Scroll watch (the «how we work» line fills as you scroll) and GSAP scroll motion.
   The progress bar and the custom cursor were removed in the Apple redesign (Nov 2026). */
import { $, $$, anim } from "./core.js";
import { updateProcess } from "./sections.js";

export function setupScrollWatch() {
  let queued = false;
  const upd = () => { queued = false; updateProcess(); };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(upd); } };
  addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); upd();
}

const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
export const desktop = () => matchMedia("(hover: hover) and (pointer: fine)").matches;

// Scroll effects (smooth scrolling, project parallax) only on computers with a mouse/trackpad.
// Phones and tablets keep the device's own scrolling and never download these libraries.
export async function setupMotion() {
  if (!anim || !desktop()) return;
  try {
    await loadScript("/vendor/gsap-3.12.5.min.js");
    await Promise.all([loadScript("/vendor/ScrollTrigger-3.12.5.min.js"), loadScript("/vendor/lenis-1.1.13.min.js")]);
  } catch { return; }
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  if (window.Lenis) {
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
