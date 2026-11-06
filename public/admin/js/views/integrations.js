/* Integrations: new-message alerts, auto-reply to visitors, analytics & ad pixels, spam protection,
   maintenance mode and "publish now". Stored privately on the server (Cloudflare), not in the public site settings. */
import { $, $$, I, adminApi, esc, rememberOwner, toast } from "../core.js";

const TAGS = [
  ["ga4", "Google Analytics 4", "G-XXXXXXXXXX", "من Google Analytics ← الإدارة ← مصادر البيانات ← «معرّف القياس»."],
  ["meta_pixel", "Meta Pixel (فيسبوك وإنستغرام)", "1234567890123456", "من Meta Events Manager ← مصادر البيانات ← رقم البكسل (أرقام فقط)."],
  ["clarity", "Microsoft Clarity (تسجيلات وخرائط حرارية)", "abcd1234ef", "من clarity.microsoft.com ← الإعدادات ← «معرّف المشروع»."],
  ["tiktok", "TikTok Pixel", "CXXXXXXXXXXXXXXXXXXX", "من TikTok Ads Manager ← الأدوات ← الأحداث ← رقم البكسل."],
];

export async function viewIntegrations(view) {
  let cfg;
  try { cfg = await adminApi("integrations"); } catch (e) {
    view.innerHTML = `<div class="empty">تعذّر تحميل التكاملات (${esc(e.message)})</div>`; return;
  }
  rememberOwner(cfg);
  const sw = (id, on, label) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><i></i>${label}</label>`;
  const save = (label = "حفظ") => `<button class="b b--primary" data-save style="justify-self:start">${I.save}${label}</button>`;
  const a = cfg.autoreply, m = cfg.maintenance;
  view.innerHTML = `<div class="ints">
    <div class="card" id="cPublish"><div class="card__head"><div><h3>تحديث الموقع الآن</h3>
      <p>تعديلاتك تظهر تلقائياً فور الحفظ. استخدم هذا الزر إن لم تظهر بعد لسبب ما.</p></div>
      <button class="b b--primary" id="publishBtn">${I.reset}تحديث الآن</button></div></div>

    <div class="card" id="cAlerts"><div class="card__head"><div><h3>تنبيهات الرسائل الجديدة</h3>
      <p>بريد يصلك مع كل رسالة من نموذج «تواصل معنا». عنوان الاستلام يُغيَّر من صفحة الحساب.</p></div></div>
      <div class="stack">
        ${sw("alertsOn", cfg.alerts.on, "إرسال تنبيه بكل رسالة جديدة")}
        <label class="f"><span>اسم المُرسِل الذي يظهر في البريد</span><input id="fromName" maxlength="40" value="${esc(cfg.alerts.from_name)}"></label>
        <p class="muted" style="margin:0;font-size:12px">يُستخدم الاسم نفسه في التنبيهات والرد التلقائي. العنوان يبقى من نطاق wixa.dev.</p>
        <div class="row-btns">${save()}<button class="b" data-test="alert">${I.mail}إرسال تنبيه تجريبي</button></div>
      </div></div>

    <div class="card" id="cReply"><div class="card__head"><div><h3>رد تلقائي للزبون</h3>
      <p>رسالة شكر تصل الزبون فور إرساله النموذج، بلغته (عربي أو إنجليزي). اكتب <code>{name}</code> ليُستبدل باسمه.</p></div></div>
      <div class="stack">
        ${sw("replyOn", a.on, "إرسال رد تلقائي")}
        <div class="grid2">
          <label class="f"><span>العنوان (عربي)</span><input id="subAr" maxlength="120" value="${esc(a.subject_ar)}"></label>
          <label class="f"><span>Subject (English)</span><input id="subEn" maxlength="120" dir="ltr" value="${esc(a.subject_en)}"></label>
          <label class="f"><span>النص (عربي)</span><textarea id="bodyAr" rows="7" maxlength="2000">${esc(a.body_ar)}</textarea></label>
          <label class="f"><span>Text (English)</span><textarea id="bodyEn" rows="7" maxlength="2000" dir="ltr">${esc(a.body_en)}</textarea></label>
        </div>
        <p class="muted" style="margin:0;font-size:12px">يُرسَل من noreply@wixa.dev، وإذا رد الزبون يصل رده إلى بريد التواصل الظاهر في الموقع.</p>
        <div class="row-btns">${save()}<button class="b" data-test="autoreply">${I.mail}أرسل لي نسخة تجريبية</button></div>
      </div></div>

    <div class="card" id="cTags"><div class="card__head"><div><h3>أدوات القياس والإعلانات</h3>
      <p>الصق المعرّف فقط وتعمل الأداة على الموقع. اتركه فارغاً لإيقافها. إرسال نموذج التواصل يُحسب «عميلاً محتملاً» (Lead) في كل أداة مفعّلة.</p></div></div>
      <div class="grid2">${TAGS.map(([k, label, ph, hint]) => `<label class="f"><span>${label}</span>
        <input data-tag="${k}" dir="ltr" placeholder="${ph}" value="${esc(cfg.tags[k] || "")}"><small class="hint muted">${hint}</small></label>`).join("")}</div>
      <p class="muted" style="margin:10px 0 0;font-size:12px">إحصاءات Cloudflare في «نظرة عامة» تعمل دائماً ولا تحتاج شيئاً من هذا.</p>
      <div class="row-btns" style="margin-top:12px">${save()}</div></div>

    <div class="card" id="cSpam"><div class="card__head"><div><h3>الحماية من الرسائل المزعجة</h3>
      <p>نموذج التواصل محمي دائماً بحدّ لعدد الرسائل لكل زائر وبفخ خفي للبرامج الآلية.</p></div></div>
      <div class="stack">
        ${sw("tsOn", cfg.spam.turnstile, "تحقق Cloudflare (Turnstile) قبل الإرسال — يُنصح بإبقائه مفعّلاً")}
        <label class="f"><span>كلمات أو عناوين محظورة (واحدة في كل سطر)</span><textarea id="blocked" rows="4" dir="auto" placeholder="مثال:&#10;casino&#10;spam@example.com">${esc(cfg.spam.blocked)}</textarea>
          <small class="hint muted">أي رسالة تحتوي إحداها تُرفض بصمت: لا تُحفظ ولا يصلك تنبيه بها.</small></label>
        <div class="row-btns">${save()}</div>
      </div></div>

    <div class="card" id="cMaint"><div class="card__head"><div><h3>وضع الصيانة</h3>
      <p>يعرض للزوار صفحة «نعود قريباً» مع بريدك وواتساب. أنت ترى الموقع كالمعتاد من هذا المتصفح.</p></div>
      <span class="pill ${m.on ? "warn" : ""}" id="maintPill">${m.on ? "مفعّل" : "متوقف"}</span></div>
      <div class="stack">
        ${sw("maintOn", m.on, "تفعيل وضع الصيانة")}
        <div class="grid2">
          <label class="f"><span>الرسالة (عربي)</span><textarea id="mAr" rows="3" maxlength="500">${esc(m.message_ar)}</textarea></label>
          <label class="f"><span>Message (English)</span><textarea id="mEn" rows="3" maxlength="500" dir="ltr">${esc(m.message_en)}</textarea></label>
        </div>
        <div class="row-btns">${save()}</div>
      </div></div>
  </div>`;

  const val = (id) => $(`#${id}`).value;
  const chk = (id) => $(`#${id}`).checked;
  const bodyFor = {
    cAlerts: () => ({ alerts: { on: chk("alertsOn"), from_name: val("fromName") } }),
    cReply: () => ({ autoreply: { on: chk("replyOn"), subject_ar: val("subAr"), subject_en: val("subEn"), body_ar: val("bodyAr"), body_en: val("bodyEn") } }),
    cTags: () => ({ tags: Object.fromEntries($$("[data-tag]").map((i) => [i.dataset.tag, i.value.trim()])) }),
    cSpam: () => ({ spam: { turnstile: chk("tsOn"), blocked: val("blocked") } }),
    cMaint: () => ({ maintenance: { on: chk("maintOn"), message_ar: val("mAr"), message_en: val("mEn") } }),
  };
  $$("[data-save]", view).forEach((btn) => (btn.onclick = async () => {
    const card = btn.closest(".card");
    btn.disabled = true;
    try {
      cfg = await adminApi("integrations", "PUT", bodyFor[card.id]());
      rememberOwner(cfg);
      if (card.id === "cTags") $$("[data-tag]").forEach((i) => (i.value = cfg.tags[i.dataset.tag] || ""));
      if (card.id === "cMaint") { const p = $("#maintPill"); p.textContent = cfg.maintenance.on ? "مفعّل" : "متوقف"; p.classList.toggle("warn", cfg.maintenance.on); }
      toast(card.id === "cMaint" && cfg.maintenance.on ? "تم ✓ الزوار يرون صفحة «نعود قريباً» خلال دقيقة" : "تم الحفظ ✓ يعمل خلال دقيقة");
    } catch (e) {
      const names = Object.fromEntries(TAGS.map(([k, l]) => [k, l]));
      toast(e.message === "bad_tag" ? `المعرّف غير صحيح: ${names[e.data?.field] || ""}` : `تعذّر الحفظ (${e.message})`, "err");
    } finally { btn.disabled = false; }
  }));
  $$("[data-test]", view).forEach((btn) => (btn.onclick = async () => {
    btn.disabled = true;
    try {
      const r = await adminApi("integrations/test", "POST", { kind: btn.dataset.test, lang: "ar" });
      toast(`أُرسلت إلى ${r.to} ✓`);
    } catch (e) { toast(e.message === "email_not_configured" ? "البريد غير مُعدّ على الخادم" : "تعذّر الإرسال", "err"); }
    finally { btn.disabled = false; }
  }));
  $("#publishBtn").onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await adminApi("refresh", "POST"); toast("تم ✓ آخر التعديلات ظاهرة الآن"); } catch { toast("تعذّر التحديث", "err"); }
    finally { b.disabled = false; }
  };
}
