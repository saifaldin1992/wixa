/* A quote for a customer, built from the site's cost calculator (types, features, rush) with an optional final price.
   It can be printed / saved as PDF, sent on WhatsApp, or posted straight into the live chat.
   The customer moves to the "quote sent" stage of the sales pipeline. */
import { $, $$, closeModal, esc, openModal, sb, settings, toast } from "./core.js";
import { normPhone } from "./views/customers.js";

export function openQuote({ name = "", phone = "", chatId = null, onSent } = {}) {
  const cfg = settings.calculator || {}, types = cfg.types || [], feats = cfg.features || [], cur = cfg.currency || "$";
  const foot = document.createElement("div"); foot.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
  foot.innerHTML = `<button class="b" data-close>إلغاء</button><button class="b" data-print>🖨️ PDF</button>${phone ? '<button class="b" data-wa>واتساب</button>' : ""}${chatId ? '<button class="b b--primary" data-chat>إرسال في المحادثة</button>' : ""}`;
  openModal(`عرض سعر${name ? ` — ${name}` : ""}`, `<div class="stack quote">
    <label class="f"><span>نوع المشروع</span><select id="qType">${types.map((t, i) => `<option value="${i}">${esc(t.label_ar)}</option>`).join("")}</select></label>
    <div class="f"><span>الميزات</span><div class="quote__feats">${feats.map((f, i) => `<label class="chk"><input type="checkbox" value="${i}"> ${esc(f.label_ar)}</label>`).join("")}</div></div>
    <label class="switch"><input type="checkbox" id="qRush"><i></i>تنفيذ مستعجل</label>
    <div class="grid2"><label class="f"><span>السعر من (${esc(cur)})</span><input type="number" id="qMin" dir="ltr" min="0"></label><label class="f"><span>إلى (${esc(cur)})</span><input type="number" id="qMax" dir="ltr" min="0"></label></div>
    <label class="f"><span>مدة التنفيذ (اختياري)</span><input id="qTime" placeholder="مثال: 4 – 6 أسابيع"></label>
    <label class="f"><span>ملاحظات للزبون (اختياري)</span><textarea id="qNote" rows="2" placeholder="مثال: السعر يشمل الاستضافة لسنة أولى"></textarea></label>
    <p class="muted" style="margin:0;font-size:13px">السعر يُحسب تلقائياً من الحاسبة، ويمكنك تعديله قبل الإرسال.</p></div>`, foot);
  const box = $("#modalBody");
  const calc = () => {
    const t = types[+$("#qType").value]; if (!t) return [0, 0];
    let min = Number(t.min) || 0, max = Number(t.max) || 0;
    $$(".quote__feats input:checked", box).forEach((x) => { const f = feats[+x.value]; min += Number(f.min) || 0; max += Number(f.max) || 0; });
    if ($("#qRush").checked) { const k = Number(cfg.rush) || 1.3; min *= k; max *= k; }
    const r = (v) => Math.round(v / 50) * 50;
    return [r(min), r(max)];
  };
  const refresh = () => { const [a, b] = calc(); $("#qMin").value = a; $("#qMax").value = b; };
  box.querySelectorAll("#qType, #qRush, .quote__feats input").forEach((x) => (x.onchange = refresh));
  refresh();
  const data = () => {
    const t = types[+$("#qType").value] || {}, min = Number($("#qMin").value) || 0, max = Number($("#qMax").value) || 0;
    return { type: t.label_ar || "", features: $$(".quote__feats input:checked", box).map((x) => feats[+x.value]?.label_ar).filter(Boolean),
      rush: $("#qRush").checked, price: min && max && min !== max ? `${min.toLocaleString("en")} – ${max.toLocaleString("en")} ${cur}` : `${(max || min).toLocaleString("en")} ${cur}`,
      time: $("#qTime").value.trim(), note: $("#qNote").value.trim() };
  };
  const text = (q) => `أهلاً ${name || ""}،\nعرض السعر لمشروعك:\n• نوع المشروع: ${q.type}${q.features.length ? `\n• الميزات: ${q.features.join("، ")}` : ""}${q.rush ? "\n• التنفيذ: مستعجل" : ""}${q.time ? `\n• مدة التنفيذ: ${q.time}` : ""}\n• السعر: ${q.price}${q.note ? `\n\n${q.note}` : ""}\n\nيسعدنا الإجابة عن أي سؤال — فريق ويكسا`;
  const markQuoted = async () => {
    const ph = normPhone(phone); if (!ph) return;
    const key = `p:${ph}`;
    const { data: cur } = await sb.from("customer_notes").select("stage").eq("key", key).maybeSingle();
    if (!cur || ["new", "contacted"].includes(cur.stage)) await sb.from("customer_notes").upsert({ key, stage: "quoted", updated_at: new Date().toISOString() });
  };
  $("[data-print]", foot).onclick = () => {
    const q = data(), s = settings, c = s.contact || {};
    const w = open("", "_blank");
    if (!w) return toast("اسمح بالنوافذ المنبثقة لطباعة العرض", "err");
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عرض سعر — ${esc(name)}</title><style>
      body{font-family:Tahoma,Arial,sans-serif;color:#1A1424;margin:0;padding:40px;line-height:1.8}header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #5B21B6;padding-bottom:16px;margin-bottom:24px}
      h1{margin:0;color:#5B21B6;font-size:26px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{text-align:start;padding:12px;border-bottom:1px solid #E9E3F3;vertical-align:top}th{width:32%;color:#5E5670;font-weight:normal}
      .price{background:#F3EEFB;border-radius:14px;padding:18px 20px;display:flex;justify-content:space-between;align-items:center;margin:20px 0}.price b{font-size:24px;color:#5B21B6}footer{margin-top:40px;color:#8A8296;font-size:13px;border-top:1px solid #E9E3F3;padding-top:12px}
      @media print{body{padding:0}}</style></head><body>
      <header><div><h1>${esc(s.brand?.name_ar || "ويكسا")}</h1><span>عرض سعر</span></div><div style="text-align:end">${new Date().toLocaleDateString("ar-IQ", { dateStyle: "long" })}<br>إلى: <b>${esc(name)}</b></div></header>
      <table><tr><th>نوع المشروع</th><td>${esc(q.type)}</td></tr>${q.features.length ? `<tr><th>الميزات</th><td>${q.features.map(esc).join("<br>")}</td></tr>` : ""}
      ${q.rush ? "<tr><th>التنفيذ</th><td>مستعجل</td></tr>" : ""}${q.time ? `<tr><th>مدة التنفيذ</th><td>${esc(q.time)}</td></tr>` : ""}</table>
      <div class="price"><span>السعر</span><b dir="ltr">${esc(q.price)}</b></div>${q.note ? `<p>${esc(q.note)}</p>` : ""}
      <footer>${[c.phone, c.email, "wixa.dev"].filter(Boolean).map((x) => `<span dir="ltr">${esc(x)}</span>`).join(" · ")}</footer>
      <script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
    markQuoted();
  };
  if ($("[data-wa]", foot)) $("[data-wa]", foot).onclick = () => { open(`https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(text(data()))}`, "_blank"); markQuoted(); };
  if ($("[data-chat]", foot)) $("[data-chat]", foot).onclick = async (e) => {
    e.target.disabled = true;
    const { error } = await sb.from("chat_messages").insert({ chat_id: chatId, sender: "staff", body: text(data()) });
    if (error) { e.target.disabled = false; return toast(`تعذّر الإرسال: ${error.message}`, "err"); }
    await markQuoted(); closeModal(); toast("أُرسل العرض في المحادثة ✓"); onSent?.();
  };
}
