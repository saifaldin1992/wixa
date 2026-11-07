/* WIXA — public site entry. Each part lives in its own module under /js/site/. */
import { $, PREVIEW, state, setLang } from "./site/core.js";
import { load } from "./site/data.js";
import { render } from "./site/render.js";
import { setupUI } from "./site/ui.js";
import { setupTheme } from "./site/theme.js";
import { setupParticles, setupLogoTilt } from "./site/hero.js";
import { setupCalc } from "./site/calculator.js";
import { setupContact } from "./site/contact.js";
import { setupProjectModal } from "./site/projects.js";
import { setupBooking, setupTracking } from "./site/extras.js";
import { setupProgress, setupCursor, setupMotion, pauseOffscreen } from "./site/effects.js";
const { DEFAULTS, merge, applyTheme } = window.WIXA;

// script errors in visitors' browsers go to the dashboard's error log (at most 3 per page view)
let errSent = 0;
const reportError = (msg, src, line) => {
  if (errSent++ >= 3 || PREVIEW || !msg) return;
  try { navigator.sendBeacon("/api/client-error", new Blob([JSON.stringify({ where: "site", msg: String(msg).slice(0, 300), src, line, path: location.pathname + location.search })], { type: "text/plain" })); } catch {}
};
addEventListener("error", (e) => { if (e.filename || e.message) reportError(e.message, e.filename, e.lineno); });
addEventListener("unhandledrejection", (e) => reportError(`Unhandled: ${e.reason?.message || e.reason}`, "", 0));

// sign-in links from Supabase emails that land on the homepage belong to the dashboard
if (/(^|&)(type=(recovery|email_change|signup)|error_description=|message=)/.test(location.hash.slice(1))) location.replace("/admin/" + location.hash);

// live preview from the admin dashboard
if (PREVIEW) addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.type !== "wixa-preview") return;
  const d = e.data.payload;
  if (d.settings) state.settings = merge(DEFAULTS, d.settings);
  for (const k of ["projects", "services", "partners", "testimonials"]) if (d[k]) state[k] = d[k];
  if (d.lang) setLang(d.lang);
  render(); $(".hero").classList.add("in", "in-hero");
});

// ---------- boot ----------
(async () => {
  applyTheme(state.settings);
  await load();
  render();
  setupUI();
  setupContact();
  setupTheme();
  setupParticles();
  setupLogoTilt();
  setupCalc();
  setupProjectModal();
  setupBooking();
  setupTracking();
  setupProgress();
  setupCursor();
  // reveal right away (the content is already in the page); scroll effects start once everything has loaded
  $(".loader").classList.add("done");
  document.body.classList.remove("is-loading");
  requestAnimationFrame(() => $(".hero").classList.add("in", "in-hero"));
  let moving = false;
  const motion = () => { if (!moving) { moving = true; setupMotion(); } };
  if (document.readyState === "complete") motion();
  else { addEventListener("load", motion, { once: true }); setTimeout(motion, 2500); }
  pauseOffscreen();
  if (PREVIEW) parent.postMessage({ type: "wixa-preview-ready" }, location.origin);
})();
