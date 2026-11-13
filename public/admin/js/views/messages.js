/* Contact form messages, bookings and job applications, with a follow-up status and private notes per message.
   They are worked on inside «الوارد» (views/inbox.js): each one opens there as a full card with all its actions.
   The old address #messages opens «الوارد» on the messages. */
import { $, $$, I, adminApi, confirmBox, esc, sb, toast } from "../core.js";

export const STATUS = { new: ["جديد", ""], working: ["قيد المتابعة", "warn"], won: ["تم الاتفاق", "ok"], lost: ["لم يتم", "off"] };
export const isJob = (m) => (m.services?.[0] || "").startsWith("طلب توظيف");
// "حجز موعد: الأحد 2026-11-09 الساعة 10:30" → { date, time }
export const booking = (m) => { const x = (m.services?.[0] || "").match(/^حجز موعد:.*?(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2})/); return x ? { date: x[1], time: x[2] } : null; };

// The message's full card (closed: name and first line; open: the message, contact details, status, note, actions).
export function messageCard(m, meta, templates) {
  const s = meta[m.id]?.status || "new", [label, cls] = STATUS[s];
  const when = (d) => new Date(d).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
  const linkify = (t) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return `<div class="msg ${m.handled ? "" : "new"}" data-id="${m.id}">
    <div class="msg__head"><div class="msg__avatar">${esc((m.name || "?").trim()[0])}</div>
      <div class="msg__who"><b>${esc(m.name)}</b><span>${esc(m.message)}</span></div>
      <div class="msg__meta"><span>${when(m.created_at)}</span>${s !== "new" ? `<span class="pill ${cls}">${label}</span>` : ""}${m.services?.length ? `<span class="tag off">${esc(m.services.join("، "))}</span>` : ""}</div></div>
    <div class="msg__body"><p style="white-space:pre-wrap">${linkify(m.message)}</p>
      <div class="msg__info">${m.email ? `<span>البريد: <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></span>` : ""}${m.phone ? `<span>الهاتف: <a href="tel:${esc(m.phone)}" dir="ltr">${esc(m.phone)}</a></span>` : ""}<span>اللغة: ${m.lang === "en" ? "English" : "العربية"}</span></div>
      <div class="msg__follow">
        <label class="f"><span>الحالة</span><select data-status="${m.id}">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${k === s ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="f"><span>ملاحظاتك (لا يراها أحد غيرك)</span><textarea data-note="${m.id}" rows="2" placeholder="مثال: اتصلت به يوم الأحد، ينتظر عرض السعر">${esc(meta[m.id]?.note || "")}</textarea></label>
        <button class="b b--sm" data-savemeta="${m.id}">${I.save}حفظ الحالة والملاحظة</button>
      </div>
      ${templates.length ? `<label class="f msg__tpl"><span>رد جاهز</span><select data-tpl="${m.id}"><option value="">بدون</option>${templates.map((t, i) => `<option value="${i}">${esc(t.title || `رد ${i + 1}`)}</option>`).join("")}</select></label>` : ""}
      <div class="msg__actions">
        ${m.email ? `<a class="b b--sm b--primary" href="mailto:${esc(m.email)}?subject=${encodeURIComponent(isJob(m) ? "بخصوص طلبك للعمل في WIXA" : "رد من WIXA")}">${I.mail}رد بالبريد</a>` : ""}
        ${m.phone ? `<a class="b b--sm" href="tel:${esc(m.phone)}">اتصال</a><a class="b b--sm" href="https://wa.me/${esc(m.phone.replace(/\D/g, "").replace(/^0/, "964"))}" target="_blank" rel="noopener">واتساب</a>` : ""}
        ${booking(m) ? `<button class="b b--sm" data-cancel="${m.id}" title="يصبح هذا الوقت متاحاً للحجز من جديد">إلغاء الموعد</button>` : ""}
        <button class="b b--sm" data-h="${m.id}">${m.handled ? "إرجاع كجديدة" : `${I.save}تمت المعالجة`}</button>
        <button class="b b--sm b--danger" data-d="${m.id}">${I.trash}حذف</button></div></div></div>`;
}

