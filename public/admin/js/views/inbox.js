/* «الوارد»: one list of everything people sent through the site — live chats, project orders, contact-form messages,
   bookings and job applications — newest first, with what still needs an answer on top. A tap opens it in its own
   page (the conversation itself, the orders, the messages). The channels are the site's own; WhatsApp, Instagram and
   Messenger can join later as more kinds here. */
import { $, $$, I, esc, sb, setSubnav } from "../core.js";
import { showChat } from "./chats.js";

let filter = "todo";
const when = (t) => {
  const d = new Date(t), now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("ar-IQ", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("ar-IQ", { day: "numeric", month: "short" });
};
// kinds: [label, colour class, page]
const KIND = {
  chat: ["محادثة", "k-chat", "chats"], order: ["طلب مشروع", "k-order", "orders"], message: ["رسالة", "k-msg", "messages"],
  booking: ["حجز موعد", "k-book", "messages"], job: ["طلب توظيف", "k-job", "messages"],
};
const ICON = {
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1121 12z"/>',
  order: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  message: '<path d="M3 5h18v14H3z"/><path d="M3 6l9 7 9-7"/>',
  booking: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  job: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
};

export async function viewInbox(view) {
  $("#topActions").innerHTML = "";
  const [c, o, m] = await Promise.all([
    sb.from("chats").select("id,name,last_text,last_from,last_at,unread,status,topic").order("last_at", { ascending: false }).limit(150),
    sb.from("orders").select("id,number,name,item,status,created_at").order("created_at", { ascending: false }).limit(150),
    sb.from("contact_messages").select("id,name,message,services,handled,created_at").order("created_at", { ascending: false }).limit(150),
  ]);
  const items = [
    ...(c.data || []).map((x) => ({ kind: "chat", id: x.id, name: x.name, text: x.topic ? `${x.topic} — ${x.last_text || ""}` : x.last_text, at: x.last_at,
      todo: x.status !== "closed" && (x.unread > 0 || x.last_from === "visitor"), badge: x.unread || 0 })),
    ...(o.data || []).map((x) => ({ kind: "order", id: x.id, name: x.name, text: `${x.number}${x.item ? ` — ${x.item}` : ""}`, at: x.created_at, todo: x.status === "new" })),
    ...(m.data || []).map((x) => {
      const s = (x.services || []).join(" ");
      const kind = /^حجز موعد/.test(s) ? "booking" : /^طلب توظيف/.test(s) ? "job" : "message";
      return { kind, id: x.id, name: x.name, text: kind === "message" ? x.message : s, at: x.created_at, todo: !x.handled };
    }),
  ].filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const failed = [c, o, m].filter((r) => r.error).length;
  const todo = items.filter((x) => x.todo).length;
  const counts = Object.fromEntries(Object.keys(KIND).map((k) => [k, items.filter((x) => x.kind === k && x.todo).length]));

  setSubnav(`<div class="seg" id="inbF">${[["todo", `تحتاج رداً <small>${todo}</small>`], ["all", `الكل <small>${items.length}</small>`], ...Object.entries(KIND).map(([k, [l]]) => [k, `${l}${counts[k] ? ` <small>${counts[k]}</small>` : ""}`])]
    .map(([k, l]) => `<button type="button" data-f="${k}" class="${filter === k ? "on" : ""}">${l}</button>`).join("")}</div>`);
  $$("#inbF button").forEach((b) => (b.onclick = () => { filter = b.dataset.f; viewInbox(view); }));

  const shown = items.filter((x) => (filter === "todo" ? x.todo : filter === "all" ? true : x.kind === filter));
  view.innerHTML = `${failed ? '<p class="muted">تعذّر تحميل جزء من الوارد — حدّث الصفحة.</p>' : ""}
    <div class="inbox">${shown.length ? shown.map((x, i) => `<button type="button" class="inbox__row${x.todo ? " is-todo" : ""}" data-i="${items.indexOf(x)}">
        <span class="inbox__ico ${KIND[x.kind][1]}" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON[x.kind]}</svg></span>
        <span class="inbox__main"><b>${esc(x.name || "زائر")}</b><span class="inbox__kind ${KIND[x.kind][1]}">${KIND[x.kind][0]}</span><small>${esc(String(x.text || "").replace(/\s+/g, " ").slice(0, 120))}</small></span>
        <span class="inbox__side"><small>${when(x.at)}</small>${x.badge ? `<i class="count">${x.badge}</i>` : x.todo ? '<i class="dot" title="تحتاج رداً"></i>' : ""}</span>
      </button>`).join("") : `<div class="empty">${I.mail}<p>${filter === "todo" ? "لا شيء ينتظر ردك الآن 👌" : "لا يوجد شيء هنا بعد."}</p></div>`}</div>`;
  $$(".inbox__row", view).forEach((b) => (b.onclick = () => {
    const x = items[+b.dataset.i];
    if (x.kind === "chat") showChat(x.id);
    location.hash = `#${KIND[x.kind][2]}`;
  }));
}
