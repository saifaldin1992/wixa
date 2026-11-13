/* Appointment booking, printable quote (PDF) and anonymous counts of visitor actions */
import { $, $$, PREVIEW, UI, esc, lang, state } from "./core.js";
import { visitSource } from "./source.js";
import { ensureTurnstile, turnstileToken, resetTurnstile, check, liveCheck } from "./contact.js";

// ---------- visitor actions: counted once per visit, sent in one small request when the page is left ----------
const seen = new Set();
export function track(e) { if (!PREVIEW) seen.add(e); }
function sendEvents() {
  if (!seen.size) return;
  const body = JSON.stringify({ e: [...seen] });
  seen.clear();
  try { navigator.sendBeacon ? navigator.sendBeacon("/api/event", new Blob([body], { type: "text/plain" })) : fetch("/api/event", { method: "POST", body, keepalive: true }); } catch {}
}
export function setupTracking() {
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sendEvents(); });
  addEventListener("pagehide", sendEvents);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href*='wa.me/']");
    if (a) track(a.id === "calcWa" ? "calc_wa" : "wa_click");
    if (e.target.closest(".ctype, .cfeat, #calcSpeed button")) track("calc_used");
    if (e.target.closest("#calcCta")) track("calc_quote");
    if (e.target.closest("#openForm, #mbarContact")) track("form_open");
    if (e.target.closest("[data-job]")) track("job_open");
    if (e.target.closest(".faq__q")) track("faq_open");
    if (e.target.closest("[data-start]")) track("start_click");
    const more = e.target.closest("a[data-more]");
    if (more) track(`more_${more.dataset.more}`);
  });
  addEventListener("wixa:lead", () => track("form_sent"));
}

