/* Customers: everyone who reached out through the contact form, an appointment booking or the live chat,
   merged into one card per person (by phone number, otherwise by email): what they asked about, where they came from,
   whether they agreed to receive offers, private notes, and the sales pipeline (stage, follow-up date, deal value).
   Owner and customer service only. */
import { $, setSubnav, $$, closeModal, esc, openModal, sb, toast } from "../core.js";

let seg = "all", q = "", mode = "list";
const day = (t) => new Date(t).toLocaleDateString("ar-IQ", { day: "numeric", month: "short", year: "numeric" });
// one key per person: Iraqi numbers in any form (07…, +9647…, 009647…) become 9647…
export const normPhone = (p) => {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length >= 10) d = "964" + d.slice(1);
  return d.length >= 7 ? d : "";
};
const SRC = { form: "نموذج التواصل", chat: "الدردشة", booking: "حجز موعد" };
export const STAGES = [["new", "جديد", "#64748B"], ["contacted", "تواصلنا", "#2563EB"], ["quoted", "أُرسل العرض", "#D97706"], ["won", "تم البيع", "#16A34A"], ["lost", "خسرناه", "#DC2626"]];
const stageName = (k) => (STAGES.find((x) => x[0] === k) || STAGES[0])[1];
const money = (v) => Number(v || 0).toLocaleString("en");
const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

export function collect(messages, chats, notes) {
  const people = new Map();
  const touch = (t) => {
    const ph = normPhone(t.phone), em = String(t.email || "").trim().toLowerCase();
    // the same person may write once with a phone and once with an email only
    let key = ph ? `p:${ph}` : em ? `e:${em}` : null;
    if (!key) return;
    if (!ph && em) for (const [k, v] of people) if (v.email === em) { key = k; break; }
    if (ph && em && !people.has(key) && people.has(`e:${em}`)) { const v = people.get(`e:${em}`); people.delete(`e:${em}`); v.key = key; people.set(key, v); }
    const c = people.get(key) || { key, name: "", phone: "", email: "", sources: new Set(), interests: new Set(), first: t.at, last: t.at, count: 0, marketing: false, origin: "", history: [] };
    if (t.at >= c.last || !c.name) c.name = t.name || c.name;
    if (ph && !c.phone) c.phone = t.phone;
    if (em && !c.email) c.email = em;
    c.sources.add(t.source);
    if (t.interest) c.interests.add(t.interest);
    if (t.at <= c.first) { c.first = t.at; if (t.origin) c.origin = t.origin; }
    if (!c.origin && t.origin) c.origin = t.origin;
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
    touch({ name: m.name, phone: m.phone, email: m.email, at: m.created_at, source: booking ? "booking" : "form", interest: booking ? "" : svc, text: booking ? svc : m.message, marketing: m.marketing, origin: m.source });
  }
  for (const c of chats) touch({ name: c.name, phone: c.phone, at: c.created_at, source: "chat", interest: (c.topic || "").replace(/^استفسار عن خدمة: /, ""), text: c.last_text, marketing: c.marketing, chat: c.id, origin: c.source, rating: c.rating });
  const byKey = new Map(notes.map((n) => [n.key, n]));
  return [...people.values()].map((c) => {
    const n = byKey.get(c.key) || {}, byMail = c.email ? byKey.get(`e:${c.email}`) : null;
    return { ...c, note: n.note || "", optOut: !!n.opt_out || !!byMail?.opt_out, stage: n.stage || "new", follow: n.follow_at || "", value: Number(n.value) || 0 };
  }).sort((a, b) => (a.last < b.last ? 1 : -1));
}
const consent = (c) => (c.optOut ? "out" : c.marketing ? "yes" : "no");
export async function loadCustomers() {
  const [m, ch, n] = await Promise.all([
    sb.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(5000),
    sb.from("chats").select("*").order("created_at", { ascending: false }).limit(5000),
    sb.from("customer_notes").select("*"),
  ]);
  if (m.error) throw m.error;
  return { all: collect(m.data || [], ch.error ? [] : ch.data || [], n.error ? [] : n.data || []), notesReady: !n.error, chats: ch.error ? [] : ch.data || [] };
}

