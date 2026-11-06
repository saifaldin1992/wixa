/* Sign-in, two-step verification, password reset and entering the dashboard */
import { $, adminApi, rememberOwner, sb, setUser, toast } from "./core.js";
import { loadSettings } from "./settings.js";
import { route, setupShell } from "./shell.js";
import { refreshMsgCount } from "./views/messages.js";

// links from Supabase emails (password reset, email change) land here with details in the URL hash
export const LINK = (() => {
  const h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
  return { recovery: h.get("type") === "recovery" || q.get("type") === "recovery", emailChange: h.get("type") === "email_change",
    message: h.get("message"), error: h.get("error_description") || q.get("error_description") };
})();

// ---------------- auth ----------------
// modes: login · forgot (send reset link) · reset (set a new password from the link) · mfa (6-digit code)
export const authMsg = (text, type = "") => { const m = $("#authMsg"); m.className = `auth__msg ${type}`; m.textContent = text; };
export const needsCode = async () => { const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); return data?.nextLevel === "aal2" && data.currentLevel !== "aal2"; };
export async function verifyCode(code) {
  const { data } = await sb.auth.mfa.listFactors();
  const f = data?.totp?.find((x) => x.status === "verified");
  if (!f) throw new Error("no factor");
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: code.replace(/\s/g, "") });
  if (error) throw new Error("bad code");
}
export const codeField = `<label class="f"><span>رمز التحقق من تطبيق المصادقة</span><input name="code" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autocomplete="one-time-code" dir="ltr" placeholder="000000"></label>`;

export async function showAuth(mode = "login") {
  setUser(null);
  $("#app").hidden = true; $("#auth").hidden = false;
  const form = $("#authForm"), sw = $("#authSwitch");
  const withCode = mode === "reset" && (await needsCode().catch(() => false));
  const M = {
    login: ["تسجيل الدخول", "أدخل بريدك وكلمة المرور للدخول إلى لوحة التحكم.", "دخول", "نسيت كلمة المرور؟",
      `<label class="f"><span>البريد الإلكتروني</span><input name="email" type="email" required autocomplete="email" dir="ltr"></label>
       <label class="f"><span>كلمة المرور</span><input name="password" type="password" required minlength="8" autocomplete="current-password" dir="ltr"></label>`],
    forgot: ["استعادة كلمة المرور", "أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.", "إرسال الرابط", "رجوع لتسجيل الدخول",
      `<label class="f"><span>البريد الإلكتروني</span><input name="email" type="email" required autocomplete="email" dir="ltr"></label>`],
    reset: ["كلمة مرور جديدة", "اختر كلمة مرور قوية (8 أحرف على الأقل).", "حفظ والدخول", "إلغاء",
      `<label class="f"><span>كلمة المرور الجديدة</span><input name="p1" type="password" required minlength="8" autocomplete="new-password" dir="ltr"></label>
       <label class="f"><span>تأكيد كلمة المرور</span><input name="p2" type="password" required minlength="8" autocomplete="new-password" dir="ltr"></label>${withCode ? codeField : ""}`],
    mfa: ["التحقق بخطوتين", "افتح تطبيق المصادقة في هاتفك وأدخل الرمز المكوّن من 6 أرقام.", "تحقق", "تسجيل الخروج", codeField],
  }[mode];
  $("#authTitle").textContent = M[0]; $("#authHint").textContent = M[1];
  $("#authSubmit").textContent = M[2]; sw.textContent = M[3];
  $("#authFields").innerHTML = M[4];
  authMsg("");
  setTimeout(() => $("#authFields input")?.focus(), 30);
  sw.onclick = async () => {
    if (mode === "login") return showAuth("forgot");
    if (mode === "forgot") return showAuth("login");
    await sb.auth.signOut(); showAuth("login");
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = (n) => form.elements[n]?.value || "";
    $("#authSubmit").disabled = true; authMsg("لحظة…");
    try {
      if (mode === "login") {
        const { data, error } = await sb.auth.signInWithPassword({ email: v("email").trim(), password: v("password") });
        if (error) throw error;
        await afterSignIn(data.user);
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(v("email").trim(), { redirectTo: `${location.origin}/admin/` });
        if (error) throw error;
        authMsg("إذا كان البريد مسجّلاً فسيصلك رابط خلال دقائق. افتحه من نفس الجهاز.", "ok");
      } else if (mode === "reset") {
        if (v("p1") !== v("p2")) throw new Error("mismatch");
        if (withCode) await verifyCode(v("code"));
        const { data, error } = await sb.auth.updateUser({ password: v("p1") });
        if (error) throw error;
        LINK.recovery = false;
        toast("تم تعيين كلمة المرور الجديدة ✓");
        await afterSignIn(data.user);
      } else if (mode === "mfa") {
        await verifyCode(v("code"));
        const { data } = await sb.auth.getUser();
        await enter(data.user);
      }
    } catch (err) {
      const t = err.message || "";
      authMsg(/Invalid login/i.test(t) ? "البريد أو كلمة المرور غير صحيحة."
        : /not confirmed/i.test(t) ? "لم يتم تأكيد البريد بعد. افتح رسالة التأكيد في بريدك."
        : /bad code|invalid totp|code/i.test(t) ? "الرمز غير صحيح أو انتهت مدته. جرّب الرمز الحالي."
        : t === "mismatch" ? "كلمتا المرور غير متطابقتين."
        : /rate limit|too many|seconds/i.test(t) ? "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة."
        : /same.*password|different from the old/i.test(t) ? "اختر كلمة مرور مختلفة عن السابقة."
        : t, "err");
    } finally { $("#authSubmit").disabled = false; }
  };
}

// after a password sign-in: ask for the 2FA code when the account has it turned on
export async function afterSignIn(u) {
  if (await needsCode().catch(() => false)) return showAuth("mfa");
  await enter(u);
}

export async function enter(u) {
  // the admin check and the site settings load together
  const [{ data: isAdmin, error }] = await Promise.all([sb.rpc("is_admin"), loadSettings()]);
  if (error || !isAdmin) {
    await sb.auth.signOut();
    showAuth();
    const msg = $("#authMsg"); msg.className = "auth__msg err";
    msg.textContent = "هذا الحساب ليس لديه صلاحية المدير.";
    return;
  }
  setUser(u);
  $("#auth").hidden = true; $("#app").hidden = false;
  setupShell();
  route();
  adminApi("integrations").then(rememberOwner).catch(() => {}); // keeps the real site visible to the owner during maintenance
  refreshMsgCount();
}
