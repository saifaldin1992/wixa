/* Site content: embedded in the page by the Worker, with a cached / API fallback */
import { PREVIEW, setState } from "./core.js";
const { DEFAULTS, merge } = window.WIXA;

// ---------- data ----------
export async function load() {
  // The Worker embeds the content in the page, so normally no request is needed.
  try {
    const el = document.getElementById("wixa-data");
    if (el) { setData(JSON.parse(el.textContent)); try { localStorage.setItem("wixa-site", el.textContent); } catch {} return; }
  } catch {}
  try {
    const cached = JSON.parse(localStorage.getItem("wixa-site") || "null");
    if (cached && !PREVIEW) setData(cached);
  } catch {}
  try {
    const res = await fetch("/api/site");
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    setData(data);
    try { localStorage.setItem("wixa-site", JSON.stringify(data)); } catch {}
  } catch (e) { console.warn("Using default content:", e); }
}
function setData(d) {
  window.WIXA.markEnv(d.env);
  setState({
    settings: merge(DEFAULTS, d.settings || {}),
    projects: d.projects || [], services: d.services || [], partners: d.partners || [], testimonials: d.testimonials || [],
    turnstile: d.turnstile || "",
  });
}