export async function viewCustomers(view) {
  let data;
  try { data = await loadCustomers(); } catch (e) { view.innerHTML = `<div class="empty"><p>تعذّر تحميل الزبائن (${esc(e.message)})</p></div>`; $("#topActions").innerHTML = ""; return; }
  const { all, notesReady } = data;
  const month = Date.now() - 30 * 864e5;
  const due = all.filter((c) => c.follow && c.follow <= today() && !["won", "lost"].includes(c.stage));
  const kpi = { total: all.length, yes: all.filter((c) => consent(c) === "yes").length, fresh: all.filter((c) => new Date(c.first) > month).length, won: all.filter((c) => c.stage === "won").reduce((a, c) => a + c.value, 0) };

  $("#topActions").innerHTML = `    <button class="b" id="copyNums">📋 نسخ أرقام الموافقين</button><button class="b b--primary" id="csv">⬇️ تصدير Excel</button>`;
  setSubnav(`<div class="seg"><button type="button" data-mode="list" class="${mode === "list" ? "on" : ""}">قائمة</button><button type="button" data-mode="board" class="${mode === "board" ? "on" : ""}">مراحل البيع</button></div><span class="subnav__sep" aria-hidden="true"></span><div class="seg" id="custSeg">${[["all", "الكل"], ["yes", "يقبلون العروض"], ["follow", "متابعة اليوم"], ["chat", "من الدردشة"], ["form", "من النموذج"], ["booking", "حجزوا موعداً"]].map(([k, l]) => `<button type="button" data-seg="${k}" class="${seg === k ? "on" : ""}">${l}</button>`).join("")}</div>`);
  view.innerHTML = `${notesReady ? "" : `<div class="chat-off">لحفظ الملاحظات ومراحل البيع يلزم تطبيق تحديث قاعدة البيانات الأخير.</div>`}
    ${due.length ? `<div class="chat-off chat-off--name">⏰ <b>${due.length}</b> زبون حان موعد متابعته: ${due.slice(0, 4).map((c) => `<a href="#" data-due="${esc(c.key)}">${esc(c.name)}</a>`).join("، ")}${due.length > 4 ? "…" : ""}</div>` : ""}
    <div class="cust__kpis">
      <div class="card cust__kpi"><b>${kpi.total}</b><span>زبون تواصل معك</span></div>
      <div class="card cust__kpi"><b>${kpi.yes}</b><span>وافقوا على العروض</span></div>
      <div class="card cust__kpi"><b>${kpi.fresh}</b><span>جديد خلال 30 يوماً</span></div>
      <div class="card cust__kpi"><b>${money(kpi.won)}</b><span>قيمة المبيعات المسجّلة</span></div>
    </div>
    <div class="cust__bar">
      <label class="cust__search"><input type="search" placeholder="بحث بالاسم أو الرقم أو الخدمة…" value="${esc(q)}"></label>
    </div>
    <p class="muted cust__hint">أرسل العروض فقط لمن وافق عليها (✓). من لم يوافق تواصلت معه بخصوص طلبه فقط.</p>
    <div class="cust__list"></div>`;

  const list = $(".cust__list", view);
  const shown = () => all.filter((c) => (seg === "all" || (seg === "yes" ? consent(c) === "yes" : seg === "follow" ? due.includes(c) : c.sources.has(seg)))
    && (!q || `${c.name} ${c.phone} ${normPhone(c.phone)} ${c.email} ${[...c.interests].join(" ")} ${c.note} ${c.origin}`.toLowerCase().includes(q.toLowerCase())));
  const actions = (c) => { const wa = normPhone(c.phone); return `${wa ? `<a class="b b--sm" href="https://wa.me/${wa}" target="_blank" rel="noopener">واتساب</a><a class="b b--sm" href="tel:${esc(c.phone)}">اتصال</a>` : ""}${c.email ? `<a class="b b--sm" href="mailto:${esc(c.email)}">بريد</a>` : ""}<button class="b b--sm" type="button" data-open>التفاصيل</button>`; };
  const stagePill = (c) => { const st = STAGES.find((x) => x[0] === c.stage) || STAGES[0]; return `<span class="stage" style="--c:${st[2]}">${st[1]}${c.value && c.stage === "won" ? ` · ${money(c.value)}` : ""}</span>`; };
  const paint = () => {
    const rows = shown();
    if (mode === "board") {
      list.className = "cust__board";
      list.innerHTML = STAGES.map(([k, n, color]) => {
        const col = rows.filter((c) => c.stage === k);
        const sum = col.reduce((a, c) => a + c.value, 0);
        return `<section class="col" style="--c:${color}"><header><b>${n}</b><span>${col.length}${sum ? ` · ${money(sum)}` : ""}</span></header>
          ${col.map((c) => `<div class="cust cust--card" data-key="${esc(c.key)}"><b>${esc(c.name || "—")}</b>
            <span class="muted" dir="ltr">${esc(c.phone || c.email)}</span>
            ${c.interests.size ? `<span class="cust__tags">${[...c.interests].slice(0, 2).map((x) => `<i class="cust__int">${esc(x)}</i>`).join("")}</span>` : ""}
            ${c.follow ? `<small class="${c.follow <= today() ? "due" : "muted"}">⏰ ${c.follow}</small>` : ""}
            ${notesReady ? `<select class="cust__stage" aria-label="المرحلة">${STAGES.map(([sk, sn]) => `<option value="${sk}" ${sk === k ? "selected" : ""}>${sn}</option>`).join("")}</select>` : ""}
            <button class="b b--sm" type="button" data-open>التفاصيل</button></div>`).join("") || '<p class="muted col__none">—</p>'}</section>`;
      }).join("");
    } else {
      list.className = "cust__list";
      list.innerHTML = rows.length ? rows.map((c) => {
        const cs = consent(c);
        return `<div class="cust" data-key="${esc(c.key)}">
          <span class="chat__av">${esc((c.name || "?").trim()[0] || "?")}</span>
          <div class="cust__info">
            <b>${esc(c.name || "—")} ${stagePill(c)} ${cs === "yes" ? '<span class="pill ok">✓ يقبل العروض</span>' : cs === "out" ? '<span class="pill">ألغى الاشتراك</span>' : ""}</b>
            <span class="muted"><span dir="ltr">${esc(c.phone || "")}</span>${c.phone && c.email ? " · " : ""}<span dir="ltr">${esc(c.email || "")}</span></span>
            <span class="cust__tags">${[...c.sources].map((s) => `<i>${SRC[s]}</i>`).join("")}${c.origin ? `<i>🔗 ${esc(c.origin)}</i>` : ""}${[...c.interests].slice(0, 3).map((x) => `<i class="cust__int">${esc(x)}</i>`).join("")}</span>
            ${c.note ? `<span class="cust__note">📝 ${esc(c.note)}</span>` : ""}
            ${c.follow ? `<span class="cust__note ${c.follow <= today() ? "due" : ""}">⏰ متابعة: ${c.follow}</span>` : ""}
          </div>
          <div class="cust__side"><small class="muted">آخر تواصل ${day(c.last)}${c.count > 1 ? ` · ${c.count} مرات` : ""}</small><div class="cust__acts">${actions(c)}</div></div>
        </div>`;
      }).join("") : `<div class="empty"><p>${all.length ? "لا يوجد زبائن بهذا البحث." : "لا يوجد زبائن بعد — يظهر هنا كل من يتواصل معك من الموقع."}</p></div>`;
    }
    $$("[data-open]", list).forEach((b) => (b.onclick = () => details(all.find((c) => c.key === b.closest("[data-key]").dataset.key))));
    $$(".cust__stage", list).forEach((s) => (s.onchange = async () => {
      const c = all.find((x) => x.key === s.closest("[data-key]").dataset.key);
      if (await saveNote(c, { stage: s.value })) { toast(`صار: ${stageName(s.value)}`); paint(); }
    }));
  };
  async function saveNote(c, patch) {
    const row = { key: c.key, note: c.note, opt_out: c.optOut, stage: c.stage, follow_at: c.follow || null, value: c.value, ...patch, updated_at: new Date().toISOString() };
    const { error } = await sb.from("customer_notes").upsert(row);
    if (error) { toast(`تعذّر الحفظ: ${error.message}`, "err"); return false; }
    Object.assign(c, { note: row.note, optOut: row.opt_out, stage: row.stage, follow: row.follow_at || "", value: Number(row.value) || 0 });
    return true;
  }
  $$("[data-mode]").forEach((b) => (b.onclick = () => { mode = b.dataset.mode; $$("[data-mode]").forEach((x) => x.classList.toggle("on", x === b)); paint(); }));
  $$("#subNav [data-seg]").forEach((b) => (b.onclick = () => { seg = b.dataset.seg; $$("#subNav [data-seg]").forEach((x) => x.classList.toggle("on", x === b)); paint(); }));
  $$("[data-due]", view).forEach((a) => (a.onclick = (e) => { e.preventDefault(); details(all.find((c) => c.key === a.dataset.due)); }));
  $(".cust__search input", view).oninput = (e) => { q = e.target.value.trim(); paint(); };

  function details(c) {
    const foot = document.createElement("div"); foot.style.cssText = "display:flex;gap:8px";
    foot.innerHTML = `<button class="b" data-close>إغلاق</button>${notesReady ? '<button class="b b--primary" data-save>حفظ</button>' : ""}`;
    const rated = c.history.filter((h) => h.rating);
    openModal(c.name || "زبون", `<div class="stack">
      <p style="margin:0"><span dir="ltr">${esc(c.phone)}</span>${c.email ? ` · <span dir="ltr">${esc(c.email)}</span>` : ""}<br><span class="muted">أول تواصل ${day(c.first)} · آخر تواصل ${day(c.last)}${c.origin ? ` · جاء من: ${esc(c.origin)}` : ""}${rated.length ? ` · تقييمه: ${"★".repeat(rated[0].rating)}` : ""}</span></p>
      ${notesReady ? `<div class="grid2">
        <label class="f"><span>مرحلة البيع</span><select id="cStage">${STAGES.map(([k, n]) => `<option value="${k}" ${k === c.stage ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="f"><span>موعد المتابعة</span><input type="date" id="cFollow" value="${esc(c.follow)}" dir="ltr"></label></div>
        <label class="f"><span>قيمة الصفقة (عند البيع)</span><input type="number" id="cValue" min="0" step="1" value="${c.value || ""}" dir="ltr" placeholder="0"></label>` : ""}
      <div class="cust__hist">${c.history.sort((a, b) => (a.at < b.at ? 1 : -1)).map((h) => `<div><small class="muted">${day(h.at)} · ${SRC[h.source]}${h.interest ? ` · ${esc(h.interest)}` : ""}</small><p>${esc(String(h.text || "").slice(0, 300))}</p>${h.chat ? `<a href="#chats" data-chat>فتح المحادثة ←</a>` : ""}</div>`).join("")}</div>
      ${notesReady ? `<label class="f"><span>ملاحظات خاصة (لا يراها الزبون)</span><textarea id="cNote" rows="3" placeholder="مثال: مهتم بتطبيق متجر، ميزانيته متوسطة، اتصل به بعد العيد">${esc(c.note)}</textarea></label>
      <label class="switch"><input type="checkbox" id="cOut" ${c.optOut ? "checked" : ""}><i></i>لا ترسل له عروضاً (طلب إلغاء الاشتراك)</label>` : ""}
      <p class="muted" style="margin:0;font-size:13px">${c.marketing ? "وافق على استلام العروض عند تواصله." : "لم يوافق على استلام العروض — تواصل معه بخصوص طلبه فقط."}</p></div>`, foot);
    $$("[data-chat]", $("#modalBody")).forEach((a) => (a.onclick = () => closeModal()));
    const save = $("[data-save]", foot);
    if (save) save.onclick = async () => {
      const ok = await saveNote(c, { note: $("#cNote").value.trim().slice(0, 2000), opt_out: $("#cOut").checked, stage: $("#cStage").value, follow_at: $("#cFollow").value || null, value: Math.max(0, Number($("#cValue").value) || 0) });
      if (ok) { closeModal(); paint(); toast("حُفظ ✓"); }
    };
  }

  $("#csv").onclick = () => {
    const rows = shown();
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿" + [["الاسم", "الهاتف", "البريد", "من أين تواصل", "جاء من", "اهتم بـ", "المرحلة", "القيمة", "موعد المتابعة", "أول تواصل", "آخر تواصل", "عدد المرات", "يقبل العروض", "ملاحظات"],
      ...rows.map((c) => [c.name, c.phone, c.email, [...c.sources].map((s) => SRC[s]).join("، "), c.origin, [...c.interests].join("، "), stageName(c.stage), c.value || "", c.follow, c.first.slice(0, 10), c.last.slice(0, 10), c.count, consent(c) === "yes" ? "نعم" : consent(c) === "out" ? "ألغى" : "لا", c.note])]
      .map((r) => r.map(cell).join(",")).join("\r\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: `wixa-customers-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
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
