/* Cost estimator */
import { $, $$, esc, ICONS, state, lang, anim } from "./core.js";
import { openContact } from "./contact.js";
import { printQuote } from "./extras.js";

// ---------- cost calculator ----------
const calc = { type: 0, feats: new Set(), rush: false };
export function renderCalc() {
  const cfg = state.settings.calculator || {};
  const types = cfg.types || [];
  if (calc.type >= types.length) calc.type = 0;
  $("#calcTypes").innerHTML = types.map((t, i) => `<button type="button" class="ctype" role="radio" data-i="${i}" aria-checked="${i === calc.type}"><i>${ICONS[t.icon] || ICONS.code}</i><b>${esc(t[`label_${lang}`] || t.label_ar)}</b></button>`).join("");
  $("#calcFeats").innerHTML = (cfg.features || []).map((f, i) => `<button type="button" class="cfeat" data-i="${i}" aria-pressed="${calc.feats.has(i)}">${esc(f[`label_${lang}`] || f.label_ar)}</button>`).join("");
  $$("#calcSpeed button").forEach((b) => b.classList.toggle("on", (b.dataset.rush === "1") === calc.rush));
  updateCalc(false);
}
let calcShown = [0, 0];
function calcRange() {
  const cfg = state.settings.calculator || {};
  const t = (cfg.types || [])[calc.type]; if (!t) return null;
  let min = Number(t.min) || 0, max = Number(t.max) || 0;
  calc.feats.forEach((i) => { const f = (cfg.features || [])[i]; if (f) { min += Number(f.min) || 0; max += Number(f.max) || 0; } });
  if (calc.rush) { const k = Number(cfg.rush) || 1.3; min *= k; max *= k; }
  const r = (v) => Math.round(v / 50) * 50;
  return [r(min), r(max)];
}
function updateCalc(animate = true) {
  const range = calcRange(), el = $("#calcPrice");
  if (!range) { el.textContent = "—"; return; }
  const cur = (state.settings.calculator || {}).currency || "$";
  const fmt = (v) => Math.round(v).toLocaleString("en");
  const sticky = $("#calcStickyPrice");
  const draw = (a, b) => { el.innerHTML = `${fmt(a)} – ${fmt(b)} <small>${esc(cur)}</small>`; if (sticky) sticky.textContent = `${fmt(a)} – ${fmt(b)} ${cur}`; };
  const maxAll = Math.max(...((state.settings.calculator || {}).types || []).map((t) => Number(t.max) || 0), 1) * 1.6;
  $("#calcBar").style.width = `${Math.min(100, (range[1] / maxAll) * 100)}%`;
  if (!animate || !anim) { calcShown = range; draw(...range); return; }
  const from = calcShown.slice(), t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - k, 3);
    draw(from[0] + (range[0] - from[0]) * e, from[1] + (range[1] - from[1]) * e);
    if (k < 1) requestAnimationFrame(step); else calcShown = range;
  };
  requestAnimationFrame(step);
}
// phones: while the options are on screen but the price card is not, keep the price visible at the bottom
function setupCalcSticky() {
  const bar = $("#calcSticky"), opts = $(".calc__opts"), result = $(".calc__result");
  if (!bar || !opts || !result) return;
  let optsIn = false, resultIn = false;
  const sync = () => bar.classList.toggle("show", optsIn && !resultIn);
  new IntersectionObserver(([e]) => { optsIn = e.isIntersecting; sync(); }, { rootMargin: "-20% 0px -20% 0px" }).observe(opts);
  new IntersectionObserver(([e]) => { resultIn = e.isIntersecting; sync(); }, { threshold: 0.3 }).observe(result);
  bar.addEventListener("click", () => result.scrollIntoView({ behavior: "smooth", block: "center" }));
}

export function setupCalc() {
  setupCalcSticky();
  $("#calcTypes").addEventListener("click", (e) => { const b = e.target.closest(".ctype"); if (!b) return; calc.type = +b.dataset.i; $$(".ctype").forEach((x) => x.setAttribute("aria-checked", x === b)); updateCalc(); });
  $("#calcFeats").addEventListener("click", (e) => { const b = e.target.closest(".cfeat"); if (!b) return; const i = +b.dataset.i; calc.feats.has(i) ? calc.feats.delete(i) : calc.feats.add(i); b.setAttribute("aria-pressed", calc.feats.has(i)); updateCalc(); });
  $("#calcSpeed").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; calc.rush = b.dataset.rush === "1"; $$("#calcSpeed button").forEach((x) => x.classList.toggle("on", x === b)); updateCalc(); });
  $("#calcWa").addEventListener("click", (e) => {
    const msg = estimateText(), wa = (state.settings.contact?.whatsapp || "").replace(/\D/g, "");
    if (!msg || !wa) { e.preventDefault(); return; }
    e.currentTarget.href = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
  });
  $("#calcCta").addEventListener("click", () => { const msg = estimateText(); if (msg) openContact(msg); });
  $("#calcPdf").addEventListener("click", () => {
    const cfg = state.settings.calculator || {}, t = (cfg.types || [])[calc.type], r = calcRange();
    if (!t || !r) return;
    printQuote({
      type: t[`label_${lang}`] || t.label_ar,
      features: [...calc.feats].map((i) => (cfg.features || [])[i]).filter(Boolean).map((f) => f[`label_${lang}`] || f.label_ar),
      rush: calc.rush, range: `${r[0].toLocaleString("en")} – ${r[1].toLocaleString("en")} ${cfg.currency || "$"}`,
    });
  });
}

// the chosen project, features and estimate as a ready message
function estimateText() {
  {
    const cfg = state.settings.calculator || {}, t = (cfg.types || [])[calc.type], r = calcRange();
    if (!t || !r) return "";
    const feats = [...calc.feats].map((i) => (cfg.features || [])[i]).filter(Boolean).map((f) => f[`label_${lang}`] || f.label_ar);
    const ar = lang === "ar";
    const msg = (ar ? `أرغب بعرض سعر لـ: ${t.label_ar}` : `I'd like a quote for: ${t.label_en || t.label_ar}`)
      + (feats.length ? (ar ? `\nالميزات: ${feats.join("، ")}` : `\nFeatures: ${feats.join(", ")}`) : "")
      + (calc.rush ? (ar ? "\nالتنفيذ: مستعجل" : "\nTimeline: rush") : "")
      + (ar ? `\nالتقدير المبدئي: ${r[0].toLocaleString("en")} – ${r[1].toLocaleString("en")} ${cfg.currency || "$"}` : `\nEstimate: ${r[0].toLocaleString("en")} – ${r[1].toLocaleString("en")} ${cfg.currency || "$"}`);
    return msg;
  }
}
