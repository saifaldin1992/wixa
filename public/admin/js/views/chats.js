/* Conversations: live chat with site visitors (owner and customer service).
   New messages arrive instantly through chat-live.js; replies are written straight to the database. */
import { $, setSubnav, $$, I, adminApi, closeModal, confirmBox, esc, openModal, role, sb, settings, toast } from "../core.js";
// the status messages a customer sees when tracking an order (defaults shared with the site)
import { DEFAULT_STATUS_MSGS } from "../../../js/order-msgs.js";
const ORDER_MSGS = [["new", "وصلنا طلبك (جديد)"], ["contacted", "تواصلنا معك"], ["quoted", "أرسلنا عرض السعر"], ["in_progress", "العمل جارٍ"], ["done", "تم التسليم"], ["cancelled", "ملغى"]];
import { saveSettings } from "../settings.js";
import { openQuote } from "../quote.js";
import { disablePush, enablePush, isIOS, onChat, pushState, pushSupported, refreshChatCount } from "../chat-live.js";

let filter = "open", current = null, unsub = null, me = null, typingTimer = 0;
const QUICK = ["أهلاً بك 👋 كيف أقدر أساعدك؟", "شكراً لتواصلك معنا، لحظات وأرد عليك.", "ممكن تعطيني تفاصيل أكثر عن المشروع؟", "سأرسل لك عرض السعر على الواتساب خلال اليوم.", "هل يناسبك اتصال هاتفي قصير لنفهم احتياجك؟", "شكراً لك! إذا احتجت أي شيء آخر نحن هنا."];
const quick = () => (settings.chat?.quick?.length ? settings.chat.quick : QUICK);
const when = (t) => {
  const d = new Date(t), now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("ar-IQ", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("ar-IQ", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("ar-IQ", { hour: "numeric", minute: "2-digit" });
};
const waNum = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "964" + d.slice(1); return d; };
const BACK = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';

export async function viewChats(view) {
  unsub?.(); unsub = null;
  const { data: chats, error } = await sb.from("chats").select("*").order("last_at", { ascending: false }).limit(300);
  if (error) {
    $("#topActions").innerHTML = "";
    view.innerHTML = `<div class="empty"><p>${/does not exist|PGRST205|schema cache/i.test(error.message) ? "يلزم تطبيق تحديث قاعدة البيانات الخاص بالدردشة أولاً (ملف supabase/migrations/20261109000000_live_chat.sql)." : `تعذّر تحميل المحادثات (${esc(error.message)})`}</p></div>`;
    return;
  }
  const list = chats || [];
  const on = !!settings.chat?.on;
  const { data: myName, error: nameErr } = await sb.rpc("my_display_name");
  me = nameErr ? null : myName || "";
  $("#topActions").innerHTML = `${me === null ? "" : `<button class="b" id="myName">${I.user} ${me ? `اسمك: ${esc(me)}` : "اختر اسمك"}</button>`}<button class="b" id="pushBtn">${I.bell} الإشعارات على هذا الجهاز</button>${role === "owner" ? `<button class="b" id="chatCfg">${I.gear} إعدادات الدردشة</button>` : ""}`;
  setSubnav((role === "owner" ? `<div class="seg" id="chatBranch"><button type="button" class="on">المحادثات</button><button type="button" data-chatcfg>الإعدادات</button></div>` : "") + `<div class="seg chat__filter">${[["open", "مفتوحة"], ["closed", "مغلقة"], ["all", "الكل"]].map(([k, n]) => `<button type="button" data-f="${k}" class="${filter === k ? "on" : ""}">${n}</button>`).join("")}</div>`);
  view.innerHTML = `${me === "" ? `<div class="chat-off chat-off--name">اختر الاسم الذي يظهر للزبون عند ردّك (مثل «أحمد»)، بدل «فريق ويكسا». <button class="b b--sm b--primary" id="nameNow">اختيار الاسم</button></div>` : ""}${on ? "" : `<div class="chat-off">الدردشة متوقفة في الموقع — الزوار لا يرون زرها. ${role === "owner" ? '<button class="b b--sm b--primary" id="turnOn">تفعيل الدردشة الآن</button>' : "يستطيع المالك تفعيلها."}</div>`}
    <div class="chat ${current ? "chat--thread" : ""}">
      <aside class="chat__list">
        <div class="chat__items"></div>
      </aside>
      <section class="chat__thread"></section>
    </div>`;

  const items = $(".chat__items", view), thread = $(".chat__thread", view);
  const paintList = () => {
    const rows = list.filter((c) => filter === "all" || c.status === filter);
    items.innerHTML = rows.length ? rows.map((c) => `<button type="button" class="chat__item ${current === c.id ? "on" : ""}" data-id="${c.id}">
        <span class="chat__av">${esc((c.name || "?").trim()[0] || "?")}</span>
        <span class="chat__meta"><b>${esc(c.name)}${c.rating ? ` <span class="stars">${"★".repeat(c.rating)}</span>` : ""}</b>${c.topic ? `<em class="chat__topic">${esc(c.topic)}</em>` : ""}<small>${c.last_from === "staff" ? "أنت: " : ""}${esc(c.last_text)}</small></span>
        <span class="chat__side"><small>${when(c.last_at)}</small>${c.unread ? `<i class="count">${c.unread}</i>` : ""}</span></button>`).join("")
      : `<p class="muted chat__none">${filter === "open" ? "لا توجد محادثات مفتوحة." : "لا توجد محادثات."}</p>`;
    $$(".chat__item", items).forEach((b) => (b.onclick = () => openChat(b.dataset.id)));
  };
  $$("#subNav .chat__filter button").forEach((b) => (b.onclick = () => { filter = b.dataset.f; $$("#subNav .chat__filter button").forEach((x) => x.classList.toggle("on", x === b)); paintList(); }));

  let msgs = [];
  const paintMsgs = () => {
    const box = $(".chat__msgs", thread); if (!box) return;
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = msgs.map((m) => `<div class="cm cm--${m.sender === "staff" ? "me" : "them"}"><p>${esc(m.body)}</p><small>${m.sender === "staff" ? esc(m.staff || "الفريق") : ""} ${when(m.created_at)}</small></div>`).join("");
    if (atEnd || !box.dataset.ready) { box.scrollTop = box.scrollHeight; box.dataset.ready = 1; }
  };
  async function openChat(id) {
    current = id;
    const c = list.find((x) => x.id === id);
    if (!c) { current = null; thread.innerHTML = ""; $(".chat", view).classList.remove("chat--thread"); return; }
    $(".chat", view).classList.add("chat--thread"); paintList();
    const wa = waNum(c.phone);
    thread.innerHTML = `<header class="chat__head">
        <button class="b b--icon b--ghost chat__back" type="button" title="رجوع">${BACK}</button>
        <div class="chat__who"><b>${esc(c.name)}${c.rating ? ` <span class="stars" title="${esc(c.rating_note || "")}">${"★".repeat(c.rating)}</span>` : ""}</b>${c.topic ? `<em class="chat__topic">${esc(c.topic)}</em>` : ""}${c.rating_note ? `<small class="muted">«${esc(c.rating_note)}»</small>` : ""}<small class="muted">${c.source ? `جاء من: ${esc(c.source)} · ` : ""}<a href="tel:${esc(c.phone)}" dir="ltr">${esc(c.phone)}</a>${c.page ? ` · من صفحة <span dir="ltr">${esc(c.page)}</span>` : ""} · بدأت ${when(c.created_at)}</small></div>
        <div class="chat__acts"><button class="b b--sm" type="button" id="chatQuote">${I.quote} عرض سعر</button>${wa ? `<a class="b b--sm" href="https://wa.me/${wa}" target="_blank" rel="noopener">واتساب</a>` : ""}
          <button class="b b--sm" type="button" id="chatStatus">${c.status === "open" ? "إغلاق المحادثة" : "إعادة فتح"}</button>
          ${role === "owner" ? `<button class="b b--icon b--ghost b--danger" type="button" id="chatDel" title="حذف">${I.trash}</button>` : ""}</div>
      </header>
      <div class="chat__msgs"></div>
      <p class="chat__typing" hidden>${esc(c.name)} يكتب…</p>
      <div class="chat__quick" hidden>${quick().map((q) => `<button type="button">${esc(q)}</button>`).join("")}</div>
      <form class="chat__compose"><button class="b b--icon b--ghost" type="button" id="quickBtn" title="ردود جاهزة" aria-label="ردود جاهزة">${I.bolt}</button><textarea name="body" rows="1" maxlength="2000" placeholder="اكتب ردك…" required></textarea><button class="b b--primary" type="submit">إرسال</button></form>`;
    $("#chatQuote").onclick = () => openQuote({ name: c.name, phone: c.phone, chatId: c.status === "open" ? c.id : null });
    $(".chat__back", thread).onclick = () => { current = null; $(".chat", view).classList.remove("chat--thread"); thread.innerHTML = ""; paintList(); };
    $("#chatStatus").onclick = async () => {
      const status = c.status === "open" ? "closed" : "open";
      const { error } = await sb.from("chats").update({ status }).eq("id", c.id);
      if (error) return toast("تعذّر التغيير", "err");
      c.status = status; toast(status === "closed" ? "أُغلقت المحادثة" : "أُعيد فتح المحادثة"); openChat(c.id);
    };
    if ($("#chatDel")) $("#chatDel").onclick = async () => {
      if (!(await confirmBox("حذف المحادثة", `ستُحذف محادثة ${c.name} ورسائلها نهائياً.`, "حذف"))) return;
      const { error } = await sb.from("chats").delete().eq("id", c.id);
      if (error) return toast("تعذّر الحذف", "err");
      list.splice(list.indexOf(c), 1); current = null; thread.innerHTML = ""; $(".chat", view).classList.remove("chat--thread"); paintList(); toast("حُذفت المحادثة");
    };
    const f = $(".chat__compose", thread), ta = f.body;
    let typedAt = 0;
    ta.addEventListener("input", () => {
      ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
      // the customer sees "Ahmed is typing…" (sent at most every 4 s)
      if (ta.value.trim() && Date.now() - typedAt > 4000) { typedAt = Date.now(); sb.from("chats").update({ staff_typing_at: new Date().toISOString(), staff_typing: me || "" }).eq("id", c.id).then(() => {}, () => {}); }
    });
    const qbox = $(".chat__quick", thread);
    $("#quickBtn").onclick = () => { qbox.hidden = !qbox.hidden; };
    $$("button", qbox).forEach((b) => (b.onclick = () => { ta.value = ta.value ? `${ta.value} ${b.textContent}` : b.textContent; qbox.hidden = true; ta.dispatchEvent(new Event("input")); ta.focus(); }));
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) { e.preventDefault(); f.requestSubmit(); } });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = ta.value.trim(); if (!body) return;
      const btn = f.querySelector("button"); btn.disabled = true;
      const { data, error } = await sb.from("chat_messages").insert({ chat_id: c.id, sender: "staff", body }).select().single();
      btn.disabled = false;
      if (error) return toast(`تعذّر الإرسال: ${error.message}`, "err");
      ta.value = ""; ta.style.height = "auto"; ta.focus();
      if (data && !msgs.some((m) => m.id === data.id)) { msgs.push(data); paintMsgs(); }
      c.last_text = body; c.last_from = "staff"; c.last_at = new Date().toISOString(); c.status = "open"; paintList();
    };
    const { data } = await sb.from("chat_messages").select("*").eq("chat_id", c.id).order("id").limit(1000);
    if (current !== id) return;
    msgs = data || []; paintMsgs();
    if (c.unread) { c.unread = 0; await sb.from("chats").update({ unread: 0 }).eq("id", c.id); paintList(); refreshChatCount(); }
    if (matchMedia("(pointer: fine)").matches) ta.focus();
  }

  // instant updates while this page is open
  unsub = onChat(async (kind, row) => {
    if (!document.body.contains(items)) { unsub?.(); unsub = null; return; }
    if (kind === "chat" && row?.id === current) {
      const tp = $(".chat__typing", thread);
      if (tp && row.visitor_typing_at && Date.now() - new Date(row.visitor_typing_at) < 7000) {
        tp.hidden = false; clearTimeout(typingTimer); typingTimer = setTimeout(() => (tp.hidden = true), 7000);
      }
    }
    if (kind === "message") {
      if (row.sender === "visitor" && row.chat_id === current) { const tp = $(".chat__typing", thread); if (tp) tp.hidden = true; }
      let c = list.find((x) => x.id === row.chat_id);
      if (!c) { const { data } = await sb.from("chats").select("*").eq("id", row.chat_id).maybeSingle(); if (!data) return; c = data; list.unshift(c); }
      c.last_text = row.body.slice(0, 200); c.last_from = row.sender; c.last_at = row.created_at; c.status = "open";
      if (row.sender === "visitor") c.unread = current === c.id && !document.hidden ? 0 : (c.unread || 0) + 1;
      list.sort((a, b) => new Date(b.last_at) - new Date(a.last_at));
      if (current === c.id) {
        if (!msgs.some((m) => m.id === row.id)) { msgs.push(row); paintMsgs(); }
        if (row.sender === "visitor" && !document.hidden) sb.from("chats").update({ unread: 0 }).eq("id", c.id).then(() => refreshChatCount());
      }
      paintList();
    }
  });

  paintList();
  if (current && list.some((c) => c.id === current)) openChat(current); else current = null;

  // settings (owner) and notifications
  const turnOn = async () => { settings.chat = { ...(settings.chat || {}), on: true }; await saveSettings(); viewChats(view); };
  if ($("#turnOn")) $("#turnOn").onclick = turnOn;
  const askName = () => {
    const foot = document.createElement("div"); foot.style.cssText = "display:flex;gap:8px";
    foot.innerHTML = `<button class="b" data-close>إلغاء</button><button class="b b--primary" data-go>${I.save}حفظ</button>`;
    openModal("اسمك في الدردشة", `<label class="f"><span>الاسم الذي يراه الزبون عند ردّك</span><input id="dn" maxlength="40" value="${esc(me || "")}" placeholder="مثال: أحمد"></label>
      <p class="muted" style="margin:8px 0 0;font-size:13px">يظهر للزبون: «أحمد انضم إلى المحادثة» و«أحمد يكتب…». اتركه فارغاً ليظهر «فريق ويكسا».</p>`, foot, true);
    $("[data-go]", foot).onclick = async () => {
      const { error } = await sb.rpc("set_display_name", { p: $("#dn").value });
      if (error) return toast("تعذّر الحفظ", "err");
      closeModal(); toast("حُفظ اسمك ✓"); viewChats(view);
    };
  };
  if ($("#myName")) $("#myName").onclick = askName;
  if ($("#nameNow")) $("#nameNow").onclick = askName;
  const cfgTab = document.querySelector("[data-chatcfg]"); if (cfgTab) cfgTab.onclick = () => $("#chatCfg")?.click();
  if ($("#chatCfg")) $("#chatCfg").onclick = () => {
    const c = settings.chat || {};
    const foot = document.createElement("div"); foot.style.cssText = "display:flex;gap:8px";
    foot.innerHTML = `<button class="b" data-close>إلغاء</button><button class="b b--primary" data-go>${I.save}حفظ ونشر</button>`;
    openModal("إعدادات الدردشة", `<div class="stack">
      <label class="switch"><input type="checkbox" id="cOn" ${c.on ? "checked" : ""}><i></i>إظهار زر الدردشة في الموقع</label>
      <label class="f"><span>رسالة الترحيب (عربي)</span><textarea id="cGa" rows="2">${esc(c.greeting_ar || "")}</textarea></label>
      <label class="f"><span>رسالة الترحيب (English)</span><textarea id="cGe" rows="2" dir="ltr">${esc(c.greeting_en || "")}</textarea></label>
      <label class="f"><span>الردود الجاهزة (كل رد في سطر) — تظهر عند زر ⚡ أثناء الرد</span><textarea id="cQ" rows="6">${esc(quick().join("\n"))}</textarea></label>
      <fieldset class="fs"><legend>أوقات الدوام (بتوقيت بغداد)</legend>
        <label class="switch"><input type="checkbox" id="hOn" ${c.hours?.on ? "checked" : ""}><i></i>خارج الدوام يظهر للزبون «نعود غداً الساعة …» بدل «غير متصلين»</label>
        <div class="days">${["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((d, i) => `<label class="chk"><input type="checkbox" value="${i}" ${(c.hours?.days || [0, 1, 2, 3, 4]).map(Number).includes(i) ? "checked" : ""}> ${d}</label>`).join("")}</div>
        <div class="grid2"><label class="f"><span>من</span><input type="time" id="hFrom" value="${esc(c.hours?.from || "09:00")}" dir="ltr"></label><label class="f"><span>إلى</span><input type="time" id="hTo" value="${esc(c.hours?.to || "17:00")}" dir="ltr"></label></div></fieldset>
      <fieldset class="fs"><legend>رسالة الترحيب الذكية</legend>
        <label class="switch"><input type="checkbox" id="nOn" ${c.nudge?.on !== false ? "checked" : ""}><i></i>تظهر فقاعة صغيرة بجانب زر الدردشة بعد مدة من التصفح (مرة واحدة لكل زيارة)</label>
        <label class="f"><span>بعد كم ثانية</span><input type="number" id="nDelay" min="5" max="300" value="${Number(c.nudge?.delay) || 25}" dir="ltr"></label>
        <label class="f"><span>النص العام (عربي) — في قسم الخدمات والمشاريع والحاسبة يظهر نص مناسب للقسم تلقائياً</span><input id="nAr" value="${esc(c.nudge?.text_ar || "")}" placeholder="عندك فكرة مشروع؟ اسألنا 👋"></label>
        <label class="f"><span>النص العام (English)</span><input id="nEn" dir="ltr" value="${esc(c.nudge?.text_en || "")}" placeholder="Have a project in mind? Ask us 👋"></label></fieldset>
      <fieldset class="fs"><legend>رسائل حالة الطلب — يراها الزبون عند تتبع طلبه في الدردشة وصفحة «تتبع طلبك»</legend>
        <p class="muted" style="margin:0 0 8px;font-size:13px">تتغير الحالة من صفحة الطلبات. اترك الحقل فارغاً لاستخدام النص الافتراضي.</p>
        ${ORDER_MSGS.map(([k, n]) => `<div class="grid2"><label class="f"><span>${n} (عربي)</span><textarea data-sm="${k}" data-l="ar" rows="2" placeholder="${esc(DEFAULT_STATUS_MSGS[k].ar)}">${esc(c.status_msgs?.[k]?.ar || "")}</textarea></label><label class="f"><span>${n} (English)</span><textarea data-sm="${k}" data-l="en" rows="2" dir="ltr" placeholder="${esc(DEFAULT_STATUS_MSGS[k].en)}">${esc(c.status_msgs?.[k]?.en || "")}</textarea></label></div>`).join("")}</fieldset>
      <p class="muted" style="margin:0;font-size:13px">يظهر للزائر «متصلون الآن» عندما يكون أحد الفريق فاتحاً لوحة التحكم، وإلا يظهر أنكم غير متصلين وسترد لاحقاً. تصلك رسالة على البريد عند بدء محادثة جديدة، وعند كل رسالة جديدة إذا لم يكن أحد متصلاً.</p></div>`, foot, true);
    $("[data-go]", foot).onclick = async () => {
      settings.chat = { ...c, on: $("#cOn").checked, greeting_ar: $("#cGa").value.trim(), greeting_en: $("#cGe").value.trim(), quick: $("#cQ").value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 30),
        hours: { on: $("#hOn").checked, days: $$(".days input:checked", $("#modalBody")).map((x) => +x.value), from: $("#hFrom").value || "09:00", to: $("#hTo").value || "17:00" },
        status_msgs: Object.fromEntries(ORDER_MSGS.map(([k]) => [k, { ar: $(`[data-sm="${k}"][data-l="ar"]`).value.trim(), en: $(`[data-sm="${k}"][data-l="en"]`).value.trim() }])),
        nudge: { on: $("#nOn").checked, delay: Math.min(300, Math.max(5, Number($("#nDelay").value) || 25)), text_ar: $("#nAr").value.trim(), text_en: $("#nEn").value.trim() } };
      await saveSettings(); closeModal(); viewChats(view);
    };
  };
  const pushBtn = $("#pushBtn");
  const paintPush = async () => {
    const st = await pushState().catch(() => "off");
    pushBtn.innerHTML = `${I.bell} ${st === "on" ? "الإشعارات مفعّلة على هذا الجهاز" : "فعّل الإشعارات على هذا الجهاز"}`;
    pushBtn.classList.toggle("b--primary", st !== "on");
    pushBtn.dataset.state = st;
  };
  paintPush();
  pushBtn.onclick = async () => {
    const st = pushBtn.dataset.state;
    if (st === "unsupported") {
      return openModal("الإشعارات على هذا الجهاز", isIOS()
        ? `<p>على الآيباد والآيفون تعمل الإشعارات عندما تُفتح لوحة التحكم كتطبيق:</p><ol style="line-height:2.2;padding-inline-start:20px"><li>افتح ${esc(location.origin)}/admin/ في Safari</li><li>اضغط زر المشاركة <b>⬆︎</b> ثم <b>«إضافة إلى الشاشة الرئيسية»</b></li><li>افتح «ويكسا» من الشاشة الرئيسية وادخل، ثم اضغط هذا الزر مرة أخرى</li></ol>`
        : "<p>هذا المتصفح لا يدعم الإشعارات. استخدم Chrome أو Edge أو Safari حديثاً.</p>", null, true);
    }
    if (st === "denied") return toast("الإشعارات ممنوعة لهذا الموقع. اسمح بها من إعدادات المتصفح ثم حاول مجدداً", "err");
    pushBtn.disabled = true;
    try {
      if (st === "on") {
        if (!(await confirmBox("إيقاف الإشعارات", "لن تصل إشعارات الدردشة إلى هذا الجهاز.", "إيقاف"))) return;
        await disablePush(adminApi); toast("أُوقفت الإشعارات على هذا الجهاز");
      } else {
        const r = await enablePush(adminApi);
        toast(r.test && r.test < 300 ? "تم التفعيل ✓ وصلك إشعار تجريبي" : "تم التفعيل ✓");
      }
    } catch (e) { toast(e.message === "denied" ? "لم يُسمح بالإشعارات" : `تعذّر التفعيل (${e.message})`, "err"); }
    finally { pushBtn.disabled = false; paintPush(); }
  };
  if (!pushSupported() && !isIOS()) pushBtn.hidden = true;
}
