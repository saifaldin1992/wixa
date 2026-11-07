/* The one order page (/order), like checking out in an online shop: whatever the visitor picked anywhere on the
   site (a package, a solution for their field, the estimator, "a project like this one", a service) arrives here
   already chosen. They see a short summary with the price guide, the gifts and the discount, then give a name and
   a phone number (email optional) and send. With nothing picked yet, the page opens on the packages. */
import { $, $$, esc, state, lang, C, L } from "./core.js";
import { ensureTurnstile, turnstileToken, resetTurnstile, check, liveCheck } from "./contact.js";
import { visitSource } from "./source.js";

const KEY = "wixa-order";
const T = {
  ar: {
    pickT: "اختر ما يناسبك", pickS: "اختر باقة لتبدأ — لا دفع الآن، ونحدد التفاصيل معك.", custom: "مشروع خاص", customD: "لست متأكداً أو تحتاج شيئاً مختلفاً؟ نحدد معك الأنسب.", customP: "حسب الطلب",
    pick: "اختر", yours: "طلبك", change: "تغيير", from: "يبدأ من", included: "مع طلبك",
    src: { package: "باقة", field: "حل لمجالك", calc: "تقدير الحاسبة", similar: "مشروع مشابه لـ", service: "خدمة", start: "مشروع" },
    formT: "بياناتك", name: "الاسم", phone: "رقم الهاتف أو واتساب", email: "البريد الإلكتروني (اختياري)", note: "ملاحظة (اختياري)", notePh: "أي تفاصيل تساعدنا: فكرتك، موقع حالي، موعد مناسب للاتصال…",
    marketing: "أرغب باستلام العروض والأخبار من ويكسا", send: "أرسل الطلب", sending: "جارٍ الإرسال…",
    trust: ["لا دفع الآن", "نتصل بك خلال يوم عمل", "الدفع 75% عند البدء و25% بعد التسليم"],
    err: "تعذّر الإرسال، حاول مرة أخرى أو راسلنا على واتساب.", fix: "يرجى كتابة الاسم ورقم هاتف صحيح.",
    done: "وصلنا طلبك", doneNo: "رقم طلبك", copy: "نسخ الرقم", copied: "نُسخ ✓", tap: "اضغط لكشف الهدية", free: "مجاناً", saved: "محفوظ لك",
    won: "🎉 مبروك! هداياك محفوظة مع رقم طلبك", next: "سنتصل بك خلال يوم عمل لنتفق على التفاصيل.", mailed: "وأرسلنا نسخة إلى بريدك.", wa: "تابع طلبك على واتساب", home: "العودة إلى الرئيسية",
    disc: (v) => `خصم ${v}`, discText: (d) => `على السعر النهائي${d ? ` — صالح ${d} يوماً` : ""}`,
  },
  en: {
    pickT: "Pick what suits you", pickS: "Choose a package to start — nothing to pay now; we'll settle the details with you.", custom: "Custom project", customD: "Not sure, or need something different? We'll find the right fit together.", customP: "On request",
    pick: "Choose", yours: "Your order", change: "Change", from: "From", included: "With your order",
    src: { package: "Package", field: "Solution for your field", calc: "Estimator result", similar: "A project like", service: "Service", start: "Project" },
    formT: "Your details", name: "Name", phone: "Phone or WhatsApp", email: "Email (optional)", note: "Note (optional)", notePh: "Anything that helps: your idea, a current site, a good time to call…",
    marketing: "Send me offers and news from WIXA", send: "Send order", sending: "Sending…",
    trust: ["Nothing to pay now", "We call you within one working day", "Pay 75% at start, 25% after delivery"],
    err: "Couldn't send. Please try again or message us on WhatsApp.", fix: "Please enter your name and a valid phone number.",
    done: "Order received", doneNo: "Your order number", copy: "Copy number", copied: "Copied ✓", tap: "Tap to reveal", free: "Free", saved: "Saved for you",
    won: "🎉 Your gifts are saved with your order number", next: "We'll call you within one working day to agree the details.", mailed: "We've emailed you a copy.", wa: "Follow up on WhatsApp", home: "Back to home",
    disc: (v) => `${v} off`, discText: (d) => `the final price${d ? ` — valid ${d} days` : ""}`,
  },
};
const t = (k) => (T[lang] || T.ar)[k];

// ---------- from anywhere on the site: remember the choice and open the order page ----------
export function goOrder(sel = null) {
  try { sel ? sessionStorage.setItem(KEY, JSON.stringify(sel)) : sessionStorage.removeItem(KEY); } catch {}
  if (document.documentElement.dataset.page === "order") { paint(); scrollTo({ top: 0, behavior: "smooth" }); return; }
  location.href = `/order${lang === "en" ? "?lang=en" : ""}`;
}

