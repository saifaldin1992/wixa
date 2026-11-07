/* Sales helpers on the site, all switched on and edited in the dashboard (المبيعات ← العروض والحملات):
   • a promotion bar at the top of the page, with an optional end date;
   • after using the cost calculator without sending a request, one friendly offer to send the estimate on WhatsApp. */
import { $, PREVIEW, esc, lang, state } from "./core.js";
import { calcTouched, estimateText } from "./calculator.js";
import { visitSource } from "./source.js";

const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };

export function setupPromo() {
  const p = state.settings.promo || {};
  const text = (p[`text_${lang}`] || p.text_ar || "").trim();
  if (!p.on || !text || $(".promo")) return;
  if (p.until && new Date(`${p.until}T23:59:59+03:00`) < new Date()) return; // the offer has ended
  const id = `wixa-promo-${text.length}-${p.until || ""}`;
  if (store.get(id)) return;
  const bar = document.createElement("div");
  bar.className = "promo";
  const link = /^(https?:\/\/|#|\/)/.test(p.link || "") ? p.link : "";
  bar.innerHTML = `${link ? `<a href="${esc(link)}">` : "<span>"}${esc(text)}${link ? ` <b>${lang === "ar" ? "← اعرف أكثر" : "Learn more →"}</b></a>` : "</span>"}<button type="button" aria-label="${lang === "ar" ? "إغلاق" : "Close"}">✕</button>`;
  document.body.prepend(bar);
  document.documentElement.classList.add("has-promo");
  $("button", bar).onclick = () => { bar.remove(); document.documentElement.classList.remove("has-promo"); store.set(id, "1"); };
}

export function setupExitOffer() {
  if (PREVIEW || state.settings.exit_offer?.on === false || !$("#calcTypes")) return;
  let shown = !!store.get("wixa-exit"), lead = false;
  addEventListener("wixa:lead", () => (lead = true));
  const show = () => {
    if (shown || lead || !calcTouched || !estimateText() || $(".pmodal:not([hidden])") || document.documentElement.classList.contains("chat-open")) return;
    shown = true; store.set("wixa-exit", "1");
    const ar = lang === "ar";
    const box = document.createElement("div");
    box.className = "exitm";
    box.innerHTML = `<div class="exitm__scrim" data-x></div><form class="exitm__box" novalidate>
      <button type="button" class="exitm__x" data-x aria-label="${ar ? "إغلاق" : "Close"}">✕</button>
      <h3>${ar ? "نرسل لك التقدير على واتساب؟ 📩" : "Shall we send you the estimate on WhatsApp? 📩"}</h3>
      <p>${ar ? "اكتب اسمك ورقمك، ويرسل لك أحد فريقنا التقدير مع إجابات أسئلتك — بدون أي التزام." : "Leave your name and number and one of our team will send it to you with answers to your questions — no obligation."}</p>
      <label><span>${ar ? "الاسم" : "Name"} <em>*</em></span><input name="name" required maxlength="80" autocomplete="name"></label>
      <label><span>${ar ? "رقم الواتساب" : "WhatsApp number"} <em>*</em></span><input name="phone" required type="tel" inputmode="tel" maxlength="30" autocomplete="tel" dir="ltr"></label>
      <button type="submit" class="btn btn--primary">${ar ? "أرسلوه لي" : "Send it to me"}</button><p class="exitm__msg" role="status"></p></form>`;
    document.body.appendChild(box);
    const close = () => box.remove();
    box.querySelectorAll("[data-x]").forEach((x) => (x.onclick = close));
    $("form", box).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, name = f.name.value.trim(), phone = f.phone.value.trim();
      f.name.classList.toggle("bad", !name); f.phone.classList.toggle("bad", !/^\+?[\d\s()-]{6,30}$/.test(phone));
      if (!name || !/^\+?[\d\s()-]{6,30}$/.test(phone)) return;
      f.querySelector("[type=submit]").disabled = true;
      try {
        const r = await fetch("/api/chat/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, phone, topic: ar ? "تقدير الحاسبة" : "Calculator estimate",
          body: `${estimateText()}\n— ${ar ? "أرجو إرسال التقدير على واتساب" : "Please send me this estimate on WhatsApp"}`, source: visitSource(), page: location.pathname }) });
        if (!r.ok) throw new Error(r.status);
        const d = await r.json();
        try { localStorage.setItem("wixa-chat", JSON.stringify({ id: d.id, key: d.key })); } catch {}
        dispatchEvent(new Event("wixa:lead"));
        $(".exitm__box", box).innerHTML = `<h3>${ar ? "تم ✓" : "Done ✓"}</h3><p>${ar ? "وصلنا طلبك، وسنرسل لك التقدير على واتساب قريباً." : "Got it — we'll send the estimate to your WhatsApp shortly."}</p><button type="button" class="btn btn--ghost" data-x>${ar ? "إغلاق" : "Close"}</button>`;
        box.querySelector(".exitm__box [data-x]").onclick = close;
      } catch { f.querySelector("[type=submit]").disabled = false; $(".exitm__msg", box).textContent = ar ? "تعذّر الإرسال، حاول مرة أخرى" : "Couldn't send, please try again"; }
    };
  };
  // computer: the pointer leaves through the top of the window · phone/tablet: a while after using the calculator
  document.addEventListener("mouseout", (e) => { if (!e.relatedTarget && e.clientY <= 0) show(); });
  let timer = 0;
  $("#calcTypes")?.closest("section")?.addEventListener("click", () => { clearTimeout(timer); if (matchMedia("(pointer: coarse)").matches) timer = setTimeout(show, 45000); });
}
