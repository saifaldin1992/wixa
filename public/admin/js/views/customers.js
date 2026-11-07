/* Customers: everyone who reached out through the contact form, an appointment booking or the live chat,
   merged into one card per person (by phone number, otherwise by email), with what they asked about,
   whether they agreed to receive offers, and private notes. Owner and customer service only. */
import { $, $$, closeModal, esc, openModal, sb, toast } from "../core.js";

let seg = "all", q = "";
const day = (t) => new Date(t).toLocaleDateString("ar-IQ", { day: "numeric", month: "short", year: "numeric" });
// one key per person: Iraqi numbers in any form (07…, +9647…, 009647…) become 9647…
const normPhone = (p) => {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length >= 10) d = "964" + d.slice(1);
  return d.length >= 7 ? d : "";
};
const SRC = { form: "نموذج التواصل", chat: "الدردشة", booking: "حجز موعد" };

function collect(messages, chats, notes) {
  const people = new Map();
  const touch = (t) => {
    const ph = normPhone(t.phone), em = String(t.email || "").trim().toLowerCase();
    // the same person may write once with a phone and once with an email only
    let key = ph ? `p:${ph}` : em ? `e:${em}` : null;
    if (!key) return;
    if (!ph && em) for (const [k, v] of people) if (v.email === em) { key = k; break; }
    if (ph && em && !people.has(key) && people.has(`e:${em}`)) { const v = people.get(`e:${em}`); people.delete(`e:${em}`); people.set(key, v); }
    const c = people.get(key) || { key, name: "", phone: "", email: "", sources: new Set(), interests: new Set(), first: t.at, last: t.at, count: 0, marketing: false, history: [] };
    if (t.at >= c.last || !c.name) c.name = t.name || c.name;
    if (ph && !c.phone) c.phone = t.phone;
    if (em && !c.email) c.email = em;
    c.sources.add(t.source);
    if (t.interest) c.interests.add(t.interest);
    if (t.at < c.first) c.first = t.at;
    if (t.at > c.last) c.last = t.at;
    c.count++;
    if (t.marketing) c.marketing = true;
    c.history.push(t);
    people.set(key, c);
  };
  for (const m of messages) {
    const svc = m.services?.[0] || "";
    if (svc.startsWith("طلب توظيف")) continue; // job applicants are not customers
    const booking = svc.startsWith("حجز موعد");
    touch({ name: m.name, phone: m.phone, email: m.email, at: m.created_at, source: booking ? "booking" : "form", interest: booking ? "" : svc, text: booking ? svc : m.message, marketing: m.marketing });
  }
  for (const c of chats) touch({ name: c.name, phone: c.phone, at: c.created_at, source: "chat", interest: (c.topic || "").replace(/^استفسار عن خدمة: /, ""), text: c.last_text, marketing: c.marketing, chat: c.id });
  const byKey = new Map(notes.map((n) => [n.key, n]));
  return [...people.values()].map((c) => ({ ...c, note: byKey.get(c.key)?.note || "", optOut: !!byKey.get(c.key)?.opt_out }))
    .sort((a, b) => (a.last < b.last ? 1 : -1));
}
const consent = (c) => (c.optOut ? "out" : c.marketing ? "yes" : "no");

