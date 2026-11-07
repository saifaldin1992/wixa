/* Live chat with the WIXA team. Shown only when switched on in the dashboard (المحادثات).
   The conversation's id and secret key live in this browser (localStorage), so the visitor can come back to it.
   New replies are fetched every few seconds while the window is open, and rarely while it is closed (for the badge). */
import { $, PREVIEW, esc, lang, state } from "./core.js";

const T = {
  ar: { title: "تحدث مع ويكسا", online: "متصلون الآن", away: "غير متصلين الآن — اترك رسالتك وسنرد هنا أو على هاتفك", name: "الاسم", phone: "رقم الهاتف", msg: "رسالتك",
    start: "ابدأ المحادثة", ph: "اكتب رسالة…", send: "إرسال", wa: "أو راسلنا على واتساب", err: "تعذّر الإرسال، حاول مرة أخرى", fill: "أكمل الحقول المطلوبة",
    open: "فتح الدردشة", close: "إغلاق", you: "أنت", team: "فريق ويكسا", newChat: "محادثة جديدة", busy: "رسائل كثيرة، انتظر قليلاً", sent: "تم الإرسال" },
  en: { title: "Chat with WIXA", online: "Online now", away: "We're away — leave a message and we'll reply here or by phone", name: "Name", phone: "Phone number", msg: "Your message",
    start: "Start chat", ph: "Type a message…", send: "Send", wa: "Or message us on WhatsApp", err: "Couldn't send, please try again", fill: "Please fill the required fields",
    open: "Open chat", close: "Close", you: "You", team: "WIXA team", newChat: "New chat", busy: "Too many messages, please wait", sent: "Sent" },
};
const t = (k) => (T[lang] || T.ar)[k];
const KEY = "wixa-chat";
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1121 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>';

