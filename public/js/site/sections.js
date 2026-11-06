/* Process steps, testimonials marquee, reveal-on-scroll and counters */
import { $, $$, esc, safeUrl, C, L, state, anim } from "./core.js";

// ---------- process (steps light up with scroll) ----------
export function renderProcess() {
  const c = C();
  $("#processSteps").innerHTML = (c.process || []).map((st, i) => `
    <li class="pstep"><div class="pstep__num">${String(i + 1).padStart(2, "0")}</div><div><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p></div></li>`).join("");
  updateProcess();
}
export function updateProcess() {
  const track = $("#processTrack"); if (!track) return;
  const r = track.getBoundingClientRect(), vh = innerHeight;
  const p = anim ? Math.min(1, Math.max(0, (vh * 0.75 - r.top) / (r.height * 0.9))) : 1;
  track.style.setProperty("--p", p.toFixed(3));
  const steps = $$(".pstep", track);
  steps.forEach((s, i) => s.classList.toggle("on", p >= (i / Math.max(1, steps.length - 1)) * 0.92 || p === 1));
}

// ---------- testimonials (infinite marquee) ----------
export function renderTestimonials() {
  const list = state.testimonials || [];
  const card = (t) => {
    const av = t.avatar_url ? `<img src="${esc(safeUrl(t.avatar_url))}" alt="" loading="lazy">` : esc((t.name || "?").trim()[0] || "?");
    const stars = "★".repeat(Math.max(1, Math.min(5, t.rating || 5)));
    return `<figure class="tcard"><div class="tcard__stars" aria-label="${t.rating || 5}/5">${stars}</div>
      <blockquote class="tcard__quote">${esc(L(t, "quote"))}</blockquote>
      <figcaption class="tcard__who"><span class="tcard__av">${av}</span><span><b>${esc(t.name)}</b><span>${esc(L(t, "role"))}</span></span></figcaption></figure>`;
  };
  // repeat so one half always fills the screen, then duplicate for a seamless loop
  let base = list.slice(); while (base.length && base.length < 6) base = base.concat(list);
  const half = base.map(card).join("");
  $("#tstTrack").innerHTML = half + half;
  $("#tstTrack").style.setProperty("--dur", `${Math.max(30, base.length * 7)}s`);
}

// ---------- reveal / counters ----------
let io, cio;
export function observe() {
  io ??= new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  $$(".reveal-up:not(.in), .story-item:not(.in), .hero:not(.in), .wave:not(.in), .footer__wave:not(.in)").forEach((el) => io.observe(el));

  cio ??= new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target, end = +el.dataset.count; cio.unobserve(el);
    if (!anim) { el.textContent = end.toLocaleString("en"); return; }
    const t0 = performance.now();
    const tick = (now) => { const k = Math.min(1, (now - t0) / 1800); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 4))).toLocaleString("en"); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), { threshold: 0.5 });
  $$("[data-count]").forEach((el) => cio.observe(el));
}