// The cards' buttons, inside `root`; `rows` are the messages drawn there; `done()` redraws after a change.
export function wireMessages(root, rows, meta, templates, done) {
  const find = (id) => rows.find((x) => String(x.id) === String(id));
  $$(".msg__head", root).forEach((h) => (h.onclick = () => h.parentElement.classList.toggle("open")));
  // a chosen ready reply fills the email and WhatsApp buttons of that message
  $$("[data-tpl]", root).forEach((sel) => (sel.onchange = () => {
    const m = find(sel.dataset.tpl), box = sel.closest(".msg__body");
    const t = templates[sel.value];
    const text = t ? t.body.split("{name}").join(m.name || "") : "";
    const mail = $("a[href^='mailto:'].b--primary", box), wa = $("a[href*='wa.me/']", box);
    const subject = isJob(m) ? "بخصوص طلبك للعمل في WIXA" : "رد من WIXA";
    if (mail) mail.href = `mailto:${m.email}?subject=${encodeURIComponent(subject)}${text ? `&body=${encodeURIComponent(text)}` : ""}`;
    if (wa) wa.href = `https://wa.me/${(m.phone || "").replace(/\D/g, "").replace(/^0/, "964")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  }));
  $$("[data-savemeta]", root).forEach((b) => (b.onclick = async () => {
    const id = b.dataset.savemeta; b.disabled = true;
    try {
      const status = $(`[data-status="${id}"]`, root).value, note = $(`[data-note="${id}"]`, root).value;
      await adminApi("msgmeta", "PUT", { id, status, note });
      meta[id] = { ...(meta[id] || {}), status, note };
      // a decided message (agreed / not agreed) is also marked handled
      const m = find(id);
      if ((status === "won" || status === "lost") && !m.handled) { await sb.from("contact_messages").update({ handled: true }).eq("id", m.id); m.handled = true; refreshMsgCount(); }
      toast("تم الحفظ ✓");
    } catch { toast("تعذّر الحفظ", "err"); }
    finally { b.disabled = false; }
  }));
  $$("[data-cancel]", root).forEach((b) => (b.onclick = async () => {
    const m = find(b.dataset.cancel), bk = booking(m);
    if (!(await confirmBox("إلغاء الموعد", `سيُلغى موعد ${m.name} يوم ${bk.date} الساعة ${bk.time} ويصبح الوقت متاحاً للحجز. أبلغ الزبون بنفسك (بالبريد أو الهاتف).`, "إلغاء الموعد"))) return;
    try {
      await adminApi("booking", "DELETE", { date: bk.date, time: bk.time });
      await adminApi("msgmeta", "PUT", { id: String(m.id), status: "lost", note: `${meta[m.id]?.note ? meta[m.id].note + "\n" : ""}أُلغي الموعد ${bk.date} ${bk.time}` });
      if (!m.handled) await sb.from("contact_messages").update({ handled: true }).eq("id", m.id);
      toast("أُلغي الموعد وصار الوقت متاحاً ✓"); refreshMsgCount(); done();
    } catch { toast("تعذّر الإلغاء", "err"); }
  }));
  $$("[data-h]", root).forEach((b) => (b.onclick = async () => {
    const m = find(b.dataset.h);
    const { error } = await sb.from("contact_messages").update({ handled: !m.handled }).eq("id", m.id);
    if (error) return toast(error.message, "err");
    refreshMsgCount(); done();
  }));
  $$("[data-d]", root).forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox("حذف الرسالة", "هل تريد حذف هذه الرسالة نهائياً؟", "حذف"))) return;
    const { error } = await sb.from("contact_messages").delete().eq("id", b.dataset.d);
    if (error) return toast(error.message, "err");
    adminApi("msgmeta", "PUT", { id: b.dataset.d, remove: true }).catch(() => {});
    toast("تم الحذف"); refreshMsgCount(); done();
  }));
}

// what still needs an answer, shown on «الوارد» in the sidebar: unread chats aside, the new messages and new orders
export async function refreshMsgCount() {
  const [m, o] = await Promise.all([
    sb.from("contact_messages").select("id", { count: "exact", head: true }).eq("handled", false),
    sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const n = (m.count || 0) + (o.count || 0);
  const el = $("#msgCount"); if (el) { el.hidden = !n; el.textContent = n || ""; }
}

// Excel opens UTF-8 CSV with a BOM correctly (Arabic included)
export function exportCsv(rows, meta) {
  const STATUS_AR = { new: "جديد", working: "قيد المتابعة", won: "تم الاتفاق", lost: "لم يتم" };
  const head = ["التاريخ", "الاسم", "البريد", "الهاتف", "الخدمة / النوع", "الرسالة", "اللغة", "تمت المعالجة", "الحالة", "ملاحظاتك"];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((m) => [new Date(m.created_at).toLocaleString("en-GB", { timeZone: "Asia/Baghdad" }), m.name, m.email, m.phone, (m.services || []).join("، "), m.message, m.lang, m.handled ? "نعم" : "لا", STATUS_AR[meta[m.id]?.status || "new"], meta[m.id]?.note || ""].map(cell).join(","));
  const blob = new Blob(["﻿" + [head.map(cell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `wixa-messages-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