let conv = null, msgs = [], after = 0, online = false, isOpen = false, timer = 0, unread = 0, busy = false;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const save = () => { try { conv ? localStorage.setItem(KEY, JSON.stringify(conv)) : localStorage.removeItem(KEY); } catch {} };
const api = async (path, body) => {
  const r = await fetch(`/api/chat/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "failed"), { status: r.status });
  return d;
};
const time = (s) => new Date(s).toLocaleTimeString(lang === "ar" ? "ar-IQ" : "en-GB", { hour: "numeric", minute: "2-digit" });

export function setupChat() {
  const cfg = state.settings.chat || {};
  if (PREVIEW || !cfg.on || $(".chatw")) return;
  conv = load();
  const root = document.createElement("div");
  root.className = "chatw";
  root.innerHTML = `<button class="chatw__btn" type="button" aria-expanded="false">${ICON}<b class="chatw__badge" hidden></b></button>
    <section class="chatw__box" role="dialog" aria-modal="false" hidden>
      <header class="chatw__head"><span class="chatw__mark"><svg viewBox="0 0 2021 982" aria-hidden="true"><use href="/logo.svg#m"/></svg></span>
        <div><b class="chatw__title"></b><small class="chatw__status"><i></i><span></span></small></div>
        <button class="chatw__x" type="button">✕</button></header>
      <div class="chatw__body" aria-live="polite"></div>
      <div class="chatw__foot"></div>
    </section>`;
  document.body.appendChild(root);
  if (!$("#wa") || $("#wa").hidden) root.classList.add("chatw--low"); // no WhatsApp button below it
  const btn = $(".chatw__btn", root), box = $(".chatw__box", root), body = $(".chatw__body", root), foot = $(".chatw__foot", root);

  const setUnread = (n) => { unread = n; const b = $(".chatw__badge", root); b.hidden = !n || isOpen; b.textContent = n > 9 ? "9+" : n; };
  const head = () => {
    btn.setAttribute("aria-label", t("open")); $(".chatw__x", root).setAttribute("aria-label", t("close"));
    $(".chatw__title", root).textContent = t("title");
    $(".chatw__status", root).classList.toggle("on", online);
    $(".chatw__status span", root).textContent = online ? t("online") : t("away");
  };
  const greeting = () => `<div class="chatw__msg chatw__msg--team"><p>${esc(cfg[`greeting_${lang}`] || cfg.greeting_ar || "")}</p></div>`;
  const paint = () => {
    head();
    body.innerHTML = greeting() + msgs.map((m) => `<div class="chatw__msg chatw__msg--${m.from === "staff" ? "team" : "me"}"><p>${esc(m.body)}</p><small>${m.from === "staff" ? esc(m.staff || t("team")) : t("you")} · ${time(m.at)}</small></div>`).join("");
    body.scrollTop = body.scrollHeight;
  };
  const waHref = () => { const a = $("#wa"); return a && !a.hidden && a.href.includes("wa.me") ? a.href : ""; };
  const footer = () => {
    const wa = waHref();
    if (!conv) {
      foot.innerHTML = `<form class="chatw__start" novalidate>
        <label><span>${t("name")} <em>*</em></span><input name="name" required maxlength="80" autocomplete="name"></label>
        <label><span>${t("phone")} <em>*</em></span><input name="phone" required type="tel" inputmode="tel" maxlength="30" autocomplete="tel" dir="ltr"></label>
        <label><span>${t("msg")} <em>*</em></span><textarea name="body" required rows="2" maxlength="2000"></textarea></label>
        <button class="chatw__go" type="submit">${t("start")}</button><p class="chatw__err" hidden></p>
        ${wa ? `<a class="chatw__wa" href="${wa}" target="_blank" rel="noopener">${t("wa")}</a>` : ""}</form>`;
      $("form", foot).onsubmit = startChat;
    } else {
      foot.innerHTML = `<form class="chatw__send"><textarea name="body" rows="1" maxlength="2000" placeholder="${t("ph")}" aria-label="${t("msg")}"></textarea>
        <button type="submit" aria-label="${t("send")}">${SEND}</button></form><p class="chatw__err" hidden></p>`;
      const f = $("form", foot), ta = f.body;
      f.onsubmit = sendMsg;
      ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) { e.preventDefault(); f.requestSubmit(); } });
      ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; });
    }
  };
  const showErr = (m) => { const e = $(".chatw__err", foot); if (e) { e.textContent = m; e.hidden = !m; } };

  async function startChat(e) {
    e.preventDefault();
    const f = e.target; let bad = false;
    for (const el of [f.name, f.phone, f.body]) { const empty = !el.value.trim() || (el.name === "phone" && !/^\+?[\d\s()-]{6,30}$/.test(el.value.trim())); el.classList.toggle("bad", empty); if (empty) bad = true; }
    if (bad) { showErr(t("fill")); return; }
    if (busy) return; busy = true; f.querySelector("button").disabled = true; showErr("");
    try {
      const d = await api("start", { name: f.name.value, phone: f.phone.value, body: f.body.value, page: location.pathname });
      conv = { id: d.id, key: d.key }; online = d.online; save(); msgs = []; after = 0;
      footer(); await poll(); schedule();
    } catch (err) { showErr(err.status === 429 ? t("busy") : t("err")); f.querySelector("button").disabled = false; }
    finally { busy = false; }
  }
  async function sendMsg(e) {
    e.preventDefault();
    const ta = e.target.body, text = ta.value.trim();
    if (!text || busy) return;
    busy = true; showErr("");
    // shown at once; replaced by the real message on the next refresh
    msgs.push({ id: 0, from: "visitor", body: text, at: new Date().toISOString() }); paint();
    ta.value = ""; ta.style.height = "auto";
    try { await api("send", { ...conv, body: text }); await poll(); }
    catch (err) {
      msgs = msgs.filter((m) => m.id); paint(); ta.value = text;
      if (err.status === 404) return reset();
      showErr(err.status === 429 ? t("busy") : t("err"));
    } finally { busy = false; ta.focus(); }
  }
  function reset() { conv = null; msgs = []; after = 0; save(); paint(); footer(); }

  async function poll() {
    if (!conv) return;
    try {
      const d = await api("poll", { ...conv, after, seen: isOpen });
      online = d.online;
      if (d.messages?.length) {
        msgs = msgs.filter((m) => m.id); // drop the not-yet-confirmed copies
        for (const m of d.messages) if (!msgs.some((x) => x.id === m.id)) msgs.push(m);
        after = msgs[msgs.length - 1].id;
      }
      setUnread(isOpen ? 0 : d.unread || 0);
      if (isOpen) paint(); else head();
    } catch (err) { if (err.status === 404) reset(); }
  }
  function schedule() {
    clearTimeout(timer);
    if (!conv || document.hidden) return;
    timer = setTimeout(async () => { await poll(); schedule(); }, isOpen ? 4000 : 30000);
  }
  async function toggle(open) {
    isOpen = open;
    box.hidden = !open; root.classList.toggle("open", open); btn.setAttribute("aria-expanded", open);
    document.documentElement.classList.toggle("chat-open", open);
    if (!open) { schedule(); return; }
    setUnread(0); paint(); footer();
    if (!conv) api("status").then((d) => { online = !!d.online; head(); }).catch(() => {});
    else { after = 0; msgs = []; await poll(); }
    schedule();
    const first = $("input, textarea", foot); if (first && matchMedia("(pointer: fine)").matches) first.focus();
  }

  btn.onclick = () => toggle(!isOpen);
  $(".chatw__x", root).onclick = () => toggle(false);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen) toggle(false); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && conv) poll(); schedule(); });
  // the language switch re-labels the window
  new MutationObserver(() => { head(); if (isOpen) { paint(); footer(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  head();
  if (conv) { poll(); schedule(); }
}