export async function viewCustomers(view) {
  const [m, ch, n] = await Promise.all([
    sb.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(5000),
    sb.from("chats").select("*").order("created_at", { ascending: false }).limit(5000),
    sb.from("customer_notes").select("*"),
  ]);
  if (m.error) { view.innerHTML = `<div class="empty"><p>تعذّر تحميل الزبائن (${esc(m.error.message)})</p></div>`; $("#topActions").innerHTML = ""; return; }
  const notesReady = !n.error;
  const all = collect(m.data || [], ch.error ? [] : ch.data || [], n.data || []);
  const month = Date.now() - 30 * 864e5;
  const kpi = { total: all.length, yes: all.filter((c) => consent(c) === "yes").length, fresh: all.filter((c) => new Date(c.first) > month).length };

  $("#topActions").innerHTML = `<button class="b" id="copyNums">📋 نسخ أرقام الموافقين</button><button class="b b--primary" id="csv">⬇️ تصدير Excel</button>`;
  view.innerHTML = `${notesReady ? "" : `<div class="chat-off">لحفظ الملاحظات وإلغاء الاشتراك يلزم تطبيق تحديث قاعدة البيانات (ملف supabase/migrations/20261111000000_customers.sql).</div>`}
    <div class="cust__kpis">
      <div class="card cust__kpi"><b>${kpi.total}</b><span>زبون تواصل معك</span></div>
      <div class="card cust__kpi"><b>${kpi.yes}</b><span>وافقوا على استلام العروض</span></div>
      <div class="card cust__kpi"><b>${kpi.fresh}</b><span>جديد خلال 30 يوماً</span></div>
    </div>
    <div class="cust__bar">
      <div class="seg seg--wide">${[["all", "الكل"], ["yes", "يقبلون العروض"], ["chat", "من الدردشة"], ["form", "من النموذج"], ["booking", "حجزوا موعداً"]].map(([k, l]) => `<button type="button" data-seg="${k}" class="${seg === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <label class="cust__search"><input type="search" placeholder="بحث بالاسم أو الرقم أو الخدمة…" value="${esc(q)}"></label>
    </div>
    <p class="muted cust__hint">أرسل العروض فقط لمن وافق عليها (✓). من لم يوافق تواصلت معه بخصوص طلبه فقط.</p>
    <div class="cust__list"></div>`;

  const list = $(".cust__list", view);
  const shown = () => all.filter((c) => (seg === "all" || (seg === "yes" ? consent(c) === "yes" : c.sources.has(seg)))
    && (!q || `${c.name} ${c.phone} ${normPhone(c.phone)} ${c.email} ${[...c.interests].join(" ")} ${c.note}`.toLowerCase().includes(q.toLowerCase())));
  const paint = () => {
    const rows = shown();
    list.innerHTML = rows.length ? rows.map((c) => {
      const wa = normPhone(c.phone), cs = consent(c);
      return `<div class="cust" data-key="${esc(c.key)}">
        <span class="chat__av">${esc((c.name || "?").trim()[0] || "?")}</span>
        <div class="cust__info">
          <b>${esc(c.name || "—")} ${cs === "yes" ? '<span class="pill ok">✓ يقبل العروض</span>' : cs === "out" ? '<span class="pill">ألغى الاشتراك</span>' : ""}</b>
          <span class="muted"><span dir="ltr">${esc(c.phone || "")}</span>${c.phone && c.email ? " · " : ""}<span dir="ltr">${esc(c.email || "")}</span></span>
          <span class="cust__tags">${[...c.sources].map((s) => `<i>${SRC[s]}</i>`).join("")}${[...c.interests].slice(0, 3).map((x) => `<i class="cust__int">${esc(x)}</i>`).join("")}</span>
          ${c.note ? `<span class="cust__note">📝 ${esc(c.note)}</span>` : ""}
        </div>
        <div class="cust__side"><small class="muted">آخر تواصل ${day(c.last)}${c.count > 1 ? ` · ${c.count} مرات` : ""}</small>
          <div class="cust__acts">${wa ? `<a class="b b--sm" href="https://wa.me/${wa}" target="_blank" rel="noopener">واتساب</a><a class="b b--sm" href="tel:${esc(c.phone)}">اتصال</a>` : ""}${c.email ? `<a class="b b--sm" href="mailto:${esc(c.email)}">بريد</a>` : ""}<button class="b b--sm" type="button" data-open>التفاصيل</button></div></div>
      </div>`;
    }).join("") : `<div class="empty"><p>${all.length ? "لا يوجد زبائن بهذا البحث." : "لا يوجد زبائن بعد — يظهر هنا كل من يتواصل معك من الموقع."}</p></div>`;
    $$("[data-open]", list).forEach((b) => (b.onclick = () => details(all.find((c) => c.key === b.closest(".cust").dataset.key))));
  };
  $$("[data-seg]", view).forEach((b) => (b.onclick = () => { seg = b.dataset.seg; $$("[data-seg]", view).forEach((x) => x.classList.toggle("on", x === b)); paint(); }));
  $(".cust__search input", view).oninput = (e) => { q = e.target.value.trim(); paint(); };

  function details(c) {
    const foot = document.createElement("div"); foot.style.cssText = "display:flex;gap:8px";
    foot.innerHTML = `<button class="b" data-close>إغلاق</button>${notesReady ? '<button class="b b--primary" data-save>حفظ</button>' : ""}`;
    openModal(c.name || "زبون", `<div class="stack">
      <p style="margin:0"><span dir="ltr">${esc(c.phone)}</span>${c.email ? ` · <span dir="ltr">${esc(c.email)}</span>` : ""}<br><span class="muted">أول تواصل ${day(c.first)} · آخر تواصل ${day(c.last)}</span></p>
      <div class="cust__hist">${c.history.sort((a, b) => (a.at < b.at ? 1 : -1)).map((h) => `<div><small class="muted">${day(h.at)} · ${SRC[h.source]}${h.interest ? ` · ${esc(h.interest)}` : ""}</small><p>${esc(String(h.text || "").slice(0, 300))}</p>${h.chat ? `<a href="#chats" data-chat="${h.chat}">فتح المحادثة ←</a>` : ""}</div>`).join("")}</div>
      ${notesReady ? `<label class="f"><span>ملاحظات خاصة (لا يراها الزبون)</span><textarea id="cNote" rows="3" placeholder="مثال: مهتم بتطبيق متجر، ميزانيته متوسطة، اتصل به بعد العيد">${esc(c.note)}</textarea></label>
      <label class="switch"><input type="checkbox" id="cOut" ${c.optOut ? "checked" : ""}><i></i>لا ترسل له عروضاً (طلب إلغاء الاشتراك)</label>` : ""}
      <p class="muted" style="margin:0;font-size:13px">${c.marketing ? "وافق على استلام العروض عند تواصله." : "لم يوافق على استلام العروض — تواصل معه بخصوص طلبه فقط."}</p></div>`, foot);
    $$("[data-chat]", $("#modalBody")).forEach((a) => (a.onclick = () => closeModal()));
    const save = $("[data-save]", foot);
    if (save) save.onclick = async () => {
      const row = { key: c.key, note: $("#cNote").value.trim().slice(0, 2000), opt_out: $("#cOut").checked, updated_at: new Date().toISOString() };
      const { error } = await sb.from("customer_notes").upsert(row);
      if (error) return toast(`تعذّر الحفظ: ${error.message}`, "err");
      c.note = row.note; c.optOut = row.opt_out; closeModal(); paint(); toast("حُفظ ✓");
    };
  }

  $("#csv").onclick = () => {
    const rows = shown();
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿" + [["الاسم", "الهاتف", "البريد", "من أين تواصل", "اهتم بـ", "أول تواصل", "آخر تواصل", "عدد المرات", "يقبل العروض", "ملاحظات"],
      ...rows.map((c) => [c.name, c.phone, c.email, [...c.sources].map((s) => SRC[s]).join("، "), [...c.interests].join("، "), c.first.slice(0, 10), c.last.slice(0, 10), c.count, consent(c) === "yes" ? "نعم" : consent(c) === "out" ? "ألغى" : "لا", c.note])]
      .map((r) => r.map(cell).join(",")).join("\r\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: `wixa-customers-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    toast(`صُدّر ${rows.length} زبون ✓`);
  };
  $("#copyNums").onclick = async () => {
    const nums = all.filter((c) => consent(c) === "yes" && normPhone(c.phone)).map((c) => "+" + normPhone(c.phone));
    if (!nums.length) return toast("لا يوجد بعد زبائن وافقوا على العروض", "err");
    try { await navigator.clipboard.writeText(nums.join("\n")); toast(`نُسخ ${nums.length} رقم ✓ — الصقها في قائمة بث واتساب`); }
    catch { prompt("انسخ الأرقام:", nums.join(", ")); }
  };
  paint();
}