// ---------- printable quote: the browser's "Save as PDF" keeps Arabic text perfect ----------
export function printQuote(q) {
  const s = state.settings, c = s.contact || {}, ar = lang === "ar";
  const brand = ar ? s.brand.name_ar : s.brand.name_en;
  const date = new Date().toLocaleDateString(ar ? "ar-IQ" : "en-GB", { dateStyle: "long" });
  const row = (k, v) => v ? `<tr><th>${esc(k)}</th><td>${v}</td></tr>` : "";
  $("#quotePrint").innerHTML = `<div class="qp">
    <header class="qp__head"><svg viewBox="0 0 2021 982" aria-hidden="true"><use href="/logo.svg#m" fill="currentColor"/></svg><div><b>${esc(brand)}</b><span>${ar ? "تقدير مبدئي لتكلفة مشروع" : "Preliminary project estimate"}</span></div><time>${esc(date)}</time></header>
    <table class="qp__table">
      ${row(ar ? "نوع المشروع" : "Project type", esc(q.type))}
      ${row(ar ? "الميزات الإضافية" : "Extra features", q.features.length ? `<ul>${q.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : (ar ? "لا يوجد" : "None"))}
      ${row(ar ? "مدة التنفيذ" : "Timeline", esc(q.rush ? (ar ? "مستعجلة" : "Rush") : (ar ? "عادية" : "Standard")))}
    </table>
    <div class="qp__price"><span>${ar ? "التكلفة التقديرية" : "Estimated cost"}</span><b dir="ltr">${esc(q.range)}</b></div>
    <p class="qp__note">${ar ? "هذا تقدير مبدئي فقط، والسعر النهائي يُحدَّد في عرض مكتوب بعد دراسة متطلباتك." : "This is a rough estimate only; the final price is set in a written quote after we review your requirements."}</p>
    <footer class="qp__foot">${[c.phone && `<span dir="ltr">${esc(c.phone)}</span>`, c.email && `<span dir="ltr">${esc(c.email)}</span>`, `<span dir="ltr">${esc(location.host)}</span>`].filter(Boolean).join(" · ")}</footer>
  </div>`;
  track("calc_pdf");
  setTimeout(() => print(), 60);
}

// ---------- appointment booking ----------
let bk = { date: "", time: "" };
const dayLabel = (d) => d.toLocaleDateString(lang === "ar" ? "ar-IQ" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
function bookingDays() {
  const b = state.settings.booking || {};
  const days = Array.isArray(b.days) ? b.days.map(Number) : [0, 1, 2, 3, 4];
  const ahead = Math.min(60, Math.max(1, Number(b.days_ahead) || 14));
  const base = new Date(Date.now() + 3 * 3600e3); // Baghdad date
  const out = [];
  for (let i = 0; i <= ahead; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
    if (days.includes(d.getUTCDay())) out.push(d);
  }
  return out;
}
async function loadSlots(date) {
  const box = $("#bkSlots"), ui = UI[lang];
  box.innerHTML = `<p class="bk__hint">${ui.sending.replace("الإرسال", "التحميل").replace("Sending", "Loading")}</p>`;
  let slots = [];
  try { slots = (await (await fetch(`/api/slots?date=${date}`)).json()).slots || []; } catch {}
  box.innerHTML = slots.length ? slots.map((t) => `<button type="button" class="bk__slot" data-time="${t}" dir="ltr">${t}</button>`).join("") : `<p class="bk__hint">${esc(ui.bk_none)}</p>`;
}
export function openBooking() {
  const m = $("#bkmodal"), ui = UI[lang];
  bk = { date: "", time: "" };
  $("#bkDays").innerHTML = bookingDays().map((d) => { const iso = d.toISOString().slice(0, 10); return `<button type="button" class="bk__day" data-date="${iso}">${esc(dayLabel(d))}</button>`; }).join("") || `<p class="bk__hint">${esc(ui.bk_none)}</p>`;
  $("#bkSlots").innerHTML = `<p class="bk__hint">${esc(ui.bk_pick_day)}</p>`;
  $("#bkStatus").textContent = "";
  m.hidden = false; document.body.style.overflow = "hidden"; window.__lenis?.stop();
  ensureTurnstile("#turnstileBk");
  track("booking_open");
}
function closeBooking() { $("#bkmodal").hidden = true; document.body.style.overflow = ""; window.__lenis?.start(); }

export function setupBooking() {
  const m = $("#bkmodal"); if (!m) return;
  document.addEventListener("click", (e) => { if (e.target.closest("[data-book]")) { e.preventDefault(); openBooking(); } });
  m.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeBooking();
    const d = e.target.closest(".bk__day");
    if (d) { bk = { date: d.dataset.date, time: "" }; $$(".bk__day", m).forEach((x) => x.classList.toggle("on", x === d)); loadSlots(bk.date); }
    const t = e.target.closest(".bk__slot");
    if (t) { bk.time = t.dataset.time; $$(".bk__slot", m).forEach((x) => x.classList.toggle("on", x === t)); $("#bkWhen").classList.remove("bad"); }
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !m.hidden) closeBooking(); });
  const f = $("#bkForm"), st = $("#bkStatus");
  liveCheck(f);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ui = UI[lang];
    let bad = check(f, ["name", "email", "phone"]);
    $("#bkWhen").classList.toggle("bad", !bk.time);
    if (!bk.time && !bad) bad = ui.bk_pick_time;
    if (bad) { st.className = "form__status err"; st.textContent = bad; return; }
    if (PREVIEW) return;
    const btn = f.querySelector("[type=submit]"); btn.disabled = true; st.className = "form__status"; st.textContent = ui.sending;
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        kind: "booking", date: bk.date, time: bk.time, name: f.elements.name.value, email: f.elements.email.value, phone: f.elements.phone.value,
        message: f.elements.message.value, lang, source: visitSource(), website: f.elements.website.value, turnstile: turnstileToken("#turnstileBk") }) });
      if (res.status === 409) { st.className = "form__status err"; st.textContent = ui.bk_taken; loadSlots(bk.date); bk.time = ""; return; }
      if (!res.ok) throw new Error(res.status);
      f.reset(); st.className = "form__status ok"; st.textContent = `${ui.bk_ok} ${bk.date} · ${bk.time}`;
      track("booking_sent"); dispatchEvent(new Event("wixa:lead"));
      setTimeout(closeBooking, 3200);
    } catch { st.className = "form__status err"; st.textContent = ui.err; }
    finally { btn.disabled = false; resetTurnstile("#turnstileBk"); }
  });
}