function rewards() {
  const o = state.settings.request_offer || {}, out = [];
  if (o.gifts_on !== false) for (const g of o.gifts || []) { const h = L(g, "title"); if (h) out.push({ tag: t("free"), h, p: L(g, "text") }); }
  const d = o.discount || {};
  if (d.on && Number(d.value) > 0) {
    const v = d.type === "amount" ? `${Number(d.value).toLocaleString("en-US")}$` : `${Number(d.value)}%`;
    out.push({ tag: t("saved"), h: t("disc")(v), p: L(d, "text") || t("discText")(Number(d.valid_days) || 0) });
  }
  return out;
}
const packages = () => (C().packages || []).filter((x) => x.name);

// the choice: from this visit, or from a link (/order?pkg=…, ?project=…, ?svc=…, ?field=…)
function selection() {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (s && s.item) return s; } catch {}
  const q = new URLSearchParams(location.search);
  if (q.get("pkg")) { const p = packages().find((x) => x.name === q.get("pkg")) || packages()[+q.get("pkg")]; if (p) return pkgSel(p); }
  if (q.get("project")) { const p = (state.projects || []).find((x) => x.slug === q.get("project")); if (p) return { source: "similar", item: L(p, "title") }; }
  if (q.get("svc")) { const s = (state.services || []).find((x) => x.slug === q.get("svc")); if (s) return { source: "service", item: L(s, "title") }; }
  if (q.get("field")) return { source: "field", item: q.get("field").slice(0, 120) };
  return null;
}
export const pkgSel = (p) => ({ source: "package", item: p.name, price: p.price ? `${p.from ? `${t("from")} ` : ""}${p.price}` : "", features: String(p.features || "").split("\n").map((f) => f.trim()).filter(Boolean) });

