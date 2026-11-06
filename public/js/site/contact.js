/* Contact form: lazy bot protection (Turnstile), open + prefill, submit */
import { $, PREVIEW, UI, state, lang } from "./core.js";

// ---------- Turnstile (bot protection), loaded lazily ----------
let tsWidget = null, tsLoading = null;
function ensureTurnstile() {
  const key = state.turnstile;
  if (!key || tsWidget !== null || PREVIEW) return;
  tsLoading ??= new Promise((res) => {
    window.onWixaTurnstile = res;
    const sc = document.createElement("script");
    sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onWixaTurnstile&render=explicit";
    sc.async = true; document.head.appendChild(sc);
  });
  tsLoading.then(() => {
    if (tsWidget !== null) return;
    tsWidget = window.turnstile.render("#turnstile", {
      sitekey: key, language: lang, appearance: "interaction-only",
      theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
    });
  });
}
const turnstileToken = () => { try { return tsWidget !== null ? window.turnstile.getResponse(tsWidget) || "" : ""; } catch { return ""; } };
const resetTurnstile = () => { try { if (tsWidget !== null) window.turnstile.reset(tsWidget); } catch {} };

export function openContact(message = "") {
  const f = $("#contactForm");
  f.classList.add("open");
  ensureTurnstile();
  if (message) f.elements.message.value = message;
  const target = $("#contact");
  if (window.__lenis) window.__lenis.scrollTo(target, { offset: -80 }); else target.scrollIntoView({ behavior: "smooth" });
  setTimeout(() => { f.elements.name.focus({ preventScroll: true }); window.ScrollTrigger && ScrollTrigger.refresh(); }, 900);
}

export function setupContact() {
  $("#openForm").addEventListener("click", () => {
    const f = $("#contactForm"); f.classList.add("open"); ensureTurnstile();
    setTimeout(() => { f.querySelector("input").focus({ preventScroll: true }); window.ScrollTrigger && ScrollTrigger.refresh(); }, 500);
  });

  // form
  const form = $("#contactForm"), status = $("#formStatus");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ui = UI[lang];
    let ok = true;
    ["name", "email", "message"].forEach((n) => {
      const f = form.elements[n]; const bad = !f.value.trim() || (n === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value));
      f.closest(".field").classList.toggle("bad", bad); if (bad) ok = false;
    });
    if (!ok) { status.className = "form__status err"; status.textContent = ui.invalid; return; }
    if (PREVIEW) { status.className = "form__status ok"; status.textContent = ui.ok; return; }
    const btnS = form.querySelector("[type=submit]"); btnS.disabled = true;
    status.className = "form__status"; status.textContent = ui.sending;
    try {
      const svc = form.elements.service.value;
      const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        name: form.elements.name.value, email: form.elements.email.value, phone: form.elements.phone.value,
        message: form.elements.message.value, services: svc ? [svc] : [], lang, website: form.elements.website.value, turnstile: turnstileToken() }) });
      if (!res.ok) throw new Error(res.status);
      form.reset(); status.className = "form__status ok"; status.textContent = ui.ok;
      dispatchEvent(new Event("wixa:lead")); // counted by any analytics switched on in the dashboard
    } catch { status.className = "form__status err"; status.textContent = ui.err; }
    finally { btnS.disabled = false; resetTurnstile(); }
  });
}
