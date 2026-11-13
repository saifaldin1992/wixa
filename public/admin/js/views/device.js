/* «التطبيق والإشعارات» (الإشعارات والبريد): install the dashboard as an app on this device, and turn on the notifications
   for new chats, project orders, messages, bookings and the reminder an hour before each booking. */
import { $, I, adminApi, confirmBox, openModal, toast } from "../core.js";
import { disablePush, enablePush, isIOS, pushState, pushSupported } from "../chat-live.js";

// the browser offers installing once; keep the offer until the button is pressed
let installOffer = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installOffer = e; });
const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export async function viewDevice(box) {
  box.innerHTML = `<div class="card" id="cDevice"><div class="card__head"><div><h3>التطبيق والإشعارات</h3>
      <p>ثبّت لوحة التحكم على هذا الجهاز كتطبيق، وفعّل الإشعارات لتصلك فوراً: محادثة جديدة، طلب مشروع، رسالة، حجز موعد، وتذكير قبل كل موعد بساعة.</p></div></div>
    <div class="row" style="display:flex;flex-wrap:wrap;gap:10px">
      <button type="button" class="b" id="devInstall">${I.download || ""}ثبّت كتطبيق</button>
      <button type="button" class="b b--primary" id="devPush">${I.bell}فعّل الإشعارات على هذا الجهاز</button>
    </div>
    <p class="muted" id="devNote" style="font-size:12px;margin:10px 0 0"></p></div>`;
  const inst = $("#devInstall", box), push = $("#devPush", box), note = $("#devNote", box);
  const paint = async () => {
    inst.hidden = installed();
    const st = await pushState().catch(() => "off");
    push.dataset.state = st;
    push.innerHTML = `${I.bell}${st === "on" ? "الإشعارات مفعّلة على هذا الجهاز" : "فعّل الإشعارات على هذا الجهاز"}`;
    push.classList.toggle("b--primary", st !== "on");
    note.textContent = installed() ? "اللوحة مثبّتة كتطبيق على هذا الجهاز ✓" : isIOS() ? "على الآيفون والآيباد: ثبّت اللوحة أولاً، ثم فعّل الإشعارات من داخلها." : "";
  };
  inst.onclick = async () => {
    if (installOffer) { installOffer.prompt(); const { outcome } = await installOffer.userChoice.catch(() => ({})); installOffer = null; if (outcome === "accepted") toast("ثُبّتت اللوحة ✓"); paint(); return; }
    openModal("تثبيت لوحة التحكم كتطبيق", isIOS()
      ? `<ol style="line-height:2.2;padding-inline-start:20px"><li>افتح لوحة التحكم في Safari.</li><li>اضغط زر المشاركة (المربع والسهم).</li><li>اختر «إضافة إلى الشاشة الرئيسية».</li><li>افتح «ويكسا» من الشاشة الرئيسية، ثم فعّل الإشعارات من هنا.</li></ol>`
      : `<ol style="line-height:2.2;padding-inline-start:20px"><li>افتح قائمة المتصفح (⋮ في الأعلى).</li><li>اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</li><li>افتح «ويكسا» من الشاشة الرئيسية.</li></ol><p class="muted">إن لم يظهر الخيار، فاللوحة مثبّتة مسبقاً أو المتصفح لا يدعم التثبيت (استخدم Chrome أو Samsung Internet أو Edge).</p>`, null, true);
  };
  push.onclick = async () => {
    const st = push.dataset.state;
    if (st === "unsupported") return openModal("الإشعارات على هذا الجهاز", isIOS() ? "<p>على الآيفون والآيباد تعمل الإشعارات بعد تثبيت اللوحة كتطبيق. اضغط «ثبّت كتطبيق» واتبع الخطوات.</p>" : "<p>هذا المتصفح لا يدعم الإشعارات. استخدم Chrome أو Samsung Internet أو Edge.</p>", null, true);
    if (st === "denied") return toast("الإشعارات ممنوعة لهذا الموقع. اسمح بها من إعدادات المتصفح ثم حاول مجدداً", "err");
    push.disabled = true;
    try {
      if (st === "on") {
        if (!(await confirmBox("إيقاف الإشعارات", "لن تصل الإشعارات إلى هذا الجهاز.", "إيقاف"))) return;
        await disablePush(adminApi); toast("أُوقفت الإشعارات على هذا الجهاز");
      } else {
        const r = await enablePush(adminApi);
        toast(r.test && r.test < 300 ? "تم التفعيل ✓ وصلك إشعار تجريبي" : "تم التفعيل ✓");
      }
    } catch (e) { toast(e.message === "denied" ? "لم يُسمح بالإشعارات" : `تعذّر التفعيل (${e.message})`, "err"); }
    finally { push.disabled = false; paint(); }
  };
  if (!pushSupported() && !isIOS()) push.hidden = true;
  paint();
}
