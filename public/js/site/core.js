/* Shared helpers, UI strings and the page state */
const { DEFAULTS, merge } = window.WIXA;
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const safeUrl = (u) => { if (!u || typeof u !== "string" || !u.trim()) return ""; try { const x = new URL(u, location.href); return ["http:", "https:", "mailto:", "tel:"].includes(x.protocol) ? x.href : ""; } catch { return ""; } };
export const PREVIEW = new URLSearchParams(location.search).has("preview");
export const reducedOS = matchMedia("(prefers-reduced-motion: reduce)").matches;

export const UI = {
  ar: { nav_home: "الرئيسية", nav_projects: "حلولنا", nav_services: "خدماتنا", nav_partners: "شركاؤنا", nav_contact: "تواصل معنا",
    lang: "English", f_name: "الاسم", f_email: "البريد الإلكتروني", f_phone: "رقم الهاتف (اختياري)", f_service: "الخدمة المطلوبة", f_any: "استشارة عامة",
    f_message: "حدّثنا عن مشروعك", f_send: "إرسال", sending: "جارٍ الإرسال…", ok: "شكراً لك! وصلت رسالتك وسنتواصل معك قريباً.", err: "تعذّر الإرسال، حاول مرة أخرى.", invalid: "يرجى تعبئة الحقول المطلوبة بشكل صحيح.",
    no_projects: "ستُعرض المشاريع هنا قريباً.", step: "٠" },
  en: { nav_home: "Home", nav_projects: "Solutions", nav_services: "Services", nav_partners: "Partners", nav_contact: "Contact",
    lang: "العربية", f_name: "Name", f_email: "Email", f_phone: "Phone (optional)", f_service: "Service", f_any: "General enquiry",
    f_message: "Tell us about your project", f_send: "Send", sending: "Sending…", ok: "Thank you! Your message arrived and we'll be in touch soon.", err: "Couldn't send. Please try again.", invalid: "Please fill in the required fields correctly.",
    no_projects: "Projects will appear here soon.", step: "0" },
};

export const ICONS = window.WIXA.ICONS;
export const SOCIAL = {
  instagram: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.3" cy="6.7" r="1.2"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M17.8 2.5h3.1l-6.8 7.8 8 10.6h-6.3l-4.9-6.4-5.6 6.4H2.2l7.3-8.3L1.8 2.5h6.4l4.4 5.9zm-1.1 16.5h1.7L7.4 4.3H5.6z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9.5h4v11H3zm6.5 0h3.8v1.6h.1a4.2 4.2 0 013.8-2c4 0 4.8 2.6 4.8 6.1v6.3h-4v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9v5.7h-4z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24"><path d="M14 8.5V6.6c0-.9.6-1.1 1-1.1h2.6V1.5h-3.6C10 1.5 9.2 4.4 9.2 6.3v2.2H6.5v4H9.2V22.5H14v-10h3.3l.4-4z"/></svg>',
};
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
try { lang = localStorage.getItem("wixa-lang") || "ar"; } catch {}
if (!UI[lang]) lang = "ar";
export let anim = !reducedOS;
export const setState = (s) => { state = s; };
export const setLang = (l) => { if (UI[l]) lang = l; };
export const setAnim = (a) => { anim = a; };

export const C = () => state.settings.content[lang] || state.settings.content.ar;
export const L = (row, f) => row[`${f}_${lang}`] || row[`${f}_ar`] || row[`${f}_en`] || "";
