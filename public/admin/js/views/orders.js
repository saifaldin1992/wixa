/* Orders: every project order from the site's one order page (/order), whatever button it came from.
   Each card: number, what was chosen and from where, the price guide, gifts and discount saved with it,
   the customer's contact buttons, a status the team moves forward, and a private note. */
import { $, setSubnav, $$, I, esc, sb, toast } from "../core.js";
import { route } from "../shell.js";
import { openQuote } from "../quote.js";

export const ORDER_STATUS = {
  new: ["جديد", ""], contacted: ["تواصلنا", "warn"], quoted: ["أُرسل العرض", "warn"],
  in_progress: ["قيد التنفيذ", "ok"], done: ["مكتمل", "ok"], cancelled: ["ملغي", "off"],
};
const SOURCE = { package: "باقة", field: "حل لمجال", calc: "الحاسبة", similar: "مشروع مشابه", service: "خدمة", start: "ابدأ مشروعك" };
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
  const wa = (p) => String(p || "").replace(/\D/g, "").replace(/^0(?=7)/, "964").replace(/^00/, "");

  view.innerHTML = `<div class="card ord-top">
      <input class="ord-search" id="ordQ" type="search" placeholder="ابحث برقم الطلب أو الاسم أو الهاتف" value="${esc(search)}">
      ${bySource.length ? `<div class="ord-src">${bySource.map(([k, n]) => `<span class="tag off">${esc(SOURCE[k] || k)}: <b>${n}</b></span>`).join("")}</div>` : ""}
    </div>
    ${list.length ? list.map((o) => {
      const [label, cls] = ORDER_STATUS[o.status] || ORDER_STATUS.new;
      const feats = o.details?.features || [];
      const expired = o.discount_until && new Date(o.discount_until) < new Date(new Date().toDateString());
      return `<div class="msg ${o.status === "new" ? "new" : ""}" data-id="${o.id}">
        <div class="msg__head"><div class="msg__avatar">${esc((o.name || "?").trim()[0])}</div>
          <div class="msg__who"><b>${esc(o.name)} <span class="muted" dir="ltr" style="font-weight:600">${esc(o.number)}</span></b><span>${esc(SOURCE[o.source] || "")}: ${esc(o.item)}${o.price_hint ? ` · ${esc(o.price_hint)}` : ""}</span></div>
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
          <div class="msg__actions">
            <a class="b b--sm" href="tel:${esc(o.phone)}">${I.phone || ""}اتصال</a>
            ${wa(o.phone) ? `<a class="b b--sm" target="_blank" rel="noopener" href="https://wa.me/${wa(o.phone)}?text=${encodeURIComponent(`مرحباً ${o.name}، بخصوص طلبك رقم ${o.number} من ويكسا`)}">واتساب</a>` : ""}
            ${o.email ? `<a class="b b--sm" href="mailto:${esc(o.email)}?subject=${encodeURIComponent(`طلبك ${o.number} — ويكسا`)}">${I.mail}بريد</a>` : ""}
            <button class="b b--sm b--primary" data-quote="${o.id}">${I.quote} عرض سعر</button>
          </div></div></div>`;
    }).join("") : `<div class="empty">${I.mail}<p>${rows.length ? "لا توجد طلبات هنا." : "لم تصل طلبات بعد. كل زر «ابدأ مشروعك» و«اطلب هذه الباقة» و«اطلب حلّك» و«اطلب مشروعاً مشابهاً» والحاسبة يوصل الطلب إلى هنا."}</p></div>`}`;

  const s = $("#ordQ");
  s.oninput = () => { search = s.value; clearTimeout(s._t); s._t = setTimeout(() => { route(); setTimeout(() => { const x = $("#ordQ"); x?.focus(); x?.setSelectionRange(x.value.length, x.value.length); }, 30); }, 350); };
  $$(".msg__head", view).forEach((h) => (h.onclick = () => h.parentElement.classList.toggle("open")));
  const save = async (id, patch, msg) => {
    const { error: e } = await sb.from("orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    e ? toast(`تعذّر الحفظ: ${e.message}`, "err") : toast(msg);
  };
  $$("[data-st]", view).forEach((el) => (el.onchange = async () => { await save(el.dataset.st, { status: el.value }, "حُدّثت الحالة ✓"); const o = rows.find((r) => String(r.id) === el.dataset.st); if (o) o.status = el.value; refreshOrderCount(); }));
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
