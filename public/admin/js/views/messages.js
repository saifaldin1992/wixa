/* Contact form messages */
import { $, $$, I, confirmBox, esc, sb, toast } from "../core.js";
import { route } from "../shell.js";

// ---------------- view: messages ----------------
export let msgFilter = "new";
export async function viewMessages(view) {
  $("#topActions").innerHTML = `<div class="seg" id="mf"><button data-v="new" class="${msgFilter === "new" ? "on" : ""}">الجديدة</button><button data-v="all" class="${msgFilter === "all" ? "on" : ""}">الكل</button></div>`;
  $$("#mf button").forEach((b) => (b.onclick = () => { msgFilter = b.dataset.v; route(); }));
  let q = sb.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200);
  if (msgFilter === "new") q = q.eq("handled", false);
  const { data, error } = await q;
  if (error) throw error;
  if (!data.length) { view.innerHTML = `<div class="empty">${I.mail}<p>${msgFilter === "new" ? "لا توجد رسائل جديدة 🎉" : "لا توجد رسائل بعد."}</p></div>`; return; }
  const when = (d) => new Date(d).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
  view.innerHTML = data.map((m) => `<div class="msg ${m.handled ? "" : "new"}" data-id="${m.id}">
    <div class="msg__head"><div class="msg__avatar">${esc((m.name || "?").trim()[0])}</div>
      <div class="msg__who"><b>${esc(m.name)}</b><span>${esc(m.message)}</span></div>
      <div class="msg__meta"><span>${when(m.created_at)}</span>${m.services?.length ? `<span class="tag off">${esc(m.services.join("، "))}</span>` : ""}</div></div>
    <div class="msg__body"><p>${esc(m.message)}</p>
      <div class="msg__info"><span>البريد: <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></span>${m.phone ? `<span>الهاتف: <a href="tel:${esc(m.phone)}">${esc(m.phone)}</a></span>` : ""}<span>اللغة: ${m.lang === "en" ? "English" : "العربية"}</span></div>
      <div class="msg__actions">
        <a class="b b--sm b--primary" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("رد من WIXA")}">${I.mail}رد بالبريد</a>
        ${m.phone ? `<a class="b b--sm" href="https://wa.me/${esc(m.phone.replace(/\D/g, ""))}" target="_blank" rel="noopener">واتساب</a>` : ""}
        <button class="b b--sm" data-h="${m.id}">${m.handled ? "إرجاع كجديدة" : `${I.save}تمت المعالجة`}</button>
        <button class="b b--sm b--danger" data-d="${m.id}">${I.trash}حذف</button></div></div></div>`).join("");
  $$(".msg__head").forEach((h) => (h.onclick = () => h.parentElement.classList.toggle("open")));
  $$("[data-h]").forEach((b) => (b.onclick = async () => {
    const m = data.find((x) => String(x.id) === b.dataset.h);
    const { error } = await sb.from("contact_messages").update({ handled: !m.handled }).eq("id", m.id);
    if (error) return toast(error.message, "err");
    refreshMsgCount(); route();
  }));
  $$("[data-d]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox("حذف الرسالة", "هل تريد حذف هذه الرسالة نهائياً؟", "حذف"))) return;
    const { error } = await sb.from("contact_messages").delete().eq("id", b.dataset.d);
    if (error) return toast(error.message, "err");
    toast("تم الحذف"); refreshMsgCount(); route();
  }));
}
export async function refreshMsgCount() {
  const { count } = await sb.from("contact_messages").select("id", { count: "exact", head: true }).eq("handled", false);
  const el = $("#msgCount"); el.hidden = !count; el.textContent = count || "";
}
