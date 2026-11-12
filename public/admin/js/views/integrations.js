/* Integrations: new-message alerts, auto-reply to visitors, analytics & ad pixels, spam protection,
   maintenance mode, "publish now", and the Wayl payment gateway (add-on, webhooks, key). Stored privately on the server (Cloudflare), not in the public site settings. */
import { $, $$, I, adminApi, confirmBox, esc, rememberOwner, toast } from "../core.js";
import { restoreDialog } from "../restore.js";

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
  const pay = cfg.payments || {}, wayl = cfg.wayl || {}, events = cfg.pay_events || [];
  const hookUrl = pay.webhook_token ? `${location.origin}/api/pay/wayl/${pay.webhook_token}` : "يُنشأ عند أول حفظ";
  view.innerHTML = `<div class="ints">
    <div class="card" id="cPublish"><div class="card__head"><div><h3>تحديث الموقع الآن</h3>
      <p>تعديلاتك تظهر تلقائياً فور الحفظ. استخدم هذا الزر إن لم تظهر بعد لسبب ما.</p></div>
      <button class="b b--primary" id="publishBtn">${I.reset}تحديث الآن</button></div></div>

    <div class="card" id="cAlerts"><div class="card__head"><div><h3>تنبيهات الرسائل الجديدة</h3>
      <p>بريد يصلك مع كل رسالة من نموذج «تواصل معنا». عنوان الاستلام في «بريد تنبيهات الرسائل» أسفل هذه البطاقة.</p></div></div>
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

    <div class="card" id="cReports"><div class="card__head"><div><h3>التقارير والمراقبة</h3>
      <p>تصل على بريد التنبيهات نفسه.</p></div></div>
      <div class="stack">
        ${sw("weeklyOn", cfg.reports?.weekly !== false, "تقرير أسبوعي كل أحد صباحاً: الزوار والرسائل وطلبات التوظيف وأكثر خدمة طُلبت")}
        ${sw("monitorOn", cfg.reports?.monitor !== false, "مراقبة الموقع كل ١٥ دقيقة: بريد فوري إذا توقفت قاعدة البيانات أو الموقع، وآخر عند العودة")}
        ${sw("remindOn", cfg.reports?.reminders !== false, "تذكير صباحي: الزبائن الذين حان موعد متابعتهم، والمحادثات التي تنتظر ردك منذ أكثر من يوم")}
        <div class="row-btns">${save()}<button class="b" data-test="weekly">${I.mail}أرسل لي التقرير الآن</button></div>
      </div></div>

    <div class="card" id="cBackup"><div class="card__head"><div><h3>النسخة الاحتياطية التلقائية</h3>
      <p>ملف فيه كل محتوى الموقع (الإعدادات والنصوص والمشاريع والخدمات والشركاء والآراء والمقالات والرسائل) يصل إلى بريد التنبيهات.</p></div></div>
      <div class="stack">
        <div class="seg seg--wide" id="bkFreq">${[["daily", "يومية"], ["weekly", "أسبوعية (الأحد)"], ["monthly", "شهرية (يوم 1)"], ["off", "متوقفة"]].map(([k, l]) => `<button type="button" data-v="${k}" class="${(cfg.backup?.freq || "weekly") === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <p class="muted" style="margin:0;font-size:12px">تُرسل الساعة 6:23 صباحاً بتوقيت بغداد. ${cfg.backup_last ? `آخر نسخة: ${new Date(cfg.backup_last.at).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" })} (${Math.round((cfg.backup_last.size || 0) / 1024)} KB)` : "لم تُرسل أي نسخة بعد."}</p>
        <div class="row-btns">${save()}<button class="b" data-test="backup">${I.mail}أرسل نسخة الآن</button><button class="b" type="button" id="restoreBtn">${I.upload}استرجاع من نسخة احتياطية</button></div>
      </div></div>

    <div class="card" id="cTpl"><div class="card__head"><div><h3>الردود الجاهزة</h3>
      <p>نصوص تختارها بضغطة عند الرد على رسالة (بالبريد أو واتساب). اكتب <code>{name}</code> ليُستبدل باسم المرسل.</p></div></div>
      <div class="stack"><div id="tplList" class="stack"></div>
        <div class="row-btns"><button class="b b--sm" type="button" id="tplAdd">${I.plus}إضافة رد</button>${save()}</div></div></div>

    <div class="card" id="cTags"><div class="card__head"><div><h3>أدوات القياس والإعلانات</h3>
      <p>الصق المعرّف فقط وتعمل الأداة على الموقع. اتركه فارغاً لإيقافها. إرسال نموذج التواصل يُحسب «عميلاً محتملاً» (Lead) في كل أداة مفعّلة.</p></div></div>
      <div class="grid2">${TAGS.map(([k, label, ph, hint]) => `<label class="f"><span>${label}</span>
        <input data-tag="${k}" dir="ltr" placeholder="${ph}" value="${esc(cfg.tags[k] || "")}"><small class="hint muted">${hint}</small></label>`).join("")}</div>
      <p class="muted" style="margin:10px 0 0;font-size:12px">إحصاءات Cloudflare في «الرئيسية» تعمل دائماً ولا تحتاج شيئاً من هذا.</p>
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

    <div class="card" id="cAddons"><div class="card__head"><div><h3>الإضافات</h3><p>خدمات خارجية تُربط بالموقع.</p></div></div>
      <div class="addon">
        <span class="addon__ico addon__ico--wayl" aria-hidden="true">W</span>
        <div class="addon__main"><b>Wayl — بوابة الدفع الإلكتروني</b><span class="muted">فيزا وماستركارد وزين كاش وكي كارد، من صفحة الطلب ومن عرض السعر.</span></div>
        <span class="pill ${pay.on ? "ok" : wayl.has_key ? "warn" : "off"}">${pay.on ? "مفعّل" : wayl.has_key ? "مربوط — غير مفعّل" : "غير مربوط"}</span>
      </div>
      <div class="stack" style="margin-top:12px">
        ${sw("payOn", pay.on, "تفعيل الدفع الإلكتروني في الموقع")}
        <label class="f" style="max-width:260px"><span>الوضع</span><select id="payMode"><option value="test" ${pay.mode !== "live" ? "selected" : ""}>تجريبي (لا تُسحب أموال)</option><option value="live" ${pay.mode === "live" ? "selected" : ""}>حقيقي</option></select></label>
        <p class="muted" style="margin:0;font-size:12px">${wayl.has_key ? "" : "يلزم حفظ مفتاح Wayl أولاً من «المفاتيح». "}زر الدفع يظهر للزبائن بعد توقيع العقد وإكمال الربط وتجربته في الوضع التجريبي.</p>
        <div class="row-btns">${save()}</div>
      </div></div>

    <div class="card" id="cHooks"><div class="card__head"><div><h3>Webhooks</h3><p>رابط يرسل إليه Wayl إشعاراً عند كل دفعة أو استرجاع. انسخه وضعه في لوحة Wayl.</p></div></div>
      <div class="stack">
        ${sw("hookOn", pay.webhook_on, "استقبال إشعارات Wayl")}
        <label class="f"><span>رابط الإشعارات</span><div class="hook-url"><input id="hookUrl" dir="ltr" readonly value="${esc(hookUrl)}"><button type="button" class="b b--sm" id="hookCopy">نسخ</button></div></label>
        <p class="muted" style="margin:0;font-size:12px">الرابط سرّي: لا تنشره. إذا ظننت أن أحداً عرفه اضغط «رابط جديد» ثم ضع الجديد في لوحة Wayl.</p>
        <div class="row-btns">${save()}<button type="button" class="b" id="hookNew">${I.reset}رابط جديد</button></div>
        <div class="sec-title">آخر الإشعارات</div>
        ${events.length ? `<div class="hook-ev">${events.map((e) => `<div><span dir="ltr">${esc(new Date(e.at).toLocaleString("ar-IQ-u-nu-latn", { timeZone: "Asia/Baghdad", dateStyle: "short", timeStyle: "short" }))}</span><b dir="ltr">${esc(e.event)}</b>${e.ref ? `<span dir="ltr">${esc(e.ref)}</span>` : ""}${e.amount ? `<span dir="ltr">${esc(e.amount)}</span>` : ""}</div>`).join("")}</div>`
          : '<p class="muted" style="margin:0">لم يصل أي إشعار بعد.</p>'}
      </div></div>

    <div class="card" id="cKeys"><div class="card__head"><div><h3>المفاتيح</h3><p>مفتاح Wayl (API key) من لوحة Wayl ← المفاتيح ← «إنشاء مفتاح».</p></div></div>
      <div class="stack">
        <p style="margin:0">${wayl.has_key ? `<span class="pill ok">محفوظ</span> ينتهي بـ <b dir="ltr">••••${esc(wayl.key_hint)}</b>` : '<span class="pill off">لا يوجد مفتاح</span>'}</p>
        <label class="f"><span>${wayl.has_key ? "استبدال المفتاح" : "المفتاح"}</span><input id="waylKey" type="password" dir="ltr" autocomplete="off" spellcheck="false" maxlength="300" placeholder="الصق المفتاح هنا"></label>
        <p class="muted" style="margin:0;font-size:12px">يُحفظ على الخادم فقط ولا يظهر مرة أخرى، ولا يراه أي عضو في الفريق.</p>
        <div class="row-btns"><button type="button" class="b b--primary" id="keySave">${I.save}حفظ المفتاح</button>${wayl.has_key ? `<button type="button" class="b b--danger" id="keyDel">${I.trash}حذف المفتاح</button>` : ""}</div>
      </div></div>
  </div>`;

  const val = (id) => $(`#${id}`).value;
  const chk = (id) => $(`#${id}`).checked;
  const bodyFor = {
    cAlerts: () => ({ alerts: { on: chk("alertsOn"), from_name: val("fromName") } }),
    cReply: () => ({ autoreply: { on: chk("replyOn"), subject_ar: val("subAr"), subject_en: val("subEn"), body_ar: val("bodyAr"), body_en: val("bodyEn") } }),
    cReports: () => ({ reports: { weekly: chk("weeklyOn"), monitor: chk("monitorOn"), reminders: chk("remindOn") } }),
    cBackup: () => ({ backup: { freq: $("#bkFreq .on")?.dataset.v || "weekly" } }),
    cTpl: () => ({ templates: $$("#tplList .tpl").map((r) => ({ title: $(".tpl__t", r).value, body: $(".tpl__b", r).value })) }),
    cTags: () => ({ tags: Object.fromEntries($$("[data-tag]").map((i) => [i.dataset.tag, i.value.trim()])) }),
    cSpam: () => ({ spam: { turnstile: chk("tsOn"), blocked: val("blocked") } }),
    cMaint: () => ({ maintenance: { on: chk("maintOn"), message_ar: val("mAr"), message_en: val("mEn") } }),
    cAddons: () => ({ payments: { ...pay, on: chk("payOn"), mode: val("payMode") } }),
    cHooks: () => ({ payments: { ...pay, webhook_on: chk("hookOn") } }),
  };
  $("#restoreBtn").onclick = () => restoreDialog();
  // Wayl: the secret key goes to the server only; the page never receives it back
  const reload = () => viewIntegrations(view);
  $("#keySave").onclick = async () => {
    const k = $("#waylKey").value.trim();
    if (k.length < 8) return toast("الصق مفتاح Wayl كاملاً", "err");
    try { await adminApi("integrations", "PUT", { wayl_key: k }); toast("حُفظ المفتاح ✓"); reload(); }
    catch (e) { toast(e.message === "bad_key" ? "المفتاح فيه رموز غير صحيحة" : `تعذّر الحفظ (${e.message})`, "err"); }
  };
  if ($("#keyDel")) $("#keyDel").onclick = async () => {
    if (!(await confirmBox("حذف المفتاح", "يتوقف الدفع الإلكتروني إلى أن تحفظ مفتاحاً جديداً.", "حذف"))) return;
    try { if (pay.on) await adminApi("integrations", "PUT", { payments: { ...pay, on: false } }); await adminApi("integrations", "PUT", { wayl_key: "" }); toast("حُذف المفتاح"); reload(); }
    catch (e) { toast(`تعذّر الحذف (${e.message})`, "err"); }
  };
  $("#hookCopy").onclick = async () => { try { await navigator.clipboard.writeText($("#hookUrl").value); toast("نُسخ الرابط ✓"); } catch { $("#hookUrl").select(); } };
  $("#hookNew").onclick = async () => {
    if (!(await confirmBox("رابط جديد", "يتوقف الرابط الحالي فوراً. ضع الرابط الجديد في لوحة Wayl.", "إنشاء رابط جديد", false))) return;
    try { await adminApi("integrations", "PUT", { payments: { ...pay, webhook_on: chk("hookOn"), new_token: true } }); toast("أُنشئ رابط جديد ✓"); reload(); }
    catch (e) { toast(`تعذّر (${e.message})`, "err"); }
  };
  $$("#bkFreq button").forEach((b) => (b.onclick = () => $$("#bkFreq button").forEach((x) => x.classList.toggle("on", x === b))));
  const drawTpl = (list) => {
    $("#tplList").innerHTML = list.map((t) => `<div class="tpl"><input class="tpl__t" maxlength="60" placeholder="عنوان الرد" value="${esc(t.title)}"><textarea class="tpl__b" rows="3" maxlength="2000" placeholder="نص الرد">${esc(t.body)}</textarea><button type="button" class="b b--icon b--ghost b--danger" data-tpldel title="حذف">${I.trash}</button></div>`).join("") || '<p class="muted" style="margin:0">لا توجد ردود جاهزة.</p>';
    $$("[data-tpldel]").forEach((b) => (b.onclick = () => b.closest(".tpl").remove()));
  };
  drawTpl(cfg.templates || []);
  $("#tplAdd").onclick = () => { const cur = bodyFor.cTpl().templates; cur.push({ title: "", body: "" }); drawTpl(cur); };
  $$("[data-save]", view).forEach((btn) => (btn.onclick = async () => {
    const card = btn.closest(".card");
    btn.disabled = true;
    try {
      cfg = await adminApi("integrations", "PUT", bodyFor[card.id]());
      rememberOwner(cfg);
      if (card.id === "cTags") $$("[data-tag]").forEach((i) => (i.value = cfg.tags[i.dataset.tag] || ""));
      if (card.id === "cAddons" || card.id === "cHooks") { toast("تم الحفظ ✓"); return reload(); }
      if (card.id === "cMaint") { const p = $("#maintPill"); p.textContent = cfg.maintenance.on ? "مفعّل" : "متوقف"; p.classList.toggle("warn", cfg.maintenance.on); }
      toast(card.id === "cMaint" && cfg.maintenance.on ? "تم ✓ الزوار يرون صفحة «نعود قريباً» خلال دقيقة" : "تم الحفظ ✓ يعمل خلال دقيقة");
    } catch (e) {
      const names = Object.fromEntries(TAGS.map(([k, l]) => [k, l]));
      toast(e.message === "bad_tag" ? `المعرّف غير صحيح: ${names[e.data?.field] || ""}` : e.message === "no_key" ? "احفظ مفتاح Wayl أولاً من «المفاتيح»" : `تعذّر الحفظ (${e.message})`, "err");
    } finally { btn.disabled = false; }
  }));
  $$("[data-test]", view).forEach((btn) => (btn.onclick = async () => {
    btn.disabled = true;
    try {
      const r = await adminApi("integrations/test", "POST", { kind: btn.dataset.test, lang: "ar" });
      toast(btn.dataset.test === "backup" ? `أُرسلت النسخة إلى ${r.to} ✓` : `أُرسلت إلى ${r.to} ✓`);
    } catch (e) { toast(e.message === "email_not_configured" ? "البريد غير مُعدّ على الخادم" : "تعذّر الإرسال", "err"); }
    finally { btn.disabled = false; }
  }));
  $("#publishBtn").onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await adminApi("refresh", "POST"); toast("تم ✓ آخر التعديلات ظاهرة الآن"); } catch { toast("تعذّر التحديث", "err"); }
    finally { b.disabled = false; }
  };
}
