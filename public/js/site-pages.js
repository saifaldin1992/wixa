/* Stand-alone pages added from the dashboard (المحتوى ← الصفحات المستقلة ← صفحات مضافة), shared by the Worker
   (renders them) and the dashboard (editor). Until the owner saves the list, the two pages below are used: general
   wording, to be completed when the company's details are final. "{email}" becomes the contact email link.
   A page: { id, path: "/terms", title_ar, title_en, desc_ar, desc_en, published, footer, updated, ar: [{h, p}], en: [{h, p}] } */

export const PAGE_DEFAULTS = [
  {
    id: "terms", path: "/terms", published: true, footer: true, updated: "2026-11-08",
    title_ar: "الشروط والأحكام", title_en: "Terms and conditions",
    desc_ar: "الشروط التي تنظّم العمل بين ويكسا وعملائها.", desc_en: "The terms that govern work between WIXA and its clients.",
    ar: [
      { h: "عن هذه الشروط", p: "تنظّم هذه الشروط العلاقة بين ويكسا وعملائها عند طلب أي خدمة أو مشروع. بإرسال طلب أو الموافقة على عرض سعر فأنت توافق عليها. تفاصيل كل مشروع (النطاق والمدة والسعر) تُحدَّد في عرض السعر أو العقد الخاص به، وهي المرجع عند أي اختلاف." },
      { h: "نطاق العمل", p: "نلتزم بتنفيذ ما ورد في عرض السعر المعتمد. أي عمل خارج هذا النطاق يُتفق عليه كتابياً مع سعره ومدته قبل البدء به." },
      { h: "المدة والتسليم", p: "تبدأ مدة التنفيذ بعد استلام الدفعة الأولى والمحتوى والمواد المطلوبة من العميل. أي تأخير في تزويدنا بالمحتوى أو الموافقات يمدّد موعد التسليم بالقدر نفسه." },
      { h: "المراجعات والتعديلات", p: "يشمل كل مشروع عدداً من جولات التعديل يُذكر في عرض السعر. التعديلات بعد الموافقة النهائية أو بعد انتهاء الجولات تُحتسب عملاً إضافياً." },
      { h: "الملكية الفكرية", p: "بعد سداد كامل المبلغ تنتقل إلى العميل ملكية التصاميم والمحتوى الخاص بمشروعه. يحق لنا عرض المشروع ضمن نماذج أعمالنا ما لم يطلب العميل غير ذلك كتابياً. المكتبات والأدوات مفتوحة المصدر تبقى خاضعة لتراخيصها." },
      { h: "الضمان والدعم", p: "نصلح مجاناً أي خلل برمجي في ما سلّمناه خلال فترة الضمان المذكورة في عرض السعر. لا يشمل الضمان التعديلات التي يجريها طرف آخر ولا الإضافات الجديدة. الدعم والصيانة بعد فترة الضمان متاحان بباقات منفصلة." },
      { h: "الخدمات من جهات أخرى", p: "قد يعتمد المشروع على خدمات من جهات أخرى مثل الاستضافة والنطاق وبوابات الدفع والرسائل. تخضع هذه الخدمات لشروط مزوّديها وأسعارهم، ويتحمّل العميل رسومها ما لم يُذكر غير ذلك في عرض السعر." },
      { h: "السرية", p: "نحافظ على سرية المعلومات والبيانات التي يشاركها العميل معنا، ولا نستخدمها إلا لتنفيذ مشروعه." },
      { h: "إنهاء العمل", p: "يحق لأي طرف إنهاء العمل بإشعار كتابي. عندها يُحاسَب العميل على ما أُنجز حتى تاريخ الإنهاء، وفق سياسة الدفع والاسترجاع." },
      { h: "تحديث الشروط", p: "قد نحدّث هذه الشروط من وقت لآخر، ويظهر تاريخ آخر تحديث أعلى الصفحة. لا تؤثر التحديثات في المشاريع المتفق عليها قبلها." },
      { h: "التواصل", p: "لأي سؤال عن هذه الشروط راسلنا على {email}." },
    ],
    en: [
      { h: "About these terms", p: "These terms govern the relationship between WIXA and its clients for any service or project. By sending a request or accepting a quote you agree to them. Each project's details (scope, timeline and price) are set in its quote or contract, which prevails in case of any difference." },
      { h: "Scope of work", p: "We deliver what the approved quote describes. Any work outside that scope is agreed in writing, with its price and timeline, before it starts." },
      { h: "Timeline and delivery", p: "The timeline starts once we receive the first payment and the content and materials needed from the client. Any delay in content or approvals moves the delivery date by the same amount." },
      { h: "Reviews and changes", p: "Each project includes a number of revision rounds stated in the quote. Changes after final approval or beyond those rounds count as additional work." },
      { h: "Intellectual property", p: "Once paid in full, the client owns the designs and content made for their project. We may show the project in our portfolio unless the client asks us not to in writing. Open-source libraries and tools remain under their own licences." },
      { h: "Warranty and support", p: "We fix any software defect in what we delivered, free of charge, during the warranty period stated in the quote. The warranty does not cover changes made by others or new features. Support and maintenance after the warranty are available as separate plans." },
      { h: "Third-party services", p: "A project may rely on services from other providers such as hosting, domains, payment gateways and messaging. These follow their providers' terms and prices, and their fees are paid by the client unless the quote says otherwise." },
      { h: "Confidentiality", p: "We keep the information and data our clients share with us confidential and use it only to deliver their project." },
      { h: "Ending the work", p: "Either party may end the work with written notice. The client then pays for the work completed up to that date, under the payments and refunds policy." },
      { h: "Changes to these terms", p: "We may update these terms from time to time; the date of the last update is shown at the top of the page. Updates do not affect projects agreed before them." },
      { h: "Contact", p: "For any question about these terms, write to us at {email}." },
    ],
  },
  {
    id: "payment", path: "/payment", published: true, footer: true, updated: "2026-11-08",
    title_ar: "الدفع والاسترجاع", title_en: "Payments and refunds",
    desc_ar: "مراحل الدفع وطرقه، ومتى وكيف تُسترجع المبالغ.", desc_en: "How payments are staged, how to pay, and when and how refunds are made.",
    ar: [
      { h: "مراحل الدفع", p: "يُقسَّم مبلغ المشروع عادةً على مراحل العمل: دفعة أولى عند الموافقة على العرض، ودفعات عند إنجاز المراحل، والدفعة الأخيرة عند التسليم. النسب والمواعيد الدقيقة تُذكر في عرض السعر." },
      { h: "طرق الدفع", p: "قريباً يمكنك الدفع إلكترونياً عبر بوابة دفع عراقية بالبطاقات (فيزا وماستركارد) وزين كاش وكي كارد. حتى ذلك الحين نتفق معك على طريقة الدفع المناسبة عند إرسال عرض السعر." },
      { h: "الإيصالات", p: "نرسل لك إيصالاً بكل دفعة يذكر رقم الطلب والمبلغ وتاريخ الدفع." },
      { h: "الإلغاء قبل بدء العمل", p: "إذا ألغيت الطلب قبل بدء التنفيذ نعيد إليك الدفعة الأولى كاملة، بعد خصم أي رسوم دفعناها لجهات أخرى نيابةً عنك (مثل حجز النطاق)." },
      { h: "الإلغاء بعد بدء العمل", p: "بعد بدء التنفيذ تُحتسب قيمة ما أُنجز من العمل، ويُعاد إليك الفرق إن وُجد. لا تُسترجع المبالغ عن مراحل سُلّمت ووافقت عليها." },
      { h: "رسوم الجهات الأخرى", p: "رسوم الخدمات من جهات أخرى (الاستضافة والنطاق والاشتراكات) لا تُسترجع بعد دفعها لمزوّديها." },
      { h: "طريقة الاسترجاع", p: "تُعاد المبالغ المستحقة بعد الموافقة على طلب الاسترجاع، بطريقة الدفع نفسها قدر الإمكان، ونخبرك بموعدها." },
      { h: "التواصل", p: "لأي سؤال عن الدفع أو الاسترجاع راسلنا على {email} واذكر رقم طلبك." },
    ],
    en: [
      { h: "Payment stages", p: "A project's price is usually split across its stages: a first payment when the quote is accepted, payments as stages are completed, and the last payment on delivery. The exact shares and dates are in the quote." },
      { h: "How to pay", p: "Soon you will be able to pay online through an Iraqi payment gateway by card (Visa and Mastercard), Zain Cash and Qi Card. Until then we agree on the right way to pay when we send your quote." },
      { h: "Receipts", p: "We send you a receipt for every payment with the order number, the amount and the date." },
      { h: "Cancelling before work starts", p: "If you cancel before work starts we refund the first payment in full, minus any fees we paid to other providers on your behalf (such as registering a domain)." },
      { h: "Cancelling after work starts", p: "After work starts, the work completed is charged and any difference is refunded. Payments for stages delivered and approved are not refunded." },
      { h: "Third-party fees", p: "Fees for services from other providers (hosting, domains, subscriptions) cannot be refunded once paid to them." },
      { h: "How refunds are made", p: "Refunds due are made once the request is approved, by the same payment method where possible, and we tell you when to expect them." },
      { h: "Contact", p: "For any question about payments or refunds, write to us at {email} with your order number." },
    ],
  },
];

