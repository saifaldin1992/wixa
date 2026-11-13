/* «الوارد»: everything people sent through the site in one list — live chats, project orders, contact-form messages,
   bookings and job applications — newest first, what still needs an answer on top.
   Messages, bookings and job applications are worked on right here (their full card opens in place: reply, call,
   status, note, «تمت المعالجة»). A chat or an order opens in its own page (the conversation, the order's workflow).
   WhatsApp, Instagram and Messenger can join later as more kinds here. */
import { $, $$, I, adminApi, esc, sb, setSubnav } from "../core.js";
import { showChat } from "./chats.js";
import { booking, exportCsv, isJob, messageCard, wireMessages } from "./messages.js";

let filter = "todo";
export const setInboxFilter = (f) => { filter = f; };
const when = (t) => {
  const d = new Date(t), now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("ar-IQ", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("ar-IQ", { day: "numeric", month: "short" });
};
// kinds: [label, colour class, page for those that open elsewhere]
const KIND = {
  chat: ["محادثة", "k-chat", "chats"], order: ["طلب مشروع", "k-order", "orders"], message: ["رسالة", "k-msg"],
  booking: ["حجز موعد", "k-book"], job: ["طلب توظيف", "k-job"],
};
const ICON = {
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1121 12z"/>',
  order: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
};

export async function viewInbox(view) {
  const [c, o, m, meta, cfg] = await Promise.all([
    sb.from("chats").select("id,name,last_text,last_from,last_at,unread,status,topic").order("last_at", { ascending: false }).limit(150),
    sb.from("orders").select("id,number,name,item,status,created_at").order("created_at", { ascending: false }).limit(150),
    sb.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(300),
    adminApi("msgmeta").catch(() => ({})),
    adminApi("integrations").catch(() => ({})),
  ]);
  const templates = cfg.templates || [];
  const msgs = m.data || [];
  const st = (x) => meta[x.id]?.status || "new";
  const items = [
    ...(c.data || []).map((x) => ({ kind: "chat", id: x.id, name: x.name, text: x.topic ? `${x.topic} — ${x.last_text || ""}` : x.last_text, at: x.last_at,
      todo: x.status !== "closed" && (x.unread > 0 || x.last_from === "visitor"), badge: x.unread || 0 })),
    ...(o.data || []).map((x) => ({ kind: "order", id: x.id, name: x.name, text: `${x.number}${x.item ? ` — ${x.item}` : ""}`, at: x.created_at, todo: x.status === "new" })),
    ...msgs.map((x) => ({ kind: booking(x) ? "booking" : isJob(x) ? "job" : "message", id: x.id, msg: x, at: x.created_at, todo: !x.handled, working: st(x) === "working" })),
  ].filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const failed = [c, o, m].filter((r) => r.error).length;
  const count = (f) => items.filter(f).length;
  const tabs = [["todo", "تحتاج رداً", count((x) => x.todo)], ["all", "الكل", items.length],
    ["chat", "المحادثات", count((x) => x.kind === "chat" && x.todo)], ["order", "الطلبات", count((x) => x.kind === "order" && x.todo)],
    ["message", "الرسائل", count((x) => x.kind === "message" && x.todo)], ["booking", "المواعيد", count((x) => x.kind === "booking" && x.todo)],
    ["job", "التوظيف", count((x) => x.kind === "job" && x.todo)], ["working", "قيد المتابعة", count((x) => x.working)]];
  setSubnav(`<div class="seg" id="inbF">${tabs.map(([k, l, n]) => `<button type="button" data-f="${k}" class="${filter === k ? "on" : ""}">${l}${n ? ` <small>${n}</small>` : ""}</button>`).join("")}</div>`);
  $$("#inbF button").forEach((b) => (b.onclick = () => { filter = b.dataset.f; viewInbox(view); }));

  const shown = items.filter((x) => (filter === "todo" ? x.todo : filter === "all" ? true : filter === "working" ? x.working : x.kind === filter));
  // bookings in their date order, the soonest first
  if (filter === "booking") shown.sort((a, b) => { const x = booking(a.msg), y = booking(b.msg); return `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`); });
  const shownMsgs = shown.filter((x) => x.msg).map((x) => x.msg);
  $("#topActions").innerHTML = shownMsgs.length ? `<button class="b" id="csvBtn" title="تنزيل الرسائل المعروضة كملف Excel">تصدير Excel</button>` : "";
  if (shownMsgs.length) $("#csvBtn").onclick = () => exportCsv(shownMsgs, meta);

  const row = (x) => `<button type="button" class="inbox__row${x.todo ? " is-todo" : ""}" data-kind="${x.kind}" data-id="${esc(x.id)}">
      <span class="inbox__ico ${KIND[x.kind][1]}" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON[x.kind]}</svg></span>
      <span class="inbox__main"><b>${esc(x.name || "زائر")}</b><span class="inbox__kind ${KIND[x.kind][1]}">${KIND[x.kind][0]}</span><small>${esc(String(x.text || "").replace(/\s+/g, " ").slice(0, 120))}</small></span>
      <span class="inbox__side"><small>${when(x.at)}</small>${x.badge ? `<i class="count">${x.badge}</i>` : x.todo ? '<i class="dot" title="تحتاج رداً"></i>' : ""}</span>
    </button>`;
  const EMPTY = { todo: "لا شيء ينتظر ردك الآن 👌", booking: "لا توجد مواعيد محجوزة.", job: "لا توجد طلبات توظيف بعد.", working: "لا توجد رسائل قيد المتابعة." };
  view.innerHTML = `${failed ? '<p class="muted">تعذّر تحميل جزء من الوارد — حدّث الصفحة.</p>' : ""}
    <div class="inbox">${shown.length ? shown.map((x) => (x.msg ? `<div class="inbox__msg"><span class="inbox__kind ${KIND[x.kind][1]}">${KIND[x.kind][0]}</span>${messageCard(x.msg, meta, templates)}</div>` : row(x))).join("")
      : `<div class="empty">${I.mail}<p>${EMPTY[filter] || "لا يوجد شيء هنا بعد."}</p></div>`}</div>`;
  $$(".inbox__row", view).forEach((b) => (b.onclick = () => {
    if (b.dataset.kind === "chat") showChat(b.dataset.id);
    location.hash = `#${KIND[b.dataset.kind][2]}`;
  }));
  wireMessages(view, shownMsgs, meta, templates, () => viewInbox(view));
}
