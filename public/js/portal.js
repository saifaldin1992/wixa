/* «بوابة العملاء» (/portal): sign in with an order number + its phone, then every order placed with that phone —
   its stage, the updates the team shared (text + link), and a button to talk about it in the live chat.
   The sign-in token (signed by the server, 30 days) stays in this browser only. */
import { load } from "./site/data.js";
import { $, $$, esc, lang, state } from "./site/core.js";
import { setupChat } from "./site/chat.js";
import { STAGES, STAGE_LABEL, statusMsg, lastOrder, normNumber } from "./site/orderstatus.js";

const KEY = "wixa-portal";
const ar = lang !== "en";
const T = ar ? {
  in: "ادخل إلى طلباتك", inSub: "اكتب رقم أي طلب لك ورقم الهاتف الذي طلبت به. سترى كل طلباتك المسجّلة بهذا الرقم.",
  number: "رقم الطلب", phone: "رقم الهاتف", go: "دخول", busy: "جارٍ الدخول…", bad: "لم نجد طلباً بهذا الرقم وهذا الهاتف. تأكد منهما وحاول مجدداً.",
  wait: "محاولات كثيرة، حاول بعد دقيقة.", err: "تعذّر الاتصال، حاول مجدداً.", hi: "أهلاً", out: "خروج", none: "لا توجد طلبات بهذا الرقم بعد.",
  ups: "آخر الأخبار من فريقنا", noUps: "سيظهر هنا كل جديد عن مشروعك.", chat: "تحدث معنا عن هذا الطلب", on: "تاريخ الطلب", open: "فتح الرابط",
  hint: "لا تعرف رقم طلبك؟ ستجده في رسالة التأكيد، أو اسألنا في المحادثة.", order: "طلب جديد",
} : {
  in: "Sign in to your orders", inSub: "Enter the number of any of your orders and the phone you ordered with. You'll see every order placed with that phone.",
  number: "Order number", phone: "Phone", go: "Sign in", busy: "Signing in…", bad: "We couldn't find an order with this number and phone. Check them and try again.",
  wait: "Too many tries — please wait a minute.", err: "Couldn't connect — please try again.", hi: "Hi", out: "Sign out", none: "No orders with this phone yet.",
  ups: "Latest from our team", noUps: "News about your project will appear here.", chat: "Talk to us about this order", on: "Ordered on", open: "Open link",
  hint: "Don't know your order number? It's in your confirmation message — or ask us in the chat.", order: "New order",
};
const day = (d) => new Date(d).toLocaleDateString(ar ? "ar-IQ" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const keep = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { /* private mode */ } };
const post = async (path, body) => { const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, d: await r.json().catch(() => ({})) }; };

function signIn(root, err = "") {
  const lo = lastOrder();
  const fromLink = new URLSearchParams(location.search).get("n") || ""; // the confirmation's link carries the number
  const num = fromLink || lo?.number || "";
  root.innerHTML = `<form class="portal__in" novalidate>
      <h2>${T.in}</h2><p class="muted">${T.inSub}</p>
      <label>${T.number}<input name="number" autocomplete="off" dir="ltr" placeholder="WX-261108-XXXX" value="${esc(num)}" required></label>
      <label>${T.phone}<input name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" value="${esc(lo && lo.number === num ? lo.phone || "" : "")}" required></label>
      <p class="portal__err" ${err ? "" : "hidden"}>${esc(err)}</p>
      <button class="btn btn--primary" type="submit">${T.go}</button>
      <p class="muted portal__hint">${T.hint}</p></form>`;
  const f = $("form", root);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("button", f); btn.disabled = true; btn.textContent = T.busy;
    const { status, d } = await post("/api/portal/login", { number: normNumber(f.number.value) || f.number.value.trim(), phone: f.phone.value.trim() }).catch(() => ({ status: 0, d: {} }));
    if (status === 200 && d.token) { keep({ token: d.token, name: d.name || "" }); return show(root); }
    signIn(root, status === 404 || status === 422 ? T.bad : status === 429 ? T.wait : T.err);
  };
}

async function show(root) {
  const s = saved();
  if (!s?.token) return signIn(root);
  const { status, d } = await post("/api/portal", { token: s.token }).catch(() => ({ status: 0, d: {} }));
  if (status === 401) { keep(null); return signIn(root); }
  if (status !== 200) { root.innerHTML = `<p class="empty">${T.err}</p>`; return; }
  const chat = !!state.settings.chat?.on, lb = STAGE_LABEL[lang] || STAGE_LABEL.ar;
  root.innerHTML = `<div class="portal__top"><b>${T.hi}${s.name ? ` ${esc(s.name)}` : ""} 👋</b><span><a class="btn btn--ghost" href="/order${ar ? "" : "?lang=en"}">${T.order}</a><button type="button" class="btn btn--ghost" data-out>${T.out}</button></span></div>
    ${(d.orders || []).length ? d.orders.map((o) => {
      const at = Math.max(0, STAGES.indexOf(o.status));
      return `<article class="portal__ord">
        <header><div><b dir="ltr">${esc(o.number)}</b>${o.item ? `<span>${esc(o.item)}</span>` : ""}</div><small>${T.on} ${day(o.created_at)}</small></header>
        <p class="portal__say">${esc(statusMsg(o.status))}</p>
        ${o.status === "cancelled" ? "" : `<ol class="track__steps">${STAGES.map((k, i) => `<li class="${i < at || o.status === "done" ? "done" : i === at ? "now" : ""}">${esc(lb[k])}</li>`).join("")}</ol>`}
        <h3>${T.ups}</h3>
        ${(o.updates || []).length ? `<ul class="portal__ups">${o.updates.map((u) => `<li><small>${day(u.at)}</small><p>${esc(u.body)}</p>${/^https?:\/\//.test(u.link || "") ? `<a href="${esc(u.link)}" target="_blank" rel="noopener">${T.open} ↗</a>` : ""}</li>`).join("")}</ul>` : `<p class="muted">${T.noUps}</p>`}
        ${chat ? `<button type="button" class="btn btn--ghost btn--chat" data-open-chat data-topic="track" data-service="${esc(o.number)}">${T.chat}</button>` : ""}
      </article>`;
    }).join("") : `<p class="empty">${T.none}</p>`}`;
  $("[data-out]", root).onclick = () => { keep(null); signIn(root); };
  $$(".portal__ord", root).forEach((a) => a.classList.add("in"));
}

(async () => {
  try { await load(); } catch { /* defaults */ }
  const root = document.getElementById("portal");
  if (root) show(root);
  setupChat();
})();
