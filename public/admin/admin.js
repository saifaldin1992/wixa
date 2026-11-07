// script errors in the dashboard are logged too (diagnostics page)
{
  let n = 0;
  const report = (msg, src, line) => { if (n++ >= 3 || !msg) return; try { navigator.sendBeacon("/api/client-error", new Blob([JSON.stringify({ where: "admin", msg: String(msg).slice(0, 300), src, line, path: location.pathname + location.hash })], { type: "text/plain" })); } catch {} };
  addEventListener("error", (e) => { if (e.filename || e.message) report(e.message, e.filename, e.lineno); });
  addEventListener("unhandledrejection", (e) => report(`Unhandled: ${e.reason?.message || e.reason}`, "", 0));
}
/* WIXA admin dashboard — entry. Each part lives in its own module under /admin/js/. */
import { LINK, afterSignIn, authMsg, showAuth } from "./js/auth.js";
import { sb, setSb, toast } from "./js/core.js";

(async function boot() {
  try {
    // config is built into the page by the server; the request is only a fallback
    const inline = document.getElementById("wixa-config");
    const cfg = inline ? JSON.parse(inline.textContent) : await fetch("/api/config").then((r) => r.json());
    window.WIXA.markEnv(cfg.env);
    if (cfg.env === "staging") document.title = `[تجريبي] ${document.title}`;
    setSb(window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } }));
  } catch (e) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">تعذّر الاتصال بالخادم. حدّث الصفحة.</p>';
    return;
  }
  sb.auth.onAuthStateChange((evt) => {
    if (evt === "PASSWORD_RECOVERY") { LINK.recovery = true; showAuth("reset"); }
    else if (evt === "SIGNED_OUT") showAuth();
  });
  const { data } = await sb.auth.getSession();
  if (LINK.message || LINK.emailChange || LINK.error) history.replaceState(null, "", location.pathname);
  if (LINK.recovery && data.session) return showAuth("reset");
  if (data.session) await afterSignIn(data.session.user); else showAuth();
  if (LINK.error) authMsg(/expired|invalid/i.test(LINK.error) ? "انتهت صلاحية الرابط. اطلب رابطاً جديداً." : LINK.error, "err");
  if (LINK.message) toast("تم قبول الرابط. أكّد أيضاً الرابط المرسل إلى البريد الآخر لإتمام التغيير.");
  if (LINK.emailChange) toast("تم تغيير البريد الإلكتروني ✓");
})();
