/* Live chat with the WIXA team. Shown only when switched on in the dashboard (المحادثات).
   Like the big brands' support chats: the visitor first picks what the conversation is about (a service, a quote…),
   then leaves a name and phone, then talks to a named team member, with "typing…" shown on both sides.
   The conversation's id and secret key live in this browser (localStorage), so the visitor can come back to it. */
import { $, $$, L, PREVIEW, esc, lang, state } from "./core.js";

const T = {
  ar: { title: "تحدث مع ويكسا", online: "متصلون الآن — نرد خلال دقائق", away: "غير متصلين الآن — اترك رسالتك وسنرد هنا أو على هاتفك", name: "الاسم", phone: "رقم الهاتف", msg: "رسالتك",
    start: "ابدأ المحادثة", ph: "اكتب رسالة…", send: "إرسال", wa: "أو راسلنا على واتساب", err: "تعذّر الإرسال، حاول مرة أخرى", fill: "أكمل الحقول المطلوبة",
    open: "فتح الدردشة", close: "إغلاق", you: "أنت", team: "فريق ويكسا", busy: "رسائل كثيرة، انتظر قليلاً",
    pick: "بماذا نساعدك؟", svc: "أي خدمة تهمك؟", change: "تغيير", typing: "يكتب…", joined: "انضم إلى المحادثة", closed: "انتهت هذه المحادثة. شكراً لتواصلك معنا.", again: "بدء محادثة جديدة",
    topics: [["svc", "استفسار عن خدمة"], ["quote", "طلب عرض سعر"], ["project", "متابعة مشروع قائم"], ["meet", "حجز موعد أو اجتماع"], ["other", "سؤال آخر"]],
    hints: { svc: "اكتب سؤالك عن الخدمة…", quote: "صف مشروعك باختصار: ماذا تريد أن تبني؟", project: "اذكر اسم المشروع وما تريد متابعته…", meet: "متى يناسبك الاجتماع؟", other: "اكتب سؤالك…" } },
  en: { title: "Chat with WIXA", online: "Online now — we reply in minutes", away: "We're away — leave a message and we'll reply here or by phone", name: "Name", phone: "Phone number", msg: "Your message",
    start: "Start chat", ph: "Type a message…", send: "Send", wa: "Or message us on WhatsApp", err: "Couldn't send, please try again", fill: "Please fill the required fields",
    open: "Open chat", close: "Close", you: "You", team: "WIXA team", busy: "Too many messages, please wait",
    pick: "How can we help?", svc: "Which service?", change: "Change", typing: "is typing…", joined: "joined the chat", closed: "This chat has ended. Thanks for reaching out.", again: "Start a new chat",
    topics: [["svc", "Ask about a service"], ["quote", "Request a quote"], ["project", "Follow up on a project"], ["meet", "Book a meeting"], ["other", "Something else"]],
    hints: { svc: "Type your question about the service…", quote: "Briefly describe your project…", project: "Which project, and what would you like to follow up?", meet: "When suits you?", other: "Type your question…" } },
};
const t = (k) => (T[lang] || T.ar)[k];
const KEY = "wixa-chat";
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1121 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>';

