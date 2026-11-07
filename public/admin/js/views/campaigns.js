/* Offers and campaigns (owner): the promotion bar at the top of the site, the "send me the estimate" offer,
   and email campaigns to customers who agreed to receive offers (each email has its own unsubscribe link). */
import { $, I, adminApi, confirmBox, esc, settings, toast } from "../core.js";
import { saveSettings } from "../settings.js";

export async function viewCampaigns(view) {
  $("#topActions").innerHTML = "";
  const p = settings.promo || {}, ex = settings.exit_offer || {};
  let info = { audience: 0, log: [] }, infoErr = "";
  try { info = await adminApi("campaign"); } catch (e) { infoErr = e.data?.error === "migration_missing" ? "يلزم تطبيق تحديث قاعدة البيانات الأخير." : `تعذّر التحميل (${e.message})`; }

  view.innerHTML = `<div class="team">
    <div class="card"><div class="card__head"><div><h3>شريط العرض أعلى الموقع</h3><p>عرض أو خبر قصير يظهر لكل الزوار أعلى الصفحة، ويختفي تلقائياً بعد تاريخ الانتهاء.</p></div></div>
      <form id="promoForm" class="stack">
        <label class="switch"><input type="checkbox" name="on" ${p.on ? "checked" : ""}><i></i>إظهار الشريط في الموقع</label>
        <label class="f"><span>النص (عربي)</span><input name="text_ar" maxlength="140" value="${esc(p.text_ar || "")}" placeholder="مثال: خصم 15% على المتاجر الإلكترونية حتى نهاية الشهر 🎉"></label>
        <label class="f"><span>النص (English)</span><input name="text_en" maxlength="140" dir="ltr" value="${esc(p.text_en || "")}" placeholder="15% off online stores until the end of the month 🎉"></label>
        <div class="grid2"><label class="f"><span>الرابط عند الضغط (اختياري)</span><input name="link" dir="ltr" value="${esc(p.link || "")}" placeholder="#calculator أو #contact"></label>
        <label class="f"><span>ينتهي بتاريخ (اختياري)</span><input name="until" type="date" dir="ltr" value="${esc(p.until || "")}"></label></div>
        <button class="b b--primary" style="justify-self:start">${I.save}حفظ ونشر</button></form></div>

    <div class="card"><div class="card__head"><div><h3>عرض «نرسل لك التقدير على واتساب؟»</h3><p>من استخدم حاسبة التكلفة ولم يرسل طلباً، يظهر له مرة واحدة عرض لإرسال التقدير على واتساب عند مغادرته الصفحة (أو بعد 45 ثانية على الجوال). يصلك طلبه في «المحادثات».</p></div></div>
      <label class="switch"><input type="checkbox" id="exitOn" ${ex.on !== false ? "checked" : ""}><i></i>تفعيل العرض</label></div>

    <div class="card"><div class="card__head"><div><h3>حملة بريدية</h3><p>تُرسل فقط لمن وافق على استلام العروض ولم يلغِ اشتراكه، ومع كل رسالة رابط «إلغاء الاشتراك».</p></div></div>
      ${infoErr ? `<p class="muted">${esc(infoErr)}</p>` : `<p style="margin:0 0 12px">الجمهور الآن: <b>${info.audience}</b> شخص لديه بريد ووافق على العروض.</p>
      <form id="campForm" class="stack">
        <label class="f"><span>عنوان الرسالة</span><input name="subject" required maxlength="150" placeholder="مثال: عرض خاص لك من ويكسا 🎁"></label>
        <label class="f"><span>نص الرسالة — اكتب {name} ليظهر اسم الزبون</span><textarea name="body" required rows="8" maxlength="8000" placeholder="أهلاً {name}،&#10;&#10;لأنك من عملائنا المميزين، نقدّم لك هذا الشهر…"></textarea></label>
        <div style="display:flex;flex-wrap:wrap;gap:8px"><button class="b" type="button" id="campTest">${I.mail}إرسال تجربة لبريدي</button><button class="b b--primary" type="submit" ${info.audience ? "" : "disabled"}>إرسال إلى ${info.audience} شخص</button></div>
        <p class="muted" style="margin:0;font-size:12.5px">خطة Resend المجانية تسمح بـ 100 رسالة يومياً و3000 شهرياً. للأعداد الأكبر رقِّ الخطة من resend.com.</p>
      </form>
      ${info.log.length ? `<h4 style="margin:18px 0 8px">الحملات السابقة</h4><div class="members">${info.log.map((c) => `<div class="member"><div class="member__info"><b>${esc(c.subject)}</b><span class="muted">${new Date(c.at).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" })} · أُرسلت إلى ${c.sent}${c.failed ? ` · فشل ${c.failed}` : ""}</span></div></div>`).join("")}</div>` : ""}`}
    </div></div>`;

  $("#promoForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    settings.promo = { on: f.on.checked, text_ar: f.text_ar.value.trim(), text_en: f.text_en.value.trim(), link: f.link.value.trim(), until: f.until.value };
    if (settings.promo.on && !settings.promo.text_ar) return toast("اكتب نص العرض أولاً", "err");
    await saveSettings();
  };
  $("#exitOn").onchange = async (e) => { settings.exit_offer = { on: e.target.checked }; await saveSettings(); };
  const form = $("#campForm");
  if (!form) return;
  const send = async (test) => {
    const subject = form.subject.value.trim(), body = form.body.value.trim();
    if (!subject || !body) return toast("اكتب العنوان والنص", "err");
    if (!test && !(await confirmBox("إرسال الحملة", `ستُرسل «${subject}» إلى ${info.audience} شخص الآن. لا يمكن التراجع بعد الإرسال.`, "إرسال", false))) return;
    const btns = form.querySelectorAll("button"); btns.forEach((b) => (b.disabled = true));
    try {
      const r = await adminApi("campaign", "POST", { subject, body, test });
      toast(test ? "أُرسلت التجربة إلى بريد التنبيهات ✓" : `أُرسلت إلى ${r.sent} شخص ✓${r.failed ? ` (فشل ${r.failed})` : ""}`, r.failed ? "err" : "");
      if (!test) viewCampaigns(view);
    } catch (e) { toast(e.data?.error === "no_audience" ? "لا يوجد أحد في الجمهور بعد" : `تعذّر الإرسال (${e.message})`, "err"); }
    finally { btns.forEach((b) => (b.disabled = false)); }
  };
  $("#campTest").onclick = () => send(true);
  form.onsubmit = (e) => { e.preventDefault(); send(false); };
}
