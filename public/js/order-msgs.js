/* What a customer reads for each order stage (track page and live chat). The dashboard can replace any of them
   (المحادثات → الإعدادات → رسائل حالة الطلب); these are the defaults. No imports: shared by site and dashboard. */
export const DEFAULT_STATUS_MSGS = {
  new: { ar: "وصلنا طلبك ونراجعه الآن، وسنتصل بك خلال يوم عمل.", en: "We've received your order and are reviewing it; we'll call you within one working day." },
  contacted: { ar: "تواصلنا معك ونحدد معك تفاصيل ما تحتاجه بالضبط.", en: "We've been in touch and are pinning down exactly what you need." },
  quoted: { ar: "أرسلنا لك عرض السعر، وننتظر موافقتك لنبدأ.", en: "We've sent your quote and are waiting for your go-ahead." },
  in_progress: { ar: "العمل جارٍ على مشروعك، وتتابع التقدم على نسخة تجريبية.", en: "Work on your project is under way; you can follow progress on a test version." },
  done: { ar: "تم تسليم مشروعك. شكراً لثقتك بنا 💜", en: "Your project has been delivered. Thank you for trusting us 💜" },
  cancelled: { ar: "هذا الطلب ملغى. إن كان هذا خطأ راسلنا.", en: "This order was cancelled. If that's a mistake, message us." },
};
