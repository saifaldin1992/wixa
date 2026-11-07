/* Default privacy policy, used until it is edited in the dashboard (المحتوى ← سياسة الخصوصية).
   Shared by the Worker (renders /privacy) and the dashboard (editor). "{email}" becomes the contact email link. */
export const PRIVACY_DEFAULTS = {
  updated: "2026-11-07",
  ar: [
    { h: "من نحن", p: "هذا الموقع تديره ويكسا (WIXA). توضح هذه الصفحة البيانات التي نجمعها عند زيارتك للموقع أو تواصلك معنا، وكيف نستخدمها." },
    { h: "البيانات التي ترسلها لنا", p: "عند استخدام نموذج «تواصل معنا» أو الدردشة المباشرة أو التقديم على وظيفة نستلم ما تكتبه: الاسم، البريد الإلكتروني، رقم الهاتف، الخدمة أو الوظيفة، نص رسالتك، ورابط سيرتك الذاتية إن أضفته. نستخدمها فقط للرد عليك ومتابعة طلبك، ولا نبيعها ولا نشاركها لأغراض تسويقية." },
    { h: "الرسائل التلقائية والعروض", p: "قد يصلك بريد تأكيد تلقائي بعد إرسال النموذج. لا نرسل لك عروضاً أو أخباراً إلا إذا اخترت ذلك بنفسك عبر خانة «أرغب باستلام العروض»، ويمكنك إلغاء ذلك في أي وقت بمراسلتنا على {email}." },
    { h: "إحصاءات الزيارات", p: "نستخدم Cloudflare Web Analytics لقياس عدد الزيارات وسرعة الموقع، وهي لا تستخدم ملفات تعريف الارتباط (Cookies) ولا تتتبعك بين المواقع." },
    { h: "ملفات تعريف الارتباط", p: "يحفظ الموقع اختيارك للغة والوضع الليلي على جهازك فقط لتسهيل زيارتك القادمة." },
    { h: "الحماية", p: "نحمي النموذج من البرامج الآلية عبر Cloudflare Turnstile، وتُنقل كل البيانات عبر اتصال مشفّر (HTTPS) وتُحفظ لدى مزوّدي خدمات موثوقين (Cloudflare، وSupabase لقاعدة البيانات، وResend لإرسال البريد)." },
    { h: "مدة الاحتفاظ وحقوقك", p: "نحتفظ برسائلك طوال المدة اللازمة للرد عليك ومتابعة طلبك. يمكنك في أي وقت طلب الاطلاع على بياناتك أو تصحيحها أو حذفها عبر مراسلتنا على {email}." },
    { h: "التعديلات", p: "قد نحدّث هذه السياسة عند الحاجة، ويظهر تاريخ آخر تحديث أعلى الصفحة." },
  ],
  en: [
    { h: "Who we are", p: "This site is operated by WIXA. This page explains what data we collect when you visit the site or contact us, and how we use it." },
    { h: "Data you send us", p: "When you use the contact form, the live chat or apply for a job we receive what you enter: your name, email, phone number, the service or role, your message, and a link to your CV if you add one. We use it only to reply to you and follow up on your request. We never sell it or share it for marketing." },
    { h: "Automatic emails and offers", p: "You may receive an automatic confirmation email after sending the form. We only send you offers or news if you tick \"Send me offers and news\" yourself, and you can opt out any time by emailing {email}." },
    { h: "Visit statistics", p: "We use Cloudflare Web Analytics to count visits and measure site speed. It uses no cookies and does not track you across sites." },
    { h: "Cookies", p: "The site stores your language and dark-mode choice on your device only, to make your next visit easier." },
    { h: "Security", p: "The form is protected from bots by Cloudflare Turnstile. All data travels over an encrypted connection (HTTPS) and is stored with trusted providers (Cloudflare, Supabase for the database and Resend for email delivery)." },
    { h: "Retention and your rights", p: "We keep your messages for as long as needed to reply and follow up on your request. You can ask to see, correct or delete your data at any time by emailing {email}." },
    { h: "Changes", p: "We may update this policy when needed; the date of the last update is shown at the top of this page." },
  ],
};
