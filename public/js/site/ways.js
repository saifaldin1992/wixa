/* The contact page (/contact): every way to reach WIXA, each opening its own channel —
   the live chat, WhatsApp, a phone call, email, the project form, an appointment, and social accounts. */
import { $, $$, SOCIAL, UI, esc, lang, state } from "./core.js";
import { openContact } from "./contact.js";
import { openChat } from "./chat.js";

const I = {
  chat: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1121 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>',
  wa: '<svg viewBox="0 0 32 32"><path d="M16 3a13 13 0 00-11.2 19.6L3 29l6.6-1.7A13 13 0 1016 3zm0 23.6a10.6 10.6 0 01-5.4-1.5l-.4-.2-3.9 1 1-3.8-.2-.4A10.6 10.6 0 1116 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.7 8.7 0 01-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 00-.9.4 3.7 3.7 0 00-1.2 2.8 6.5 6.5 0 001.4 3.4 14.8 14.8 0 005.7 5c2.1.9 2.9 1 4 .8a3.4 3.4 0 002.2-1.6 2.8 2.8 0 00.2-1.6c-.1-.1-.3-.2-.6-.4z"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><path d="M3 5h18v14H3z"/><path d="M3 6l9 7 9-7"/></svg>',
  form: '<svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
};
const T = {
  ar: { chat: ["محادثة فورية", "تحدث مع فريقنا الآن مباشرة من الموقع"], wa: ["واتساب", "راسلنا وسنرد عليك هناك"], phone: ["اتصال هاتفي", "تحدث معنا مباشرة"], mail: ["البريد الإلكتروني", "للعروض والتفاصيل المكتوبة"],
    form: ["اطلب مشروعك", "اكتب لنا تفاصيل مشروعك وسنعود إليك بعرض"], cal: ["احجز موعداً", "اختر يوماً ووقتاً يناسبك لاجتماع"], pin: ["العنوان", ""] },
  en: { chat: ["Live chat", "Talk to our team right now on the site"], wa: ["WhatsApp", "Message us and we'll reply there"], phone: ["Call us", "Talk to us directly"], mail: ["Email", "For quotes and written details"],
    form: ["Request a project", "Tell us about your project and we'll come back with a quote"], cal: ["Book a meeting", "Pick a day and time that suits you"], pin: ["Address", ""] },
};

export function renderWays() {
  const grid = $("#waysGrid"); if (!grid) return;
  const s = state.settings, ct = s.contact || {}, t = T[lang] || T.ar;
  const wa = (ct.whatsapp || "").replace(/\D/g, ""), phone = (ct.phone || "").replace(/[^\d+]/g, ""), addr = ct[`address_${lang}`] || ct.address_ar || "";
  const card = (k, attrs, value, cls = "") => `<${attrs.startsWith("href") ? "a" : "button type=\"button\""} class="way ${cls}" ${attrs}>
    <span class="way__ico" aria-hidden="true">${I[k]}</span><div><b>${t[k][0]}</b>${value ? `<span dir="ltr">${esc(value)}</span>` : ""}${t[k][1] ? `<small>${t[k][1]}</small>` : ""}</div></${attrs.startsWith("href") ? "a" : "button"}>`;
  grid.innerHTML = [
    s.chat?.on && card("chat", 'data-way="chat"', ""),
    wa && card("wa", `href="https://wa.me/${wa}" target="_blank" rel="noopener"`, /^964\d{10}$/.test(wa) ? `+964 ${wa.slice(3, 6)} ${wa.slice(6, 9)} ${wa.slice(9)}` : `+${wa}`, "way--wa"),
    phone && card("phone", `href="tel:${phone}"`, ct.phone),
    ct.email && card("mail", `href="mailto:${esc(ct.email)}"`, ct.email),
    card("form", 'data-way="form"', ""),
    s.booking?.on && card("cal", "data-book", ""),
    addr && card("pin", `href="https://www.google.com/maps/search/${encodeURIComponent(addr)}" target="_blank" rel="noopener"`, addr),
  ].filter(Boolean).join("");
  $("#waysSocial").innerHTML = ["instagram", "x", "linkedin", "facebook"].filter((k) => ct[k]).map((k) => {
    const v = ct[k]; const u = /^https?:/.test(v) ? v : { instagram: "https://instagram.com/", x: "https://x.com/", linkedin: "https://linkedin.com/in/", facebook: "https://facebook.com/" }[k] + v.replace(/^@/, "");
    return `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${k}">${SOCIAL[k]}</a>`;
  }).join("");
  if (!grid.dataset.bound) {
    grid.dataset.bound = 1;
    grid.addEventListener("click", (e) => {
      const b = e.target.closest("[data-way]"); if (!b) return;
      if (b.dataset.way === "chat") openChat();
      if (b.dataset.way === "form") openContact();
    });
  }
  // on the contact page the project form is already open
  if (document.documentElement.dataset.page === "contact") $("#contactForm")?.classList.add("open");
}
