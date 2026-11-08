/* "Track your order" (/track): the order number from the confirmation + the phone it was placed with → where the
   order stands, as steps. The number can come in the link (/track?n=WX-…) so the confirmation can link straight here. */
import { $, esc, lang, state } from "./core.js";
import { statusMsg, lookupOrder, normNumber, rememberOrder } from "./orderstatus.js";
import { openChat } from "./chat.js";

const T = {
  ar: {
    title: "تتبع طلبك", sub: "اكتب رقم طلبك ورقم الهاتف الذي طلبت به لترى أين وصل طلبك.",
    number: "رقم الطلب", phone: "رقم الهاتف", go: "تتبع", busy: "جارٍ البحث…",
    fix: "اكتب رقم الطلب كما وصلك ورقم هاتف صحيح.", nf: "لم نجد طلباً بهذا الرقم والهاتف. تأكد منهما وحاول مرة أخرى.",
    err: "تعذّر البحث الآن، حاول بعد قليل.", many: "محاولات كثيرة، انتظر دقيقة وحاول مرة أخرى.",
    order: "طلب رقم", on: "أُرسل في", upd: "آخر تحديث",
    steps: [["new", "وصلنا طلبك"], ["contacted", "تواصلنا معك"], ["quoted", "أرسلنا عرض السعر"], ["in_progress", "العمل جارٍ على مشروعك"], ["done", "تم التسليم"]],
    help: "لديك سؤال عن طلبك؟", wa: "راسلنا على واتساب", chat: "تحدث معنا في الدردشة المباشرة",
  },
  en: {
    title: "Track your order", sub: "Enter your order number and the phone you ordered with to see where your order stands.",
    number: "Order number", phone: "Phone number", go: "Track", busy: "Searching…",
    fix: "Enter the order number as you received it and a valid phone number.", nf: "No order found with this number and phone. Check them and try again.",
    err: "Couldn't search right now, please try again shortly.", many: "Too many tries — wait a minute and try again.",
    order: "Order", on: "Placed on", upd: "Last update",
    steps: [["new", "Order received"], ["contacted", "We contacted you"], ["quoted", "Quote sent"], ["in_progress", "Work in progress"], ["done", "Delivered"]],
    help: "A question about your order?", wa: "Message us on WhatsApp", chat: "Talk to us in live chat",
  },
};
const t = (k) => (T[lang] || T.ar)[k];
const day = (d) => { try { return new Date(d).toLocaleDateString(lang === "en" ? "en-GB" : "ar-IQ-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; } };
let last = null;

function result(o) {
  const steps = t("steps"), at = Math.max(0, steps.findIndex(([k]) => k === o.status));
  const wa = String(state.settings?.contact?.whatsapp || "").replace(/\D/g, "");
  return `<div class="track__res" role="status">
    <h2>${t("order")} <bdi>${esc(o.number)}</bdi></h2>
    <p class="track__meta">${esc(o.item || "")}${o.item ? " · " : ""}${t("on")} ${day(o.created_at)}${o.updated_at && o.updated_at !== o.created_at ? ` · ${t("upd")} ${day(o.updated_at)}` : ""}</p>
    <p class="track__say">${esc(statusMsg(o.status))}</p>
    ${o.status === "cancelled" ? "" : `<ol class="track__steps">${steps.map(([, l], i) => `<li class="${i < at || o.status === "done" ? "done" : i === at ? "now" : ""}">${l}</li>`).join("")}</ol>`}
    <p class="track__help">${t("help")} ${state.settings?.chat?.on ? `<button type="button" class="track__chat" data-chat="${esc(o.number)}">${t("chat")}</button>` : wa ? `<a href="https://wa.me/${wa}?text=${encodeURIComponent(`${t("order")} ${o.number}`)}" target="_blank" rel="noopener">${t("wa")}</a>` : `<a href="/contact">${t("wa")}</a>`}</p>
  </div>`;
}

function paint() {
  const box = $("#trackApp");
  if (!box) return;
  const n = new URLSearchParams(location.search).get("n") || "";
  box.innerHTML = `<h1>${t("title")}</h1><p>${t("sub")}</p>
    <form class="track__form" id="trackForm" novalidate>
      <label>${t("number")}<input name="number" required autocomplete="off" placeholder="WX-261107-XXXX" value="${esc(n)}"></label>
      <label>${t("phone")}<input name="phone" type="tel" inputmode="tel" required autocomplete="tel" dir="ltr"></label>
      <p class="track__msg" id="trackMsg"></p>
      <button type="submit">${t("go")}</button>
    </form><div id="trackOut">${last ? result(last) : ""}</div>`;
  $("#trackForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, btn = f.querySelector("button"), msg = $("#trackMsg");
    const number = normNumber(f.number.value), phone = f.phone.value.trim();
    msg.textContent = "";
    if (number.length < 6 || phone.replace(/\D/g, "").length < 7) { msg.textContent = t("fix"); return; }
    btn.disabled = true; btn.textContent = t("busy");
    try {
      const r = await lookupOrder(number, phone);
      if (r.order) { last = r.order; rememberOrder(r.order.number, phone); $("#trackOut").innerHTML = result(r.order); }
      else { $("#trackOut").innerHTML = ""; msg.textContent = r.error === "not_found" ? t("nf") : r.error === "rate_limited" ? t("many") : r.error === "validation" ? t("fix") : t("err"); }
    } catch { msg.textContent = t("err"); }
    btn.disabled = false; btn.textContent = t("go");
  });
}

export function setupTrack() {
  if (document.documentElement.dataset.page !== "track") return;
  paint();
  // "talk to us" opens the live chat already on this order
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-chat]"); if (b) openChat("track", b.dataset.chat); });
}
export const repaintTrack = () => { if (document.documentElement.dataset.page === "track") paint(); };