let conv = null, msgs = [], after = 0, online = false, isOpen = false, timer = 0, busy = false, typing = null, status = "open";
let pick = { topic: "", service: "" }, lastTyping = 0;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const save = () => { try { conv ? localStorage.setItem(KEY, JSON.stringify(conv)) : localStorage.removeItem(KEY); } catch {} };
const api = async (path, body) => {
  const r = await fetch(`/api/chat/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "failed"), { status: r.status });
  return d;
};
const time = (s) => new Date(s).toLocaleTimeString(lang === "ar" ? "ar-IQ" : "en-GB", { hour: "numeric", minute: "2-digit" });
const services = () => {
  const c = (state.settings.contact_services || []).map((x) => x[lang] || x.ar || x.en).filter(Boolean);
  return c.length ? c : state.services.map((sv) => L(sv, "title")).filter(Boolean);
};
const topicLabel = () => {
  const name = (t("topics").find(([k]) => k === pick.topic) || [])[1] || "";
  return pick.service ? `${name}: ${pick.service}` : name;
};

let openFn = null;
// other parts of the site (the contact section) open the chat, optionally with a topic already chosen
export const openChat = (topic, service) => openFn?.(topic, service);

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
  document.documentElement.classList.add("has-chat"); // replaces the round contact button opposite WhatsApp
  const btn = $(".chatw__btn", root), box = $(".chatw__box", root), body = $(".chatw__body", root), foot = $(".chatw__foot", root);

  const setUnread = (n) => { const b = $(".chatw__badge", root); b.hidden = !n || isOpen; b.textContent = n > 9 ? "9+" : n; };
  const head = () => {
    btn.setAttribute("aria-label", t("open")); $(".chatw__x", root).setAttribute("aria-label", t("close"));
    $(".chatw__title", root).textContent = t("title");
    $(".chatw__status", root).classList.toggle("on", online);
    $(".chatw__status span", root).textContent = online ? t("online") : t("away");
  };
  const bubble = (cls, html) => `<div class="chatw__msg chatw__msg--${cls}">${html}</div>`;
  const greeting = () => bubble("team", `<p>${esc(cfg[`greeting_${lang}`] || cfg.greeting_ar || "")}</p>`);

  // before a conversation: choose a topic (and a service) from tappable chips
  const paintPick = () => {
    let html = greeting() + bubble("team", `<p>${t("pick")}</p>`);
    if (!pick.topic) html += `<div class="chatw__chips">${t("topics").map(([k, n]) => `<button type="button" data-topic="${k}">${esc(n)}</button>`).join("")}</div>`;
    else {
      html += bubble("me", `<p>${esc((t("topics").find(([k]) => k === pick.topic) || [])[1])}</p>`);
      if (pick.topic === "svc" && services().length) {
        html += bubble("team", `<p>${t("svc")}</p>`);
        if (!pick.service) html += `<div class="chatw__chips">${services().map((n) => `<button type="button" data-svc="${esc(n)}">${esc(n)}</button>`).join("")}</div>`;
        else html += bubble("me", `<p>${esc(pick.service)}</p>`);
      }
    }
    body.innerHTML = html; body.scrollTop = body.scrollHeight;
    $$("[data-topic]", body).forEach((b) => (b.onclick = () => { pick.topic = b.dataset.topic; pick.service = ""; paint(); footer(); }));
    $$("[data-svc]", body).forEach((b) => (b.onclick = () => { pick.service = b.dataset.svc; paint(); footer(); }));
  };
  const paintChat = () => {
    let html = greeting(), lastStaff = "";
    for (const m of msgs) {
      const team = m.from === "staff", who = m.staff || t("team");
      // "Ahmed joined the chat" the first time each team member answers
      if (team && who !== lastStaff) { html += `<p class="chatw__sys">${esc(who)} ${t("joined")}</p>`; lastStaff = who; }
      html += bubble(team ? "team" : "me", `<p>${esc(m.body)}</p><small>${team ? esc(who) : t("you")} · ${time(m.at)}</small>`);
    }
    if (typing) html += `<div class="chatw__msg chatw__msg--team chatw__typing"><p><i></i><i></i><i></i></p><small>${esc(typing === "-" ? t("team") : typing)} ${t("typing")}</small></div>`;
    if (status === "closed") html += `<p class="chatw__sys">${t("closed")}</p>`;
    const end = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
    body.innerHTML = html;
    if (end || !body.dataset.ready) { body.scrollTop = body.scrollHeight; body.dataset.ready = 1; }
  };
  const paint = () => { head(); conv ? paintChat() : paintPick(); };

  const waHref = () => { const a = $("#wa"); return a && !a.hidden && a.href.includes("wa.me") ? a.href : ""; };
  const footer = () => {
    const wa = waHref();
    if (!conv) {
      const ready = pick.topic && (pick.topic !== "svc" || pick.service || !services().length);
      if (!ready) { foot.innerHTML = wa ? `<a class="chatw__wa" href="${wa}" target="_blank" rel="noopener">${t("wa")}</a>` : ""; foot.hidden = !wa; return; }
      foot.hidden = false;
      const saved = (() => { try { return JSON.parse(localStorage.getItem("wixa-chat-me") || "{}"); } catch { return {}; } })();
      foot.innerHTML = `<form class="chatw__start" novalidate>
        <p class="chatw__topic"><span>${esc(topicLabel())}</span><button type="button" class="chatw__change">${t("change")}</button></p>
        <div class="chatw__two"><label><span>${t("name")} <em>*</em></span><input name="name" required maxlength="80" autocomplete="name" value="${esc(saved.name || "")}"></label>
        <label><span>${t("phone")} <em>*</em></span><input name="phone" required type="tel" inputmode="tel" maxlength="30" autocomplete="tel" dir="ltr" value="${esc(saved.phone || "")}"></label></div>
        <label><span>${t("msg")} <em>*</em></span><textarea name="body" required rows="2" maxlength="2000" placeholder="${esc(t("hints")[pick.topic] || "")}"></textarea></label>
        <button class="chatw__go" type="submit">${t("start")}</button><p class="chatw__err" hidden></p></form>`;
      $("form", foot).onsubmit = startChat;
      $(".chatw__change", foot).onclick = () => { pick = { topic: "", service: "" }; paint(); footer(); };
    } else if (status === "closed") {
      foot.hidden = false;
      foot.innerHTML = `<button class="chatw__go" type="button">${t("again")}</button>`;
      $("button", foot).onclick = () => reset();
    } else {
      foot.hidden = false;
      foot.innerHTML = `<form class="chatw__send"><textarea name="body" rows="1" maxlength="2000" placeholder="${t("ph")}" aria-label="${t("msg")}"></textarea>
        <button type="submit" aria-label="${t("send")}">${SEND}</button></form><p class="chatw__err" hidden></p>`;
      const f = $("form", foot), ta = f.body;
      f.onsubmit = sendMsg;
      ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) { e.preventDefault(); f.requestSubmit(); } });
      ta.addEventListener("input", () => {
        ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
        // tell the team "the customer is typing" (at most every 4 s)
        if (ta.value.trim() && Date.now() - lastTyping > 4000) { lastTyping = Date.now(); poll(true); }
      });
    }
  };
  const showErr = (m) => { const e = $(".chatw__err", foot); if (e) { e.textContent = m; e.hidden = !m; } };

  async function startChat(e) {
    e.preventDefault();
    const f = e.target; let bad = false;
    for (const el of [f.name, f.phone, f.body]) { const empty = !el.value.trim() || (el.name === "phone" && !/^\+?[\d\s()-]{6,30}$/.test(el.value.trim())); el.classList.toggle("bad", empty); if (empty) bad = true; }
    if (bad) { showErr(t("fill")); return; }
    if (busy) return; busy = true; f.querySelector(".chatw__go").disabled = true; showErr("");
    try {
      const d = await api("start", { name: f.name.value, phone: f.phone.value, body: f.body.value, topic: topicLabel(), page: location.pathname });
      try { localStorage.setItem("wixa-chat-me", JSON.stringify({ name: f.name.value.trim(), phone: f.phone.value.trim() })); } catch {}
      conv = { id: d.id, key: d.key }; online = d.online; save(); msgs = []; after = 0; status = "open";
      footer(); await poll(); schedule();
    } catch (err) { showErr(err.status === 429 ? t("busy") : t("err")); f.querySelector(".chatw__go").disabled = false; }
    finally { busy = false; }
  }
  async function sendMsg(e) {
    e.preventDefault();
    const ta = e.target.body, text = ta.value.trim();
    if (!text || busy) return;
    busy = true; showErr("");
    msgs.push({ id: 0, from: "visitor", body: text, at: new Date().toISOString() }); paint(); // shown at once, confirmed by the next refresh
    ta.value = ""; ta.style.height = "auto";
    try { await api("send", { ...conv, body: text }); await poll(); }
    catch (err) {
      msgs = msgs.filter((m) => m.id); paint(); ta.value = text;
      if (err.status === 404) return reset();
      showErr(err.status === 429 ? t("busy") : t("err"));
    } finally { busy = false; if (ta.isConnected) ta.focus(); }
  }
  function reset() { conv = null; msgs = []; after = 0; status = "open"; typing = null; pick = { topic: "", service: "" }; save(); paint(); footer(); }

  async function poll(isTyping = false) {
    if (!conv) return;
    try {
      const d = await api("poll", { ...conv, after, seen: isOpen, typing: isTyping });
      online = d.online;
      const before = status;
      status = d.status || "open";
      typing = d.typing || null;
      if (d.messages?.length) {
        msgs = msgs.filter((m) => m.id);
        for (const m of d.messages) if (!msgs.some((x) => x.id === m.id)) msgs.push(m);
        after = msgs[msgs.length - 1].id;
      }
      setUnread(isOpen ? 0 : d.unread || 0);
      if (isOpen) { paint(); if (before !== status) footer(); } else head();
    } catch (err) { if (err.status === 404) reset(); }
  }
  function schedule() {
    clearTimeout(timer);
    if (!conv || document.hidden) return;
    timer = setTimeout(async () => { await poll(); schedule(); }, isOpen ? (typing ? 2500 : 4000) : 30000);
  }
  async function toggle(open) {
    isOpen = open;
    box.hidden = !open; root.classList.toggle("open", open); btn.setAttribute("aria-expanded", open);
    document.documentElement.classList.toggle("chat-open", open);
    if (!open) { schedule(); return; }
    setUnread(0); delete body.dataset.ready; paint(); footer();
    if (!conv) api("status").then((d) => { online = !!d.online; head(); }).catch(() => {});
    else { after = 0; msgs = []; await poll(); footer(); }
    schedule();
    const first = $("textarea, input", foot); if (first && matchMedia("(pointer: fine)").matches) first.focus();
  }
  openFn = (topic, service) => { if (!conv && topic) pick = { topic, service: service || "" }; toggle(true); };

  btn.onclick = () => toggle(!isOpen);
  $(".chatw__x", root).onclick = () => toggle(false);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen) toggle(false); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && conv) poll(); schedule(); });
  new MutationObserver(() => { head(); const l = $("#formChat span"); if (l) l.textContent = lang === "ar" ? "محادثة فورية" : "Live chat"; if (isOpen) { paint(); footer(); } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  // the contact section gets an "instant chat" button next to "contact us"
  const cta = $("#openForm");
  if (cta && !$("#formChat")) {
    const b = document.createElement("button");
    b.type = "button"; b.id = "formChat"; b.className = "btn btn--ghost btn--chat";
    b.innerHTML = `${ICON}<span>${lang === "ar" ? "محادثة فورية" : "Live chat"}</span>`;
    b.onclick = () => openChat("", "");
    cta.after(b);
  }
  head();
  if (conv) { poll(); schedule(); }
}
