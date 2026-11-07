/* Contact form messages and job applications, with a follow-up status and private notes per message */
import { $, $$, I, adminApi, confirmBox, esc, sb, toast } from "../core.js";
import { route } from "../shell.js";

const STATUS = { new: ["جديد", ""], working: ["قيد المتابعة", "warn"], won: ["تم الاتفاق", "ok"], lost: ["لم يتم", "off"] };
const isJob = (m) => (m.services?.[0] || "").startsWith("طلب توظيف");

// ---------------- view: messages ----------------
export let msgFilter = "new";
export async function viewMessages(view) {
  const tabs = [["new", "الجديدة"], ["working", "قيد المتابعة"], ["jobs", "طلبات التوظيف"], ["all", "الكل"]];
  $("#topActions").innerHTML = `<div class="seg" id="mf">${tabs.map(([k, l]) => `<button data-v="${k}" class="${msgFilter === k ? "on" : ""}">${l}</button>`).join("")}</div><button class="b" id="csvBtn" title="تنزيل الرسائل المعروضة كملف Excel">تصدير Excel</button>`;
  $$("#mf button").forEach((b) => (b.onclick = () => { msgFilter = b.dataset.v; route(); }));
  let q = sb.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(300);
  if (msgFilter === "new") q = q.eq("handled", false);
  const [{ data: rows, error }, meta, cfg] = await Promise.all([q, adminApi("msgmeta").catch(() => ({})), adminApi("integrations").catch(() => ({}))]);
  const templates = cfg.templates || [];
  if (error) throw error;
  const st = (m) => meta[m.id]?.status || "new";
  const data = rows.filter((m) => msgFilter === "jobs" ? isJob(m) : msgFilter === "working" ? st(m) === "working" : true);
  if (!data.length) {
    const empty = { new: "لا توجد رسائل جديدة 🎉", working: "لا توجد رسائل قيد المتابعة.", jobs: "لا توجد طلبات توظيف بعد.", all: "لا توجد رسائل بعد." };
    view.innerHTML = `<div class="empty">${I.mail}<p>${empty[msgFilter]}</p></div>`; return;
  }
  const when = (d) => new Date(d).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
  $("#csvBtn").onclick = () => exportCsv(data, meta);
  const linkify = (t) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  view.innerHTML = data.map((m) => {
    const s = st(m), [label, cls] = STATUS[s];
    return `<div class="msg ${m.handled ? "" : "new"}" data-id="${m.id}">
    <div class="msg__head"><div class="msg__avatar">${esc((m.name || "?").trim()[0])}</div>
      <div class="msg__who"><b>${esc(m.name)}</b><span>${esc(m.message)}</span></div>
      <div class="msg__meta"><span>${when(m.created_at)}</span>${s !== "new" ? `<span class="pill ${cls}">${label}</span>` : ""}${m.services?.length ? `<span class="tag off">${esc(m.services.join("، "))}</span>` : ""}</div></div>
    <div class="msg__body"><p style="white-space:pre-wrap">${linkify(m.message)}</p>
      <div class="msg__info"><span>البريد: <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></span>${m.phone ? `<span>الهاتف: <a href="tel:${esc(m.phone)}" dir="ltr">${esc(m.phone)}</a></span>` : ""}<span>اللغة: ${m.lang === "en" ? "English" : "العربية"}</span></div>
      <div class="msg__follow">
        <label class="f"><span>الحالة</span><select data-status="${m.id}">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${k === s ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="f"><span>ملاحظاتك (لا يراها أحد غيرك)</span><textarea data-note="${m.id}" rows="2" placeholder="مثال: اتصلت به يوم الأحد، ينتظر عرض السعر">${esc(meta[m.id]?.note || "")}</textarea></label>
        <button class="b b--sm" data-savemeta="${m.id}">${I.save}حفظ الحالة والملاحظة</button>
      </div>
      ${templates.length ? `<label class="f msg__tpl"><span>رد جاهز</span><select data-tpl="${m.id}"><option value="">بدون</option>${templates.map((t, i) => `<option value="${i}">${esc(t.title || `رد ${i + 1}`)}</option>`).join("")}</select></label>` : ""}
      <div class="msg__actions">
        <a class="b b--sm b--primary" href="mailto:${esc(m.email)}?subject=${encodeURIComponent(isJob(m) ? "بخصوص طلبك للعمل في WIXA" : "رد من WIXA")}">${I.mail}رد بالبريد</a>
        ${m.phone ? `<a class="b b--sm" href="https://wa.me/${esc(m.phone.replace(/\D/g, "").replace(/^0/, "964"))}" target="_blank" rel="noopener">واتساب</a>` : ""}
        <button class="b b--sm" data-h="${m.id}">${m.handled ? "إرجاع كجديدة" : `${I.save}تمت المعالجة`}</button>
        <button class="b b--sm b--danger" data-d="${m.id}">${I.trash}حذف</button></div></div></div>`;
  }).join("");
  $$(".msg__head").forEach((h) => (h.onclick = () => h.parentElement.classList.toggle("open")));
  // a chosen ready reply fills the email and WhatsApp buttons of that message
  $$("[data-tpl]").forEach((sel) => (sel.onchange = () => {
    const m = data.find((x) => String(x.id) === sel.dataset.tpl), box = sel.closest(".msg__body");
    const t = templates[sel.value];
    const text = t ? t.body.split("{name}").join(m.name || "") : "";
    const mail = $("a[href^='mailto:'].b--primary", box), wa = $("a[href*='wa.me/']", box);
    const subject = isJob(m) ? "بخصوص طلبك للعمل في WIXA" : "رد من WIXA";
    if (mail) mail.href = `mailto:${m.email}?subject=${encodeURIComponent(subject)}${text ? `&body=${encodeURIComponent(text)}` : ""}`;
    if (wa) wa.href = `https://wa.me/${(m.phone || "").replace(/\D/g, "").replace(/^0/, "964")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  }));
  $$("[data-savemeta]").forEach((b) => (b.onclick = async () => {
    const id = b.dataset.savemeta; b.disabled = true;
    try {
      const status = $(`[data-status="${id}"]`).value, note = $(`[data-note="${id}"]`).value;
      await adminApi("msgmeta", "PUT", { id, status, note });
      // a decided message (agreed / not agreed) is also marked handled
      const m = data.find((x) => String(x.id) === id);
      if ((status === "won" || status === "lost") && !m.handled) { await sb.from("contact_messages").update({ handled: true }).eq("id", m.id); refreshMsgCount(); }
      toast("تم الحفظ ✓");
    } catch { toast("تعذّر الحفظ", "err"); }
    finally { b.disabled = false; }
  }));
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
    adminApi("msgmeta", "PUT", { id: b.dataset.d, remove: true }).catch(() => {});
    toast("تم الحذف"); refreshMsgCount(); route();
  }));
}
export async function refreshMsgCount() {
  const { count } = await sb.from("contact_messages").select("id", { count: "exact", head: true }).eq("handled", false);
  const el = $("#msgCount"); el.hidden = !count; el.textContent = count || "";
}

// Excel opens UTF-8 CSV with a BOM correctly (Arabic included)
function exportCsv(rows, meta) {
  const STATUS_AR = { new: "جديد", working: "قيد المتابعة", won: "تم الاتفاق", lost: "لم يتم" };
  const head = ["التاريخ", "الاسم", "البريد", "الهاتف", "الخدمة / النوع", "الرسالة", "اللغة", "تمت المعالجة", "الحالة", "ملاحظاتك"];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((m) => [new Date(m.created_at).toLocaleString("en-GB", { timeZone: "Asia/Baghdad" }), m.name, m.email, m.phone, (m.services || []).join("، "), m.message, m.lang, m.handled ? "نعم" : "لا", STATUS_AR[meta[m.id]?.status || "new"], meta[m.id]?.note || ""].map(cell).join(","));
  const blob = new Blob(["\ufeff" + [head.map(cell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `wixa-messages-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
