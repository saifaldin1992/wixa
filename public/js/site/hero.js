/* Hero: self-drawing logo, the dot that runs along it, particles and 3D tilt */
import { $, esc, safeUrl, state, anim } from "./core.js";

// ---------- hero: self-drawing logo ----------
let logoD = null;
export async function buildHeroLogo() {
  const svg = $("#heroLogoSvg");
  if (!svg) return;
  const custom = state.settings.brand.logo_url;
  const key = custom || "default";
  if (svg.dataset.built === key) return; // keep the animation when other settings change
  svg.dataset.built = key;
  if (custom) {
    // An uploaded logo can't be traced, so it fades in with the same glow and float.
    svg.innerHTML = `<image href="${esc(safeUrl(custom))}" x="0" y="0" width="2021" height="982" preserveAspectRatio="xMidYMid meet" class="lg-fill"/>`;
    return;
  }
  if (!logoD) {
    try {
      const txt = await (await fetch("/logo.svg")).text();
      logoD = (txt.match(/\sd="([^"]+)"/) || [])[1];
    } catch {}
  }
  if (!logoD) return;
  svg.innerHTML = `
    <defs>
      <linearGradient id="lgShine" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="lgClip"><path d="${logoD}" fill-rule="evenodd"/></clipPath>
    </defs>
    <path class="lg-glow" d="${logoD}" fill-rule="evenodd"/>
    <path class="lg-fill" d="${logoD}" fill-rule="evenodd"/>
    <g clip-path="url(#lgClip)"><rect class="lg-shine lg-shine-bar" x="0" y="-100" width="700" height="1200" transform="skewX(-18)"/></g>
    <path class="lg-stroke" d="${logoD}" pathLength="1"/>
    ${runnerDot(logoD)}`;
}

// A short piece of the site's wave line (the curve that separates the sections, same colours) travels along the
// logo's outer outline (the longest sub-path), turning with it.
function runnerDot(d) {
  const outer = d.split(/(?=M)/).sort((a, b) => b.length - a.length)[0];
  const motion = anim ? `<animateMotion dur="11s" begin="2.8s" repeatCount="indefinite" rotate="auto" path="${outer}"/>` : "";
  // without animation the dot simply rests at the start of the outline
  const start = outer.match(/M\s*([-\d.]+)[ ,]([-\d.]+)/) || [0, 0, 0];
  return `<g class="lg-runner" ${anim ? "" : `transform="translate(${start[1]} ${start[2]})"`}>
    <defs><linearGradient id="lgWave" x1="0" x2="1"><stop offset="0" style="stop-color:var(--fg)"/><stop offset=".5" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--fg)"/></linearGradient></defs>
    <path class="lg-runner__edge" d="M-190 0 C -127 -36, -63 -36, 0 0 S 127 36, 190 0"/><path class="lg-runner__wave" d="M-190 0 C -127 -36, -63 -36, 0 0 S 127 36, 190 0"/>${motion}</g>`;
}

// ---------- hero: floating particles ----------
export function setupParticles() {
  const c = $("#particles");
  if (!c || !anim || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const ctx = c.getContext("2d");
  let w, h, dpr, dots = [], mouse = { x: -999, y: -999 }, running = true;
  const color = () => getComputedStyle(document.documentElement).getPropertyValue("--fg-rgb").trim() || "91,33,182";
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim() || "217,164,65";
  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = c.clientWidth; h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(44, (w * h) / 26000));
    dots = Array.from({ length: n }, (_, i) => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.8 + .6,
      vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, gold: i % 7 === 0 }));
  };
  resize(); addEventListener("resize", resize);
  $(".hero").addEventListener("pointermove", (e) => { const r = c.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  $(".hero").addEventListener("pointerleave", () => (mouse = { x: -999, y: -999 }));
  new IntersectionObserver(([e]) => (running = e.isIntersecting)).observe($(".hero"));
  let fg = color(), ac = accent();
  new MutationObserver(() => { fg = color(); ac = accent(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  const tick = () => {
    requestAnimationFrame(tick);
    if (!running || document.hidden) return;
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      const dx = d.x - mouse.x, dy = d.y - mouse.y, dist = Math.hypot(dx, dy);
      if (dist < 120) { d.x += dx / dist * .8; d.y += dy / dist * .8; }
      d.x += d.vx; d.y += d.vy;
      if (d.x < -10) d.x = w + 10; if (d.x > w + 10) d.x = -10; if (d.y < -10) d.y = h + 10; if (d.y > h + 10) d.y = -10;
    }
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
      const a = dots[i], b = dots[j], dd = Math.hypot(a.x - b.x, a.y - b.y);
      if (dd < 110) { ctx.strokeStyle = `rgba(${fg},${(1 - dd / 110) * .09})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    for (const d of dots) { ctx.fillStyle = d.gold ? `rgba(${ac},.6)` : `rgba(${fg},.28)`; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
  };
  tick();
}

// ---------- hero: logo follows the pointer in 3D ----------
export function setupLogoTilt() {
  const logo = $("#heroLogo");
  if (!logo || !matchMedia("(hover: hover)").matches) return;
  $(".hero").addEventListener("pointermove", (e) => {
    if (!anim) return;
    const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
    logo.style.setProperty("--ly", `${x * 18}deg`); logo.style.setProperty("--lx", `${-y * 12}deg`);
  });
  $(".hero").addEventListener("pointerleave", () => { logo.style.removeProperty("--ly"); logo.style.removeProperty("--lx"); });
}