function paint() {
  const root = $("#orderApp"); if (!root) return;
  const sel = selection();
  if (!sel) return paintPick(root);
  const rw = rewards();
  let me = {}; try { me = JSON.parse(localStorage.getItem("wixa-chat-me") || "{}"); } catch {}
  root.innerHTML = `<div class="ord">
    <aside class="ord__sum">
      <div class="ord__sumHead"><span class="muted">${t("yours")}</span><button type="button" class="ord__change" data-change>${t("change")}</button></div>
      <span class="ord__src">${esc(t("src")[sel.source] || t("src").start)}</span>
      <h2 class="ord__item">${esc(sel.item)}</h2>
      ${sel.price ? `<p class="ord__price" dir="auto">${esc(sel.price)}</p>` : ""}
      ${(sel.features || []).length ? `<ul class="ord__feats">${sel.features.slice(0, 8).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
      ${sel.timeline ? `<p class="muted">${esc(sel.timeline)}</p>` : ""}
      ${rw.length ? `<div class="ord__gifts"><b>🎁 ${t("included")}</b>${rw.map((g) => `<span>✓ ${esc(g.h)}</span>`).join("")}</div>` : ""}
    </aside>
    <form class="ord__form" id="orderForm" novalidate>
      <h2>${t("formT")}</h2>
      <label class="field"><span>${t("name")} <em>*</em></span><input name="name" required maxlength="120" autocomplete="name" value="${esc(me.name || "")}"></label>
      <label class="field"><span>${t("phone")} <em>*</em></span><input name="phone" type="tel" inputmode="tel" required maxlength="40" autocomplete="tel" dir="ltr" placeholder="07XX XXX XXXX" value="${esc(me.phone || "")}"></label>
      <label class="field"><span>${t("email")}</span><input name="email" type="email" maxlength="200" autocomplete="email" dir="ltr"></label>
      <label class="field"><span>${t("note")}</span><textarea name="note" rows="3" maxlength="3000" placeholder="${esc(t("notePh"))}"></textarea></label>
      <label class="consent"><input type="checkbox" name="marketing"><span>${t("marketing")}</span></label>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div id="turnstileOrder" class="turnstile"></div>
      <button type="submit" class="btn btn--primary ord__send">${t("send")}</button>
      <p class="ord__err" role="alert"></p>
      <ul class="ord__trust">${t("trust").map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    </form></div>`;
  const form = $("#orderForm");
  liveCheck(form); ensureTurnstile("#turnstileOrder");
  $("[data-change]", root).onclick = () => { try { sessionStorage.removeItem(KEY); } catch {} history.replaceState(null, "", location.pathname + (lang === "en" ? "?lang=en" : "")); paint(); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (check(form, ["name", "phone", "email"])) { $(".ord__err", root).textContent = t("fix"); return; }
    const btn = $(".ord__send", root), f = form.elements;
    btn.disabled = true; btn.textContent = t("sending"); $(".ord__err", root).textContent = "";
    try {
      const res = await fetch("/api/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        source: sel.source, item: sel.item, price: sel.price || "", details: { features: sel.features || [], timeline: sel.timeline || "" },
        name: f.name.value, phone: f.phone.value, email: f.email.value, note: f.note.value, marketing: f.marketing.checked,
        lang, visit: visitSource(), website: f.website.value, turnstile: turnstileToken("#turnstileOrder"),
      }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status);
      dispatchEvent(new Event("wixa:lead"));
      try { localStorage.setItem("wixa-chat-me", JSON.stringify({ ...me, name: f.name.value.trim(), phone: f.phone.value.trim() })); sessionStorage.removeItem(KEY); } catch {}
      paintDone(root, d.number || "", !!f.email.value.trim(), rw);
    } catch { $(".ord__err", root).textContent = t("err"); btn.disabled = false; btn.textContent = t("send"); resetTurnstile("#turnstileOrder"); }
  };
}

function paintPick(root) {
  const pk = packages();
  root.innerHTML = `<div class="ord__pick"><h2>${t("pickT")}</h2><p class="muted">${t("pickS")}</p>
    <div class="ord__pkgs">${pk.map((p, i) => `<button type="button" class="ord__pkg${p.featured ? " is-featured" : ""}" data-p="${i}">
      <b>${esc(p.name)}</b><small>${esc(p.desc || "")}</small><span>${p.from && /\d/.test(p.price || "") ? `<i>${t("from")}</i> ` : ""}<bdi dir="ltr">${esc(p.price || "")}</bdi></span></button>`).join("")}
      ${pk.some((p) => !/\d/.test(p.price || "")) ? "" : `<button type="button" class="ord__pkg ord__pkg--custom" data-p="custom"><b>${t("custom")}</b><small>${t("customD")}</small><span>${t("customP")}</span></button>`}</div></div>`;
  $(".ord__pkgs", root).onclick = (e) => {
    const b = e.target.closest("[data-p]"); if (!b) return;
    const sel = b.dataset.p === "custom" ? { source: "start", item: t("custom"), price: t("customP") } : pkgSel(pk[+b.dataset.p]);
    try { sessionStorage.setItem(KEY, JSON.stringify(sel)); } catch {}
    paint(); scrollTo({ top: 0, behavior: "smooth" });
  };
}

function paintDone(root, no, mailed, rw) {
  const wa = (state.settings.contact?.whatsapp || "").replace(/\D/g, "");
  root.innerHTML = `<div class="ord__done">
    <div class="ord__ok" aria-hidden="true">✓</div><h2>${t("done")}</h2>
    ${no ? `<div class="rq__ticket"><span class="muted">${t("doneNo")}</span><div class="rq__no" dir="ltr">${esc(no)}</div><button type="button" class="btn btn--ghost rq__copy">${t("copy")}</button></div>` : ""}
    <p class="rq__hint">${t("next")} ${mailed ? t("mailed") : ""}</p>
    ${rw.length ? `<p class="rq__hint">${t("tap")}</p><div class="rq__gifts${rw.length === 3 ? " rq__gifts--3" : ""}">${rw.map(({ tag, h, p }) => `<button type="button" class="gcard" aria-label="${t("tap")}">
      <span class="gcard__in"><span class="gcard__front"><span class="gcard__box" aria-hidden="true">🎁</span><small>${t("tap")}</small></span>
      <span class="gcard__back"><span class="gcard__tag">${esc(tag)}</span><b>${esc(h)}</b><small>${esc(p)}</small></span></span></button>`).join("")}</div>
      <div class="rq__won" hidden><p class="rq__wonT">${t("won")}</p></div>` : ""}
    <div class="rq__nav">${wa ? `<a class="btn btn--wa" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent((lang === "ar" ? "مرحباً، بخصوص طلبي رقم " : "Hello, about my order ") + no)}">${t("wa")}</a>` : ""}<a class="btn btn--ghost" href="/${lang === "en" ? "?lang=en" : ""}">${t("home")}</a></div></div>`;
  const reveal = (c) => { if (c.classList.contains("open")) return; c.classList.add("open"); c.setAttribute("aria-label", $(".gcard__back b", c).textContent); if (!$(".gcard:not(.open)", root)) $(".rq__won", root).hidden = false; };
  $$(".gcard", root).forEach((c) => (c.onclick = () => reveal(c)));
  setTimeout(() => $$(".gcard:not(.open)", root).forEach((c, i) => setTimeout(() => reveal(c), i * 450)), 4000);
  $(".rq__copy", root)?.addEventListener("click", async (e) => { try { await navigator.clipboard.writeText(no); e.target.textContent = t("copied"); } catch {} });
  scrollTo({ top: 0, behavior: "smooth" });
}

export function setupOrder() {
  // every "start your project" button opens the order page (packages first)
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-start], .nav-cta");
    if (!a) return;
    e.preventDefault(); goOrder(null);
  });
  if (document.documentElement.dataset.page === "order") paint();
}
export const repaintOrder = () => { if (document.documentElement.dataset.page === "order") paint(); };
