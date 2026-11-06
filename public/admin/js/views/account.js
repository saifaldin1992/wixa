/* Account: email, password, two-step verification, backup */
import { codeField } from "../auth.js";
import { $, I, confirmBox, esc, sb, setUser, toast, user } from "../core.js";
import { route } from "../shell.js";

// ---------------- view: account ----------------
// Download everything editable as one JSON file (content backup).
export async function exportBackup(btn) {
  btn.disabled = true;
  try {
    const tables = ["projects", "services", "partners", "testimonials"];
    const [s, ...rows] = await Promise.all([
      sb.from("site_settings").select("data").eq("id", 1).maybeSingle(),
      ...tables.map((t) => sb.from(t).select("*").order("sort")),
    ]);
    const err = [s, ...rows].find((r) => r.error); if (err) throw err.error;
    const dump = { exported_at: new Date().toISOString(), site: location.host, settings: s.data?.data || {} };
    tables.forEach((t, i) => (dump[t] = rows[i].data));
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `wixa-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("تم تنزيل النسخة الاحتياطية ✓");
  } catch (e) { toast(`فشل التصدير: ${e.message}`, "err"); }
  finally { btn.disabled = false; }
}

export async function viewAccount(view) {
  const { data: { user: u } } = await sb.auth.getUser();
  if (u) setUser(u);
  const { data: fx } = await sb.auth.mfa.listFactors();
  const totp = fx?.totp?.find((x) => x.status === "verified");
  const card = (body) => `<div class="card" style="max-width:560px">${body}</div>`;
  view.innerHTML = card(`<div class="card__head"><div><h3>الحساب</h3><p dir="ltr" style="text-align:right">${esc(user.email)}</p></div>
      <button class="b b--danger" id="logout">${I.out}تسجيل الخروج</button></div>`)
    + card(`<div class="card__head"><div><h3>تغيير بريد تسجيل الدخول</h3><p>البريد الذي تدخل به إلى لوحة التحكم فقط. بريد التواصل الظاهر في الموقع يبقى كما هو (يُعدَّل من المحتوى ← التواصل). سنرسل رابط تأكيد إلى البريد الحالي والجديد، ويتم التغيير بعد تأكيدهما.</p></div></div>
      ${user.new_email ? `<p class="muted" style="margin:0 0 12px">بانتظار التأكيد: <b dir="ltr">${esc(user.new_email)}</b></p>` : ""}
      <form id="emailForm" class="stack"><label class="f"><span>البريد الجديد</span><input name="email" type="email" required autocomplete="email" dir="ltr"></label>
      <button class="b b--primary" style="justify-self:start">${I.mail}إرسال رابط التأكيد</button></form>`)
    + card(`<div class="card__head"><div><h3>التحقق بخطوتين ${totp ? '<span class="pill ok">مفعّل</span>' : ""}</h3>
      <p>${totp ? "عند الدخول يُطلب رمز من تطبيق المصادقة في هاتفك، فلا يكفي معرفة كلمة المرور وحدها." : "حماية إضافية: بعد كلمة المرور يُطلب رمز من تطبيق في هاتفك مثل Google Authenticator أو Microsoft Authenticator."}</p></div>
      <button class="b ${totp ? "b--danger" : "b--primary"}" id="mfaBtn">${totp ? "إيقاف" : "تفعيل"}</button></div><div id="mfaSetup"></div>`)
    + card(`<div class="card__head"><h3>تغيير كلمة المرور</h3></div>
      <form id="pwForm" class="stack"><label class="f"><span>كلمة المرور الجديدة</span><input name="p1" type="password" minlength="8" required autocomplete="new-password" dir="ltr"></label>
      <label class="f"><span>تأكيد كلمة المرور</span><input name="p2" type="password" minlength="8" required autocomplete="new-password" dir="ltr"></label>
      <button class="b b--primary" style="justify-self:start">${I.save}تحديث</button></form>`)
    + card(`<div class="card__head"><div><h3>نسخة احتياطية للمحتوى</h3><p>نزّل كل النصوص والمشاريع والخدمات والشركاء والآراء في ملف واحد. يُنصح بتنزيلها بعد كل تعديل كبير.</p></div>
      <button class="b b--primary" id="backupBtn">${I.upload}تنزيل</button></div>`);

  $("#backupBtn").onclick = (e) => exportBackup(e.currentTarget);
  $("#logout").onclick = async () => { await sb.auth.signOut(); location.hash = ""; };
  $("#pwForm").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    if (f.p1.value !== f.p2.value) return toast("كلمتا المرور غير متطابقتين", "err");
    const { error } = await sb.auth.updateUser({ password: f.p1.value });
    if (error) return toast(/different from the old/i.test(error.message) ? "اختر كلمة مرور مختلفة عن السابقة" : error.message, "err");
    f.reset(); toast("تم تحديث كلمة المرور ✓");
  };
  $("#emailForm").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target, email = f.email.value.trim();
    if (email.toLowerCase() === user.email.toLowerCase()) return toast("هذا هو بريدك الحالي", "err");
    const btn = f.querySelector("button"); btn.disabled = true;
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: `${location.origin}/admin/` });
    btn.disabled = false;
    if (error) return toast(/rate limit|seconds/i.test(error.message) ? "محاولات كثيرة، انتظر قليلاً" : /already/i.test(error.message) ? "هذا البريد مستخدم في حساب آخر" : error.message, "err");
    toast("أرسلنا رابط التأكيد. افتح البريدين واضغط الرابط في كل منهما.");
    route();
  };
  $("#mfaBtn").onclick = async () => {
    if (totp) {
      if (!(await confirmBox("إيقاف التحقق بخطوتين", "سيصبح الدخول بكلمة المرور فقط. هل أنت متأكد؟", "إيقاف"))) return;
      const { error } = await sb.auth.mfa.unenroll({ factorId: totp.id });
      if (error) return toast(error.message, "err");
      await sb.auth.refreshSession();
      toast("تم إيقاف التحقق بخطوتين"); return route();
    }
    // clear any half-finished setup, then start a new one
    for (const x of fx?.all || []) if (x.status !== "verified") await sb.auth.mfa.unenroll({ factorId: x.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `WIXA ${Date.now()}`, issuer: "WIXA" });
    if (error) return toast(error.message, "err");
    $("#mfaBtn").hidden = true;
    $("#mfaSetup").innerHTML = `<ol class="mfa">
        <li>ثبّت تطبيق مصادقة في هاتفك (Google Authenticator أو Microsoft Authenticator).</li>
        <li>امسح هذا الرمز من التطبيق:<div class="mfa__qr"><img alt="رمز QR" src="${esc(data.totp.qr_code)}" width="180" height="180"></div>
          أو أدخل المفتاح يدوياً: <code dir="ltr" class="mfa__secret">${esc(data.totp.secret)}</code></li>
        <li>أدخل الرمز الذي يظهر في التطبيق:</li></ol>
      <form id="mfaForm" class="stack">${codeField}
        <div class="row" style="gap:8px"><button class="b b--primary">${I.save}تأكيد التفعيل</button><button class="b" type="button" id="mfaCancel">إلغاء</button></div></form>`;
    $("#mfaSetup input").focus();
    $("#mfaCancel").onclick = async () => { await sb.auth.mfa.unenroll({ factorId: data.id }); route(); };
    $("#mfaForm").onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: e.target.code.value.replace(/\s/g, "") });
      if (error) return toast("الرمز غير صحيح، جرّب الرمز الحالي في التطبيق", "err");
      toast("تم تفعيل التحقق بخطوتين ✓"); route();
    };
  };
}
