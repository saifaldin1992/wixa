/* Orders: every project order from the site's one order page (/order), whatever button it came from.
   Each card: number, what was chosen and from where, the price guide, gifts and discount saved with it,
   the customer's contact buttons, a status the team moves forward, and a private note. */
import { $, setSubnav, $$, I, adminApi, closeModal, esc, openModal, sb, toast } from "../core.js";
import { route } from "../shell.js";
import { openQuote } from "../quote.js";

export const ORDER_STATUS = {
  new: ["جديد", ""], contacted: ["تواصلنا", "warn"], quoted: ["أُرسل العرض", "warn"],
  in_progress: ["قيد التنفيذ", "ok"], done: ["مكتمل", "ok"], cancelled: ["ملغي", "off"],
};
const SOURCE = { package: "باقة", field: "حل لمجال", calc: "الحاسبة", similar: "مشروع مشابه", service: "خدمة", start: "ابدأ مشروعك", manual: "يدوي" };
// how a hand-added order reached the team (kept in visit_source)
const CHANNEL = { phone: "اتصال هاتفي", whatsapp: "واتساب", visit: "زيارة", social: "مواقع التواصل", email: "بريد", other: "أخرى" };
let filter = "open", search = "";

export async function viewOrders(view) {
  const { data: rows, error } = await sb.from("orders").select("*").order("created_at", { ascending: false }).limit(1000);
  if (error) {
    view.innerHTML = `<div class="empty">${I.mail}<p>${/orders|relation|schema cache/.test(error.message) ? "جدول الطلبات غير موجود بعد. طبّق ملف supabase/migrations/20261114000000_orders.sql في محرر SQL." : esc(error.message)}</p></div>`;
    return;
  }
  const count = (k) => rows.filter((o) => (k === "open" ? !["done", "cancelled"].includes(o.status) : k === "all" ? true : o.status === k)).length;
  const tabs = [["open", "المفتوحة"], ...Object.entries(ORDER_STATUS).map(([k, [l]]) => [k, l]), ["all", "الكل"]];
  setSubnav(`<div class="seg" id="of">${tabs.map(([k, l]) => `<button data-v="${k}" class="${filter === k ? "on" : ""}">${l} <small>${count(k)}</small></button>`).join("")}</div>`);
  $$("#of button").forEach((b) => (b.onclick = () => { filter = b.dataset.v; route(); }));

  // where orders come from (which buttons sell)
  const bySource = Object.entries(rows.reduce((a, o) => ((a[o.source] = (a[o.source] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const q = search.trim().toLowerCase();
  const list = rows.filter((o) => (filter === "open" ? !["done", "cancelled"].includes(o.status) : filter === "all" || o.status === filter))
    .filter((o) => !q || `${o.number} ${o.name} ${o.phone} ${o.email} ${o.item}`.toLowerCase().includes(q));
  const when = (d) => new Date(d).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
  // updates the customer sees in the client portal (/portal), per order
  const ups = {};
  if (list.length) {
    const { data: u } = await sb.from("order_updates").select("*").in("order_id", list.slice(0, 200).map((o) => o.id)).order("created_at", { ascending: false });
    (u || []).forEach((x) => (ups[x.order_id] ||= []).push(x));
  }
  const wa = (p) => String(p || "").replace(/\D/g, "").replace(/^0(?=7)/, "964").replace(/^00/, "");

  view.innerHTML = `<div class="card ord-top">
      <div class="ord-bar"><input class="ord-search" id="ordQ" type="search" placeholder="ابحث برقم الطلب أو الاسم أو الهاتف" value="${esc(search)}"><button type="button" class="add-fab" id="ordAdd" aria-label="إضافة طلب يدوي" title="إضافة طلب يدوي">${I.plus}</button></div>
      ${bySource.length ? `<div class="ord-src">${bySource.map(([k, n]) => `<span class="tag off">${esc(SOURCE[k] || k)}: <b>${n}</b></span>`).join("")}</div>` : ""}
    </div>
    ${list.length ? list.map((o) => {
      const [label, cls] = ORDER_STATUS[o.status] || ORDER_STATUS.new;
      const feats = o.details?.features || [];
      const expired = o.discount_until && new Date(o.discount_until) < new Date(new Date().toDateString());
      return `<div class="msg ${o.status === "new" ? "new" : ""}" data-id="${o.id}">
        <div class="msg__head"><div class="msg__avatar">${esc((o.name || "?").trim()[0])}</div>
          <div class="msg__who"><b>${esc(o.name)} <span class="muted" dir="ltr" style="font-weight:600">${esc(o.number)}</span></b><span>${esc(SOURCE[o.source] || "")}${o.source === "manual" && CHANNEL[o.visit_source] ? ` (${CHANNEL[o.visit_source]})` : ""}: ${esc(o.item)}${o.price_hint ? ` · ${esc(o.price_hint)}` : ""}</span></div>
          <div class="msg__meta"><span>${when(o.created_at)}</span><span class="pill ${cls}">${label}</span></div></div>
        <div class="msg__body">
          <div class="ord-grid">
            <div><h4>الطلب</h4><p><b>${esc(o.item || "-")}</b>${o.price_hint ? `<br><span class="muted">${esc(o.price_hint)}</span>` : ""}</p>
              ${feats.length ? `<p class="muted" style="font-size:13px">${feats.map(esc).join(" · ")}</p>` : ""}${o.details?.timeline ? `<p class="muted" style="font-size:13px">${esc(o.details.timeline)}</p>` : ""}
              ${o.note ? `<p style="white-space:pre-wrap;background:var(--bg);padding:10px 12px;border-radius:12px">${esc(o.note)}</p>` : ""}</div>
            <div><h4>محفوظ للزبون</h4>${(o.gifts || []).length ? (o.gifts || []).map((g) => `<p style="margin:0 0 4px">🎁 ${esc(g)}</p>`).join("") : `<p class="muted">لا هدايا</p>`}
              ${o.discount ? `<p style="margin:6px 0 0">💸 ${esc(o.discount)}${expired ? ` <span class="pill off">منتهي</span>` : ""}</p>` : ""}</div>
          </div>
          <div class="msg__info"><span>الهاتف: <a href="tel:${esc(o.phone)}" dir="ltr">${esc(o.phone)}</a></span>${o.email ? `<span>البريد: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a></span>` : ""}<span>اللغة: ${o.lang === "en" ? "English" : "العربية"}</span>${o.visit_source ? `<span>المصدر: ${esc(o.visit_source)}</span>` : ""}${o.marketing ? `<span class="tag">يقبل العروض</span>` : ""}</div>
          <div class="msg__follow">
            <label class="f"><span>الحالة</span><select data-st="${o.id}">${Object.entries(ORDER_STATUS).map(([k, [l]]) => `<option value="${k}" ${k === o.status ? "selected" : ""}>${l}</option>`).join("")}</select></label>
            <label class="f" style="flex:1"><span>ملاحظة الفريق (لا يراها الزبون)</span><textarea data-note="${o.id}" rows="2" maxlength="2000">${esc(o.team_note || "")}</textarea></label>
          </div>
          <div class="ord-ups" data-ups="${o.id}">
            <h4>تحديثات يراها الزبون <span class="muted" style="font-weight:400;font-size:12px">في بوابة العملاء</span></h4>
            ${(ups[o.id] || []).map((x) => `<div class="ord-up"><span class="muted">${when(x.created_at)}</span><p>${esc(x.body)}</p>${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener" dir="ltr">${esc(x.link.replace(/^https?:[/][/]/, "").slice(0, 60))}</a>` : ""}</div>`).join("") || '<p class="muted" style="font-size:13px;margin:0 0 8px">لا تحديثات بعد. اكتب ما تريد أن يراه الزبون عن تقدّم مشروعه.</p>'}
            <div class="ord-upnew"><textarea rows="2" maxlength="2000" placeholder="مثال: أنهينا تصميم الواجهات، وننتقل للبرمجة هذا الأسبوع." data-uptext></textarea>
              <input type="url" dir="ltr" maxlength="500" placeholder="رابط اختياري (ملف، معاينة، تصميم…)" data-uplink>
              <div class="ord-upact"><label class="chk"><input type="checkbox" data-upmail ${o.email ? "checked" : "disabled"}><span>${o.email ? "أرسل بريداً للزبون" : "لا يوجد بريد للزبون"}</span></label>
              <button type="button" class="b b--sm b--primary" data-upadd="${o.id}">${I.plus}أضف التحديث</button></div></div>
          </div>
          <div class="msg__actions">
            <a class="b b--sm" href="tel:${esc(o.phone)}">${I.phone || ""}اتصال</a>
            ${wa(o.phone) ? `<a class="b b--sm" target="_blank" rel="noopener" href="https://wa.me/${wa(o.phone)}?text=${encodeURIComponent(`مرحباً ${o.name}، بخصوص طلبك رقم ${o.number} من ويكسا`)}">واتساب</a>` : ""}
            ${o.email ? `<a class="b b--sm" href="mailto:${esc(o.email)}?subject=${encodeURIComponent(`طلبك ${o.number} — ويكسا`)}">${I.mail}بريد</a>` : ""}
            <button class="b b--sm b--primary" data-quote="${o.id}">${I.quote} عرض سعر</button>
          </div></div></div>`;
    }).join("") : `<div class="empty">${I.mail}<p>${rows.length ? "لا توجد طلبات هنا." : "لم تصل طلبات بعد. كل زر «ابدأ مشروعك» و«اطلب هذه الباقة» و«اطلب حلّك» و«اطلب مشروعاً مشابهاً» والحاسبة يوصل الطلب إلى هنا."}</p></div>`}`;

  $("#ordAdd").onclick = addOrder;
  const s = $("#ordQ");
  s.oninput = () => { search = s.value; clearTimeout(s._t); s._t = setTimeout(() => { route(); setTimeout(() => { const x = $("#ordQ"); x?.focus(); x?.setSelectionRange(x.value.length, x.value.length); }, 30); }, 350); };
  $$(".msg__head", view).forEach((h) => (h.onclick = () => h.parentElement.classList.toggle("open")));
  const save = async (id, patch, msg) => {
    const { error: e } = await sb.from("orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    e ? toast(`تعذّر الحفظ: ${e.message}`, "err") : toast(msg);
  };
  $$("[data-upadd]", view).forEach((b) => (b.onclick = async () => {
    const box = b.closest("[data-ups]"), id = +b.dataset.upadd;
    const body = $("[data-uptext]", box).value.trim(), link = $("[data-uplink]", box).value.trim();
    if (!body) return toast("اكتب نص التحديث", "err");
    if (link && !/^https?:[/][/]/.test(link)) return toast("الرابط يجب أن يبدأ بـ https://", "err");
    b.disabled = true;
    const { error: e } = await sb.from("order_updates").insert({ order_id: id, body, link });
    if (e) { b.disabled = false; return toast(`تعذّر الحفظ: ${e.message}`, "err"); }
    let msg = "أُضيف التحديث ✓ يراه الزبون في بوابة العملاء";
    if ($("[data-upmail]", box).checked) { const r = await adminApi("order-notify", "POST", { id, kind: "update", update: body }).catch(() => null); if (r?.mailed) msg += " ووصله بريد"; }
    toast(msg); route();
  }));
  // marking an order done asks the customer for a review: by email when they left one, and a link to pass on by hand
  const afterDone = async (id) => {
    const r = await adminApi("order-notify", "POST", { id, kind: "done" }).catch(() => null);
    if (!r?.review) return;
    openModal("طلب رأي الزبون", `<p style="margin-top:0">${r.mailed ? "أرسلنا للزبون بريداً يطلب رأيه في المشروع ✓" : r.email ? "تعذّر إرسال البريد الآن." : "لم يترك الزبون بريداً."} يمكنك أيضاً إرسال هذا الرابط له في المحادثة أو بأي طريقة:</p>
      <div style="display:flex;gap:8px"><input readonly dir="ltr" value="${esc(r.review)}" id="rvLink" style="flex:1"><button type="button" class="b" id="rvCopy">${I.copy}نسخ</button></div>
      <p class="muted" style="font-size:12px">الرابط صالح 60 يوماً ولمرة واحدة. الرأي يصلك مخفياً في «آراء العملاء» حتى توافق عليه.</p>`, null, true);
    $("#rvCopy").onclick = async () => { try { await navigator.clipboard.writeText(r.review); toast("نُسخ الرابط ✓"); } catch { $("#rvLink").select(); document.execCommand("copy"); toast("نُسخ الرابط ✓"); } };
  };
  $$("[data-st]", view).forEach((el) => (el.onchange = async () => { await save(el.dataset.st, { status: el.value }, "حُدّثت الحالة ✓"); if (el.value === "done") afterDone(+el.dataset.st); const o = rows.find((r) => String(r.id) === el.dataset.st); if (o) o.status = el.value; refreshOrderCount(); }));
  $$("[data-note]", view).forEach((el) => (el.onchange = () => save(el.dataset.note, { team_note: el.value.trim() }, "حُفظت الملاحظة ✓")));
  $$("[data-quote]", view).forEach((b) => (b.onclick = () => {
    const o = rows.find((r) => String(r.id) === b.dataset.quote);
    openQuote({ name: o.name, phone: o.phone, onSent: () => { if (o.status === "new" || o.status === "contacted") save(o.id, { status: "quoted" }, "حُوّل الطلب إلى «أُرسل العرض» ✓").then(() => route()); } });
    // the gifts and the discount saved with the order go on the quote, so the client sees them applied
    const n = $("#qNote");
    if (n && !n.value) n.value = [`طلب رقم ${o.number}`, ...(o.gifts || []).map((g) => `🎁 ${g}`), ...(o.discount ? [`💸 ${o.discount}`] : [])].join("\n");
  }));
  // open the first new order right away
  view.querySelector(".msg.new")?.classList.add("open");
}

export async function refreshOrderCount() {
  const el = $("#ordCount"); if (!el) return;
  const { count, error } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "new");
  el.hidden = !!error || !count; el.textContent = count || "";
}

// «+» → an order the team adds by hand (a phone call, WhatsApp, a visit…): it gets a number like the site's orders
function addOrder() {
  const foot = document.createElement("div"); foot.style.cssText = "display:flex;gap:8px";
  foot.innerHTML = `<button class="b" data-close>إلغاء</button><button class="b b--primary" data-go>${I.save}حفظ الطلب</button>`;
  openModal("طلب يدوي", `<form id="moForm" class="stack">
      <div class="grid2"><label class="f"><span>اسم الزبون *</span><input name="name" required maxlength="120"></label>
        <label class="f"><span>الهاتف *</span><input name="phone" required type="tel" dir="ltr" maxlength="40" placeholder="07xx xxx xxxx"></label></div>
      <div class="grid2"><label class="f"><span>البريد (اختياري)</span><input name="email" type="email" dir="ltr" maxlength="200"></label>
        <label class="f"><span>وصلنا عن طريق</span><select name="channel">${Object.entries(CHANNEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label></div>
      <label class="f"><span>ما الذي يطلبه</span><input name="item" maxlength="200" placeholder="مثال: متجر إلكتروني لمحل ملابس"></label>
      <div class="grid2"><label class="f"><span>السعر التقريبي (اختياري)</span><input name="price" maxlength="80"></label>
        <label class="f"><span>المدة المطلوبة (اختياري)</span><input name="timeline" maxlength="60"></label></div>
      <label class="f"><span>ملاحظة</span><textarea name="note" rows="3" maxlength="3000"></textarea></label>
      <label class="switch"><input type="checkbox" name="offer"><i></i>أضف الهدايا والخصم المعروضين حالياً في الموقع</label>
      <label class="switch"><input type="checkbox" name="marketing"><i></i>وافق الزبون على استلام العروض بالبريد</label>
      <p class="muted" style="margin:0;font-size:13px">يأخذ الطلب رقماً مثل طلبات الموقع ويظهر في هذه الصفحة. لا يُرسل شيء للزبون.</p></form>`, foot);
  const f = $("#moForm");
  const go = $("[data-go]", foot);
  const submit = async () => {
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    go.disabled = true;
    try {
      const r = await adminApi("order", "POST", { ...v, offer: f.offer.checked, marketing: f.marketing.checked });
      closeModal(); toast(`أُضيف الطلب ${r.number} ✓`); filter = "open"; search = ""; route();
    } catch (e) {
      toast(e.message === "validation" ? "اكتب الاسم ورقم هاتف صحيح" : e.message === "bad_email" ? "البريد غير صحيح" : `تعذّر الحفظ (${e.message})`, "err");
    } finally { go.disabled = false; }
  };
  go.onclick = submit;
  f.onsubmit = (e) => { e.preventDefault(); submit(); };
}
