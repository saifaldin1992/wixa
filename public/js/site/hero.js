/* Hero: the self-drawing logo, its soft glow and the line that runs round it (no particles or tilt since the Apple redesign) */
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
    <path class="lg-fill" d="${logoD}" fill-rule="evenodd"/>
    <path class="lg-stroke" d="${logoD}" pathLength="1"/>`;
  // Light phones: the parts that move all the time each get their own layer, so a frame of one never makes the
  // browser repaint the others. The blurred glow is drawn once and only its layer's opacity breathes (GPU), and
  // the tracing line repaints just its own small layer.
  const box = svg.parentElement;
  box.querySelectorAll(".lg-layer").forEach((n) => n.remove());
  svg.insertAdjacentHTML("beforebegin", `<svg class="lg-layer lg-layer--glow" viewBox="0 0 2021 982" aria-hidden="true"><path class="lg-glow" d="${logoD}" fill-rule="evenodd"/></svg>`);
  svg.insertAdjacentHTML("afterend", `<svg class="lg-layer lg-layer--trace" viewBox="0 0 2021 982" aria-hidden="true">${runnerDot(logoD)}</svg>`);
}

// A short stroke in the site's wave colours (purple ends, cyan middle) that draws itself along the logo's outer outline (the longest sub-path),
// bending with every curve as if a pen were tracing the logo.
function runnerDot(d) {
  const outer = d.split(/(?=M)/).sort((a, b) => b.length - a.length)[0];
  return `<g class="lg-runner">
    <path class="lg-trace__halo" d="${outer}" pathLength="1"/><path class="lg-trace__halo2" d="${outer}" pathLength="1"/><path class="lg-trace__edge" d="${outer}" pathLength="1"/><path class="lg-trace" d="${outer}" pathLength="1"/></g>`;
}

// ---------- hero: the globe's top sits right under the header bar ----------
// The bar can be pushed down (the staging strip, a promo bar), so measure where it really ends.
export function fitHeroTop() {
  const hero = document.querySelector(".hero"), bar = document.querySelector(".header__bar"); // the visible bar only (the header box also holds the hidden phone menu)
  if (!hero || !bar) return;
  const fit = () => {
    if (scrollY > 40) return; // the bar slides away on scroll; measure it only at the top of the page
    const bottom = bar.getBoundingClientRect().bottom + scrollY, top = hero.getBoundingClientRect().top + scrollY;
    hero.style.setProperty("padding-top", `${Math.max(60, Math.round(bottom - top + 6))}px`, "important");
  };
  fit();
  addEventListener("resize", fit);
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(document.body);
}

