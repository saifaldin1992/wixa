/* Contact form and job applications: lazy bot protection (Turnstile), open + prefill, submit */
import { $, PREVIEW, UI, esc, state, lang, L } from "./core.js";
import { visitSource } from "./source.js";

// ---------- Turnstile (bot protection), loaded lazily; one widget per form ----------
const widgets = {};
let tsLoading = null;
export function ensureTurnstile(sel = "#turnstile") {
  const key = state.turnstile;
  if (!key || widgets[sel] !== undefined || PREVIEW) return;
  widgets[sel] = null;
  tsLoading ??= new Promise((res) => {
    window.onWixaTurnstile = res;
    const sc = document.createElement("script");
    sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onWixaTurnstile&render=explicit";
    sc.async = true; document.head.appendChild(sc);
  });
  tsLoading.then(() => {
    widgets[sel] = window.turnstile.render(sel, {
      sitekey: key, language: lang, appearance: "interaction-only",
      theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
    });
  });
}
export const turnstileToken = (sel) => { try { return widgets[sel] != null ? window.turnstile.getResponse(widgets[sel]) || "" : ""; } catch { return ""; } };
export const resetTurnstile = (sel) => { try { if (widgets[sel] != null) window.turnstile.reset(widgets[sel]); } catch {} };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phoneOk = (v) => String(v || "").replace(/\D/g, "").length >= 7;

// marks empty / wrong fields; returns the first problem's message or ""
export function check(form, names) {
  const ui = UI[lang];
  let msg = "";
  names.forEach((n) => {
    const f = form.elements[n], v = f.value.trim();
    const bad = n === "email" ? !!v && !EMAIL.test(v) : !v || (n === "phone" && !phoneOk(v)); // email is optional, but must be valid when given
    f.closest(".field").classList.toggle("bad", bad);
    if (bad && !msg) msg = n === "phone" && v ? ui.bad_phone : ui.invalid;
  });
  return msg;
}

// a red field goes back to normal as soon as it is filled in correctly
export function liveCheck(form) {
  form.addEventListener("input", (e) => {
    const f = e.target.closest(".field.bad"); if (!f) return;
    const el = e.target, v = el.value.trim();
    const ok = el.name === "email" ? !v || EMAIL.test(v) : v && (el.name !== "phone" || phoneOk(v));
    if (ok) f.classList.remove("bad");
  });
}

async function send(form, statusEl, sel, body, okText) {
  const ui = UI[lang], btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  statusEl.className = "form__status"; statusEl.textContent = ui.sending;
  try {
    const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, lang, source: visitSource(), website: form.elements.website.value, turnstile: turnstileToken(sel) }) });
    if (!res.ok) throw new Error(res.status);
    form.reset(); statusEl.className = "form__status ok"; statusEl.textContent = okText;
    dispatchEvent(new Event("wixa:lead")); // counted by any analytics switched on in the dashboard
    return true;
  } catch { statusEl.className = "form__status err"; statusEl.textContent = ui.err; return false; }
  finally { btn.disabled = false; resetTurnstile(sel); }
}

export function openContact(message = "") {
  const f = $("#contactForm");
  f.classList.add("open");
  ensureTurnstile();
  if (message) f.elements.message.value = message;
  const target = $("#contact");
  if (window.__lenis) window.__lenis.scrollTo(target, { offset: -80 }); else target.scrollIntoView({ behavior: "smooth" });
  setTimeout(() => { f.elements.name.focus({ preventScroll: true }); window.ScrollTrigger && ScrollTrigger.refresh(); }, 900);
}

// ---------- job application window ----------
export function openJob(index = -1) {
  const ui = UI[lang], m = $("#jmodal"), sel = $("#jobSelect");
  const jobs = (state.settings.careers?.jobs || []).filter((j) => j.open !== false);
  sel.innerHTML = jobs.map((j, i) => `<option value="${esc(L(j, "title"))}" ${i === index ? "selected" : ""}>${esc(L(j, "title"))}</option>`).join("") + `<option value="" ${index < 0 ? "selected" : ""}>${esc(ui.j_general)}</option>`;
  $("#jobStatus").textContent = "";
  m.hidden = false; document.body.style.overflow = "hidden"; window.__lenis?.stop();
  ensureTurnstile("#turnstileJob");
  setTimeout(() => $("#jobForm").elements.name.focus(), 60);
}
function closeJob() { $("#jmodal").hidden = true; document.body.style.overflow = ""; window.__lenis?.start(); }

export function setupContact() {
  $("#openForm").addEventListener("click", () => {
    const f = $("#contactForm"); f.classList.add("open"); ensureTurnstile();
    setTimeout(() => { f.querySelector("input").focus({ preventScroll: true }); window.ScrollTrigger && ScrollTrigger.refresh(); }, 500);
  });

  const form = $("#contactForm"), status = $("#formStatus");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bad = check(form, ["name", "email", "phone", "message"]);
    if (bad) { status.className = "form__status err"; status.textContent = bad; form.querySelector(".field.bad input, .field.bad textarea")?.focus(); return; }
    if (PREVIEW) { status.className = "form__status ok"; status.textContent = UI[lang].ok; return; }
    const svc = form.elements.service.value;
    const ok = await send(form, status, "#turnstile", { name: form.elements.name.value, email: form.elements.email.value, phone: form.elements.phone.value,
      message: form.elements.message.value, services: svc ? [svc] : [], marketing: !!form.elements.marketing?.checked }, UI[lang].ok);
    if (ok) { status.textContent = ""; $(".form__inner", form).hidden = true; $("#formDone").hidden = false; }
  });
  liveCheck(form);
  $("#formAgain").addEventListener("click", () => { $("#formDone").hidden = true; $(".form__inner", form).hidden = false; form.elements.name.focus(); });

  // job applications
  $("#careersList").addEventListener("click", (e) => { const b = e.target.closest("[data-job]"); if (b) openJob(+b.dataset.job); });
  const jm = $("#jmodal");
  jm.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeJob(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !jm.hidden) closeJob(); });
  const jf = $("#jobForm"), js = $("#jobStatus");
  jf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bad = check(jf, ["name", "email", "phone", "message"]);
    if (bad) { js.className = "form__status err"; js.textContent = bad; jf.querySelector(".field.bad input, .field.bad textarea")?.focus(); return; }
    if (PREVIEW) { js.className = "form__status ok"; js.textContent = UI[lang].j_ok; return; }
    const ok = await send(jf, js, "#turnstileJob", { kind: "job", job: jf.elements.job.value, cv: jf.elements.cv.value, name: jf.elements.name.value,
      email: jf.elements.email.value, phone: jf.elements.phone.value, message: jf.elements.message.value }, UI[lang].j_ok);
    if (ok) setTimeout(closeJob, 2600);
  });
  liveCheck(jf);
}
