/* Shared helpers, UI strings and the page state */
const { DEFAULTS, merge } = window.WIXA;
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const safeUrl = (u) => { if (!u || typeof u !== "string" || !u.trim()) return ""; try { const x = new URL(u, location.href); return ["http:", "https:", "mailto:", "tel:"].includes(x.protocol) ? x.href : ""; } catch { return ""; } };
export const PREVIEW = new URLSearchParams(location.search).has("preview");
export const reducedOS = matchMedia("(prefers-reduced-motion: reduce)").matches;

import { UI_DEFAULTS } from "../ui-strings.js";
// interface texts: the defaults, with the dashboard's changes (settings.ui) laid over them
export const UI = { ar: { ...UI_DEFAULTS.ar }, en: { ...UI_DEFAULTS.en } };
export function applyUiTexts(settings) {
  for (const l of ["ar", "en"]) {
    UI[l] = { ...UI_DEFAULTS[l] };
    for (const [k, v] of Object.entries(settings?.ui?.[l] || {})) if (typeof v === "string" && v.trim() && k in UI_DEFAULTS[l]) UI[l][k] = v;
  }
}

export const ICONS = window.WIXA.ICONS;
export { SOCIAL } from "../social-icons.js";
export const STORY_ART = [
  // stacked documents
  '<svg viewBox="0 0 300 220"><path d="M60 150l90 45 90-45-90-45z" class="fillp acc"/><path d="M60 135l90 45 90-45"/><path d="M60 120l90 45 90-45"/><path d="M60 105l90 45 90-45-90-45z"/><path d="M60 105v45M240 105v45M150 150v45"/><path d="M110 82l40-20 40 20" class="acc"/><path d="M95 95l55 27 55-27"/><line x1="205" y1="40" x2="245" y2="80" class="acc"/><line x1="245" y1="40" x2="205" y2="80" class="acc"/></svg>',
  // phone + clock
  '<svg viewBox="0 0 300 220"><rect x="105" y="30" width="90" height="170" rx="16"/><rect x="115" y="48" width="70" height="120" rx="6" class="fillp"/><line x1="140" y1="186" x2="160" y2="186"/><circle cx="150" cy="96" r="24" class="acc"/><polyline points="150,82 150,96 160,104" class="acc"/><rect x="125" y="134" width="50" height="16" rx="8" class="acc"/><path d="M40 70h40M30 100h50M45 130h35" /><path d="M220 70h40M220 100h50M220 130h35"/></svg>',
  // laptop + rocket
  '<svg viewBox="0 0 300 220"><rect x="70" y="50" width="160" height="105" rx="10"/><path d="M45 175h210l-18-20H63z"/><path d="M100 85l-14 14 14 14M200 85l14 14-14 14" class="acc"/><line x1="160" y1="78" x2="140" y2="122" class="acc"/><path d="M150 40c12-14 30-20 44-20 0 14-6 32-20 44l-14 4-14-14z" class="fillp acc"/><circle cx="178" cy="34" r="5" class="acc"/></svg>',
];

// Shared state. Other modules read these live bindings; only the setters below change them.
export let state = { settings: merge(DEFAULTS, {}), projects: [], services: [], partners: [] };
export let lang = "ar";
// the server already chose the language for this visit (saved choice → dashboard setting → device/country)
lang = document.documentElement.lang || "ar";
const urlLang = new URLSearchParams(location.search).get("lang"); // ?lang=en links (used by search engines) always win
if (urlLang === "ar" || urlLang === "en") lang = urlLang;
if (!UI[lang]) lang = "ar";
export let anim = !reducedOS;
export const setState = (s) => { state = s; };
export const setLang = (l) => { if (UI[l]) lang = l; };
export const setAnim = (a) => { anim = a; };

export const C = () => state.settings.content[lang] || state.settings.content.ar;
export const L = (row, f) => row[`${f}_${lang}`] || row[`${f}_ar`] || row[`${f}_en`] || "";