// Addresses that belong to the site itself: a page added from the dashboard can never take them.
export const RESERVED_PATHS = ["/", "/about", "/careers", "/order", "/track", "/contact", "/faq", "/privacy", "/blog", "/review",
  "/unsubscribe", "/pricing", "/team", "/status", "/health", "/sitemap.xml", "/robots.txt", "/admin", "/api", "/build", "/services",
  "/projects", "/fonts", "/img", "/icons", "/js", "/vendor", "/index.html", "/404.html"];
export const PATH_RE = /^\/[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
export const pathProblem = (p) => (!PATH_RE.test(p || "") ? "format" : RESERVED_PATHS.includes(p) ? "reserved" : "");

// the pages to show: the saved list, or the defaults until one is saved
export const sitePages = (st) => (Array.isArray(st?.pages) ? st.pages : PAGE_DEFAULTS)
  .filter((p) => p && typeof p === "object" && !pathProblem(p.path));

// The team page and the services status page (fixed addresses /team and /status): their options
export const TEAM_DEFAULTS = { on: false, footer: true, title_ar: "فريقنا", title_en: "Our team",
  sub_ar: "الأشخاص الذين يصممون ويطوّرون مشاريعكم.", sub_en: "The people who design and build your projects.", members: [] };
export const STATUS_DEFAULTS = { on: true, footer: true };
