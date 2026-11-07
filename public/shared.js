/* WIXA — defaults and theme helpers shared by the site and the admin dashboard. */
(function () {
  const FONTS = {
    "Alexandria": "400;500;700;800",
    "Cairo": "300;400;500;700;800",
    "Tajawal": "300;400;500;700;800",
    "IBM Plex Sans Arabic": "300;400;500;600;700",
    "Readex Pro": "300;400;500;600;700",
    "Almarai": "300;400;700;800",
    "Noto Kufi Arabic": "300;400;500;700;800",
    "Rubik": "300;400;500;700;800",
    "Changa": "300;400;500;700;800",
    "El Messiri": "400;500;600;700",
  };

  const DEFAULTS = {
    theme: {
      primary: "#5B21B6",
      primaryInk: "#FFFFFF",
      accent: "#1FC8E3",
      bg: "#FBFAFE",
      surface: "#FFFFFF",
      text: "#140F1F",
      muted: "#625C70",
      dark: "#120A24",
      radius: 22,
    },
    font: { family: "Alexandria", scale: 1, headingWeight: 800 },
    brand: { name_ar: "ويكسا", name_en: "WIXA", logo_url: "" },
    contact: {
      email: "info@wixa.dev", phone: "", whatsapp: "",
      address_ar: "", address_en: "",
      instagram: "", x: "", linkedin: "", facebook: "",
    },
    // visitors' language: "auto" follows the visitor's device (Arabic devices → Arabic, others → English)
    default_lang: "auto",
    partners_style: "grid",
    iraq_map_size: 100,
    // search engines & link previews (edited in the dashboard → البحث والمشاركة)
    seo: {
      title_ar: "ويكسا — شركة برمجة وتطوير مواقع وتطبيقات في العراق",
      title_en: "WIXA — Websites, apps & software development in Iraq",
      description_ar: "ويكسا شركة تقنية تصمم وتطور المواقع والمنصات الإلكترونية وتطبيقات الجوال والأنظمة الإدارية المخصصة في العراق — من الفكرة حتى التشغيل.",
      description_en: "WIXA designs and builds websites, digital platforms, mobile apps and custom business systems in Iraq — from idea to launch.",
      keywords: "ويكسا, WIXA, تصميم مواقع, تطوير تطبيقات, برمجة أنظمة, شركة برمجة في العراق, ERP, منصات إلكترونية",
      icon_url: "", og_image: "", google_verification: "", bing_verification: "", index: true,
    },
    sections: { iraq_map: true, story: true, about: true, industries: true, guarantees: true, pricing: true, projects: true, services: true, process: true, stats: false, testimonials: true, calculator: true, partners: true, careers: true, faq: true, contact: true },
    // job openings (edited in the dashboard → المحتوى ← الوظائف). Empty list → "send us your CV" only.
    careers: { jobs: [] },
    // choices in the contact form's "service" list; empty → the services shown on the site
    contact_services: [],
    // appointment booking: off until switched on in the dashboard (المحتوى ← المواعيد); days 0 = Sunday … 6 = Saturday, Baghdad time
    booking: { on: false, days: [0, 1, 2, 3, 4], from: "10:00", to: "16:00", slot: 30, days_ahead: 14 },
    // live chat with visitors: off until switched on in the dashboard (المحادثات)
    chat: { on: false, greeting_ar: "أهلاً بك 👋 اكتب سؤالك وسنرد عليك هنا مباشرة.", greeting_en: "Hi 👋 Send us your question and we'll reply right here.",
      hours: { on: false, days: [0, 1, 2, 3, 4], from: "09:00", to: "17:00" }, nudge: { on: true, delay: 25, text_ar: "", text_en: "" } },
    // sales: a promotion bar at the top, and the "send me the estimate on WhatsApp" offer after using the calculator
    promo: { on: false, text_ar: "", text_en: "", link: "", until: "" },
    exit_offer: { on: true },
    // where each site link shows: "both" (menu + footer) · "menu" · "footer" · "hidden"; the list order is the order shown
    nav: { items: [
      { k: "home", at: "footer" }, { k: "services", at: "both" }, { k: "industries", at: "both" }, { k: "projects", at: "both" }, { k: "pricing", at: "both" },
      { k: "careers", at: "both" }, { k: "contact", at: "both" }, { k: "blog", at: "both" },
      { k: "about", at: "footer" }, { k: "partners", at: "footer" }, { k: "faq", at: "footer" },
      { k: "privacy", at: "footer" }, { k: "calc", at: "hidden" },
    ] },
    // gifts and a discount promised with every project request ("start your project"); edited in the dashboard (offers)
    request_offer: {
      gifts_on: true,
      gifts: [
        { title_ar: "هوية بصرية", text_ar: "تصميم هوية بصرية لمشروعك مجاناً", title_en: "Brand identity", text_en: "Brand identity design for your project, free" },
        { title_ar: "دعم لمدة سنة", text_ar: "صيانة ودعم فني مجاني لمدة 12 شهراً", title_en: "A year of support", text_en: "Free maintenance and support for 12 months" },
      ],
      discount: { on: false, type: "percent", value: 10, valid_days: 30, text_ar: "", text_en: "" },
    },
    // Cost estimator. Prices are in USD and are only indicative ranges — review them from the dashboard.
    calculator: {
      currency: "$",
      types: [
        { icon: "web", label_ar: "موقع شركة", label_en: "Company website", min: 800, max: 2500 },
        { icon: "cart", label_ar: "متجر إلكتروني", label_en: "Online store", min: 1500, max: 4500 },
        { icon: "mobile", label_ar: "تطبيق جوال", label_en: "Mobile app", min: 3000, max: 9000 },
        { icon: "system", label_ar: "نظام إدارة مخصص", label_en: "Custom business system", min: 4000, max: 15000 },
      ],
      features: [
        { label_ar: "عربي + إنجليزي", label_en: "Arabic + English", min: 300, max: 600 },
        { label_ar: "دفع إلكتروني", label_en: "Online payments", min: 400, max: 900 },
        { label_ar: "لوحة تحكم متقدمة", label_en: "Advanced dashboard", min: 500, max: 1500 },
        { label_ar: "مساعد ذكي (AI)", label_en: "AI assistant", min: 800, max: 2000 },
        { label_ar: "تصميم هوية بصرية", label_en: "Brand identity", min: 400, max: 1200 },
        { label_ar: "صيانة ودعم لمدة سنة", label_en: "1 year of support", min: 600, max: 1200 },
      ],
      rush: 1.3,
    },
    animations: true,
    cursor: true, // the custom pointer on computers (can be switched off in the dashboard)
    mode: "auto", // default colour mode for first-time visitors: auto | light | dark
    // Add your real numbers from the dashboard, then enable the section. Never ship placeholder figures.
    stats: [],
    content: {
      ar: {
        hero_badge: "الشريك التقني لمشاريعك",
        hero_title: "نبني المستقبل الرقمي",
        hero_sub: "ويكسا تصمم وتطور منصات وتطبيقات وأنظمة رقمية سريعة وآمنة تختصر الوقت على عملائك — من الفكرة حتى التشغيل.",
        hero_cta: "احسب تكلفة مشروعك",
        hero_cta2: "تواصل معنا",
        story: [
          { title: "لا معاملات ورقية", text: "لا ملفات ولا أختام ولا مراجعة دوائر. كل شيء رقمي وفي مكان واحد." },
          { title: "انتهى زمن الانتظار", text: "ما كان يحتاج طابوراً صار يُنجز من الهاتف خلال دقائق." },
          { title: "نبني من الفكرة حتى التشغيل", text: "نحلل، نصمم، نطور ونشغّل — ونبقى معك بعد الإطلاق." },
        ],
        projects_title: "نماذج من عملنا",
        projects_sub: "أمثلة على المنصات والتطبيقات والأنظمة التي نبنيها، ونصممها لتناسب طبيعة عملك.",
        services_title: "خدماتنا",
        services_sub: "كل ما يحتاجه مشروعك الرقمي تحت سقف واحد.",
        stats_title: "أرقام نفخر بها",
        partners_title: "شركاؤنا",
        partners_sub: "نتعاون مع مؤسسات رائدة لتقديم نتائج استثنائية.",
        cta_title: "جاهزون لإنجاز مشروعك القادم",
        cta_sub: "أخبرنا عن التحدي الذي تواجهه، وسنعود إليك بخطة عمل واضحة.",
        cta_button: "تواصل معنا",
        footer_text: "طُوّر بواسطة فريق ويكسا",
        about_title: "من نحن",
        about_text: "ويكسا شركة متخصصة في تطوير البرمجيات والحلول الرقمية. نساعد الشركات والعيادات والمتاجر وأصحاب المشاريع على تحويل أفكارهم إلى مواقع وتطبيقات وأنظمة تعمل بكفاءة وتخدم عملاءهم كل يوم.\n\nنبدأ كل مشروع بفهم عملك قبل كتابة أي سطر برمجي، ونصمّم ما يناسب طريقة عملك لا العكس، ونبقى معك بعد الإطلاق لأن نجاح مشروعك هو نجاحنا.",
        about_points: [
          { title: "نفهم عملك أولاً", text: "اجتماع تفصيلي ودراسة لاحتياجك قبل أي عرض سعر، لتحصل على ما تحتاجه فعلاً." },
          { title: "جودة وأمان", text: "تصميم احترافي، أداء سريع، وحماية لبياناتك وبيانات عملائك منذ اليوم الأول." },
          { title: "شريك بعد الإطلاق", text: "دعم فني مجاني لسنة كاملة، ثم صيانة وتطوير مستمر حسب نمو عملك." },
        ],
        industries_title: "حلول حسب مجالك",
        industries_sub: "اختر مجالك لترى ماذا نبني لأمثالك، وابدأ من الحل الأقرب لك.",
        industries: [
          { icon: "system", title: "العيادات والمراكز الطبية", text: "حجز مواعيد إلكتروني، تذكير تلقائي للمرضى، ملف طبي رقمي، وفوترة وتقارير في نظام واحد.", price: "يبدأ من 3,000$" },
          { icon: "web", title: "المتاجر والمحلات", text: "متجر إلكتروني بأقسام ومنتجات وعروض، سلة ودفع، وإدارة للطلبات والمخزون من لوحة واحدة.", price: "يبدأ من 2,500$" },
          { icon: "design", title: "الصفحات الشخصية", text: "صفحة احترافية للأطباء والمحامين والمدربين وأصحاب المهن، تعرض خدماتك وتستقبل الحجوزات والرسائل.", price: "يبدأ من 500$" },
          { icon: "cloud", title: "مواقع الشركات", text: "موقع يعرّف بشركتك وخدماتك ويجلب العملاء، بلغتين ولوحة تحكم تدير بها المحتوى بنفسك.", price: "يبدأ من 1,500$" },
          { icon: "ai", title: "مجالات أخرى", text: "مطاعم، تعليم، عقارات، خدمات حكومية وغيرها — أخبرنا عن مجالك ونقترح عليك الحل المناسب.", price: "حسب الطلب" },
        ],
        guarantees_title: "لماذا تطمئن معنا",
        guarantees_sub: "شروط واضحة من البداية، بلا مفاجآت.",
        guarantees: [
          { title: "دفعتان فقط", text: "75% عند بدء العمل، و25% بعد التسليم وفحصك للعمل والتأكد أنه كما اتفقنا." },
          { title: "دعم فني مجاني لسنة", text: "نصلح أي خلل ونجري التحديثات اللازمة مجاناً لمدة 12 شهراً من التسليم." },
          { title: "عرض سعر مكتوب وواضح", text: "تعرف التكلفة والمدة وما يشمله العمل قبل أن تبدأ، بلا تكاليف مخفية." },
          { title: "تجرّب قبل الإطلاق", text: "نسخة تجريبية تراجعها وتطلب تعديلاتك عليها قبل النشر للجمهور." },
        ],
        pricing_title: "الباقات والأسعار",
        pricing_sub: "أسعار تبدأ من 500$ — والسعر النهائي في عرض مكتوب بعد فهم احتياجك.",
        pricing_note: "الأسعار تقديرية وتختلف حسب الميزات المطلوبة. احسب تكلفة مشروعك بدقة من الحاسبة، أو اطلب عرضاً مجانياً.",
        packages: [
          { name: "صفحة شخصية", price: "500$", from: true, desc: "لأصحاب المهن والمستقلين والمشاريع الصغيرة.", features: "صفحة احترافية متجاوبة مع الجوال\nعرض خدماتك وأعمالك\nزر واتساب ونموذج تواصل\nربط بحساباتك في التواصل الاجتماعي" },
          { name: "موقع شركة", price: "1,500$", from: true, desc: "للشركات التي تريد حضوراً رقمياً يجلب العملاء.", features: "عدة صفحات بالعربي والإنجليزي\nلوحة تحكم لإدارة المحتوى\nتهيئة لمحركات البحث\nنماذج تواصل وحجز", featured: true },
          { name: "متجر إلكتروني", price: "2,500$", from: true, desc: "لبيع منتجاتك أونلاين بسهولة.", features: "أقسام ومنتجات وعروض\nسلة ودفع إلكتروني أو عند الاستلام\nإدارة الطلبات والمخزون\nتقارير المبيعات" },
          { name: "نظام إدارة أو عيادة", price: "3,000$", from: true, desc: "لتنظيم عملك الداخلي في نظام واحد.", features: "حجوزات وملفات وعملاء\nفوترة وتقارير\nصلاحيات لكل موظف\nيعمل على الحاسوب والجوال" },
          { name: "تطبيق جوال", price: "5,000$", from: true, desc: "تطبيق لأجهزة آيفون وأندرويد بتجربة سلسة.", features: "تصميم يعكس هويتك\nإشعارات فورية\nلوحة تحكم للإدارة\nالنشر في المتاجر" },
          { name: "مشاريع خاصة", price: "حسب الطلب", from: false, desc: "منصات وأنظمة كبيرة ومشاريع مخصصة.", features: "دراسة كاملة للمتطلبات\nبنية قابلة للتوسع\nفريق مخصص لمشروعك\nخطة تنفيذ على مراحل" },
        ],
        process_title: "كيف نعمل",
        process_sub: "رحلة واضحة من أول اجتماع حتى إطلاق مشروعك — ونبقى معك بعدها.",
        process: [
          { title: "نكتشف", text: "نجلس معك لنفهم عملك وأهدافك وجمهورك، ونخرج بخطة واضحة: النطاق، المدة، والتكلفة." },
          { title: "نصمّم", text: "نرسم تجربة المستخدم والهوية والواجهات، وتجرّب نموذجاً تفاعلياً قبل كتابة أي كود." },
          { title: "نطوّر", text: "نبني على مراحل قصيرة، وتتابع التقدم أسبوعياً وتجرّب بنفسك على نسخة تجريبية." },
          { title: "نطلق ونرافقك", text: "إطلاق آمن، تدريب لفريقك، ثم دعم وتحسين مستمر لينمو المنتج مع عملك." },
        ],
        testimonials_title: "ماذا يقول عملاؤنا",
        testimonials_sub: "ثقة عملائنا هي أفضل ما نفخر به.",
        calc_title: "احسب تكلفة مشروعك",
        calc_sub: "اختر نوع المشروع والميزات لتحصل على تقدير مبدئي فوري، ثم أرسل الطلب لنعود إليك بعرض دقيق.",
        calc_type: "نوع المشروع",
        calc_features: "ميزات إضافية",
        calc_speed: "مدة التنفيذ",
        calc_normal: "عادية",
        calc_rush: "مستعجلة",
        calc_result: "التكلفة التقديرية",
        calc_note: "تقدير مبدئي فقط — السعر النهائي يُحدد بعد دراسة متطلباتك.",
        calc_cta: "اطلب عرض سعر دقيق",
        details: "عرض التفاصيل",
        similar: "اطلب مشروعاً مشابهاً",
        wa_ask: "اسأل عبر واتساب",
        faq_title: "أسئلة شائعة",
        faq_sub: "إجابات سريعة عن أكثر ما يسألنا عنه العملاء.",
        faq: [
          { q: "كم يستغرق تنفيذ المشروع؟", a: "يعتمد على حجم المشروع وميزاته. بعد التعرف على متطلباتك نتفق معك على جدول زمني واضح بمراحل محددة قبل البدء." },
          { q: "كم تكلفة المشروع؟", a: "تختلف حسب نوع المشروع والميزات المطلوبة. جرّب حاسبة التكلفة في هذه الصفحة لتقدير مبدئي، ثم نرسل لك عرض سعر دقيقاً بعد دراسة متطلباتك." },
          { q: "هل تقدمون دعماً بعد التسليم؟", a: "نعم، نرافقك بعد الإطلاق بالدعم والصيانة والتحسينات، ونتفق معك على خطة الدعم المناسبة لمشروعك." },
          { q: "هل أستطيع تعديل محتوى موقعي بنفسي؟", a: "نعم، يمكننا تزويد مشروعك بلوحة تحكم سهلة تعدّل منها النصوص والصور والمحتوى دون الحاجة إلى مبرمج." },
          { q: "كيف نبدأ؟", a: "أرسل لنا رسالة من نموذج التواصل أو عبر واتساب، ونرتّب معك جلسة قصيرة لفهم فكرتك واقتراح الحل المناسب." },
        ],
        careers_title: "انضم إلى فريقنا",
        careers_sub: "نبحث دائماً عن أشخاص شغوفين بالتقنية. اطّلع على الشواغر المتاحة أو أرسل سيرتك الذاتية.",
        careers_empty: "لا توجد شواغر معلنة حالياً، لكن يسعدنا التعرف عليك — أرسل سيرتك الذاتية وسنتواصل معك عند توفر فرصة مناسبة.",
        careers_apply: "قدّم الآن",
        careers_general: "أرسل سيرتك الذاتية",
      },
      en: {
        hero_badge: "Your technology partner",
        hero_title: "Building the digital future",
        hero_sub: "WIXA designs and builds fast, secure platforms, apps and digital systems that save your customers time — from idea to launch.",
        hero_cta: "Estimate your project",
        hero_cta2: "Contact us",
        story: [
          { title: "No more paperwork", text: "No files, no stamps, no office visits. Everything digital, in one place." },
          { title: "The waiting is over", text: "What used to need a queue now takes minutes on a phone." },
          { title: "From idea to launch", text: "We analyze, design, build and run it — and stay with you after launch." },
        ],
        projects_title: "Our work",
        projects_sub: "Examples of the platforms, apps and systems we build — each tailored to how your business works.",
        services_title: "Our services",
        services_sub: "Everything your digital project needs, under one roof.",
        stats_title: "Numbers we're proud of",
        partners_title: "Our partners",
        partners_sub: "We work with leading organizations to deliver exceptional results.",
        cta_title: "Ready to build your next project",
        cta_sub: "Tell us about the challenge you face and we'll come back with a clear plan.",
        cta_button: "Contact us",
        footer_text: "Developed by the WIXA team",
        about_title: "About us",
        about_text: "WIXA is a software development and digital solutions company. We help businesses, clinics, stores and entrepreneurs turn their ideas into websites, apps and systems that work reliably and serve their customers every day.\n\nWe start every project by understanding your business before writing a single line of code, we design around the way you work, and we stay with you after launch — because your success is ours.",
        about_points: [
          { title: "We understand your business first", text: "A detailed meeting and needs study before any quote, so you get what you actually need." },
          { title: "Quality and security", text: "Professional design, fast performance and protection for your data and your customers' data from day one." },
          { title: "A partner after launch", text: "A full year of free technical support, then ongoing maintenance and growth as your business grows." },
        ],
        industries_title: "Solutions for your field",
        industries_sub: "Pick your field to see what we build for businesses like yours.",
        industries: [
          { icon: "system", title: "Clinics & medical centers", text: "Online booking, automatic patient reminders, digital records, billing and reports in one system.", price: "From $3,000" },
          { icon: "web", title: "Stores & shops", text: "An online store with categories, products and offers, cart and payment, and order and stock management.", price: "From $2,500" },
          { icon: "design", title: "Personal pages", text: "A professional page for doctors, lawyers, coaches and freelancers that shows your services and takes bookings.", price: "From $500" },
          { icon: "cloud", title: "Company websites", text: "A bilingual website that presents your company and brings in customers, with a dashboard to manage it yourself.", price: "From $1,500" },
          { icon: "ai", title: "Other fields", text: "Restaurants, education, real estate, public services and more — tell us about your field and we'll suggest the right solution.", price: "On request" },
        ],
        guarantees_title: "Why you can rely on us",
        guarantees_sub: "Clear terms from the start, no surprises.",
        guarantees: [
          { title: "Just two payments", text: "75% when work starts, 25% after delivery once you have tested it and confirmed it is as agreed." },
          { title: "One year of free support", text: "We fix any issue and apply necessary updates free of charge for 12 months after delivery." },
          { title: "A clear written quote", text: "You know the cost, the timeline and exactly what is included before we start — no hidden costs." },
          { title: "Try it before launch", text: "A preview version you review and request changes on before it goes public." },
        ],
        pricing_title: "Packages & pricing",
        pricing_sub: "Prices from $500 — the final price comes in a written quote once we understand your needs.",
        pricing_note: "Prices are estimates and depend on the features you need. Get a precise estimate from the calculator, or ask for a free quote.",
        packages: [
          { name: "Personal page", price: "$500", from: true, desc: "For professionals, freelancers and small projects.", features: "A professional mobile-friendly page\nYour services and work\nWhatsApp button and contact form\nLinks to your social accounts" },
          { name: "Company website", price: "$1,500", from: true, desc: "For companies that want an online presence that brings customers.", features: "Several pages in Arabic and English\nContent management dashboard\nSearch engine setup\nContact and booking forms", featured: true },
          { name: "Online store", price: "$2,500", from: true, desc: "Sell your products online with ease.", features: "Categories, products and offers\nCart with online or cash-on-delivery payment\nOrder and stock management\nSales reports" },
          { name: "Business or clinic system", price: "$3,000", from: true, desc: "Run your internal work in one system.", features: "Bookings, records and customers\nBilling and reports\nPer-employee permissions\nWorks on computer and phone" },
          { name: "Mobile app", price: "$5,000", from: true, desc: "An iOS and Android app with a smooth experience.", features: "Design that reflects your brand\nPush notifications\nAdmin dashboard\nStore publishing" },
          { name: "Custom projects", price: "On request", from: false, desc: "Large platforms, systems and bespoke projects.", features: "Full requirements study\nScalable architecture\nA dedicated team\nPhased delivery plan" },
        ],
        process_title: "How we work",
        process_sub: "A clear journey from the first meeting to launch — and we stay with you after.",
        process: [
          { title: "Discover", text: "We learn your business, goals and audience, then agree a clear plan: scope, timeline and cost." },
          { title: "Design", text: "We craft the experience, identity and screens, and you try an interactive prototype before any code." },
          { title: "Build", text: "We build in short sprints; you follow progress weekly and try it yourself on a test version." },
          { title: "Launch & support", text: "A safe launch, training for your team, then ongoing support and improvements as you grow." },
        ],
        testimonials_title: "What our clients say",
        testimonials_sub: "Our clients' trust is what we're proudest of.",
        calc_title: "Estimate your project",
        calc_sub: "Pick the project type and features for an instant rough estimate, then send it and we'll reply with an exact quote.",
        calc_type: "Project type",
        calc_features: "Extra features",
        calc_speed: "Timeline",
        calc_normal: "Standard",
        calc_rush: "Rush",
        calc_result: "Estimated cost",
        calc_note: "A rough estimate only — the final price follows a review of your requirements.",
        calc_cta: "Request an exact quote",
        details: "View details",
        similar: "Request a similar project",
        wa_ask: "Ask on WhatsApp",
        faq_title: "Frequently asked questions",
        faq_sub: "Quick answers to what clients ask us most.",
        faq: [
          { q: "How long does a project take?", a: "It depends on the size and features. Once we understand your requirements, we agree on a clear timeline with defined milestones before we start." },
          { q: "How much does a project cost?", a: "It varies with the type of project and the features you need. Try the cost estimator on this page for a rough figure, then we'll send an exact quote after reviewing your requirements." },
          { q: "Do you offer support after delivery?", a: "Yes. We stay with you after launch with support, maintenance and improvements, and agree on the support plan that fits your project." },
          { q: "Can I edit my site's content myself?", a: "Yes. We can give your project an easy dashboard to edit texts, images and content without needing a developer." },
          { q: "How do we start?", a: "Send us a message through the contact form or WhatsApp, and we'll set up a short call to understand your idea and suggest the right solution." },
        ],
        careers_title: "Join our team",
        careers_sub: "We're always looking for people who love technology. See our open roles or send us your CV.",
        careers_empty: "No open roles right now, but we'd love to hear from you — send your CV and we'll reach out when a suitable role opens.",
        careers_apply: "Apply now",
        careers_general: "Send your CV",
      },
    },
  };

  const ICONS = {
    web: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></svg>',
    mobile: '<svg viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="3"/><path d="M11 18.5h2"/></svg>',
    system: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/></svg>',
    design: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 100 18c1.1 0 1.6-.8 1.4-1.7-.3-1.2.5-2.3 1.7-2.3H18a3 3 0 003-3A9 9 0 0012 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15.5" cy="7.5" r="1"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0118 8.5a4.75 4.75 0 01-.5 9.5z"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><rect x="7" y="7" width="10" height="10" rx="3"/><path d="M10 12h4M12 10v4"/></svg>',
    support: '<svg viewBox="0 0 24 24"><path d="M4 13a8 8 0 0116 0"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19c0 1.5-2 2.5-5 2.5"/></svg>',
    code: '<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.5 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
    megaphone: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l7 4V6L7 10z"/><path d="M17 9a4 4 0 010 6"/></svg>',
  };

  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function merge(base, over) {
    if (!isObj(over)) return structuredClone(base);
    const out = structuredClone(base);
    for (const k of Object.keys(over)) {
      if (isObj(base[k]) && isObj(over[k])) out[k] = merge(base[k], over[k]);
      else if (over[k] !== undefined && over[k] !== null) out[k] = over[k];
    }
    return out;
  }

  // the saved link list, with any link added to the site later appended in its default place
  function navPlan(settings) {
    const def = DEFAULTS.nav.items, saved = (settings && settings.nav && Array.isArray(settings.nav.items)) ? settings.nav.items : [];
    const known = new Set(def.map((x) => x.k)), seen = new Set(), out = [];
    for (const x of saved) if (x && known.has(x.k) && !seen.has(x.k) && ["both", "menu", "footer", "hidden"].includes(x.at)) { seen.add(x.k); out.push({ k: x.k, at: x.at }); }
    for (const x of def) if (!seen.has(x.k)) out.push({ ...x });
    return out;
  }

  function hexToRgb(hex) {
    const h = String(hex || "").replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return isNaN(n) ? "0,0,0" : `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  function loadFont(family) {
    if (!FONTS[family]) family = "Alexandria";
    const id = "wixa-font";
    // Alexandria (the brand font) is hosted on the site; the other choices come from Google Fonts
    const href = family === "Alexandria" ? new URL("/fonts/alexandria.css", location.href).href
      : `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${FONTS[family]}&display=swap`;
    let link = document.getElementById(id);
    if (!link) { link = document.createElement("link"); link.id = id; link.rel = "stylesheet"; document.head.appendChild(link); }
    if (link.href !== href) link.href = href;
    return family;
  }

  // Mix two hex colors: k = share of `b` (0..1).
  // Same hue as the brand colour, but bright and saturated: reads clearly on dark backgrounds
  // (mixing with white would wash it out to a pale lavender).
  function vivid(hex, light = 0.7, minSat = 0.82) {
    let [r, g, b] = hexToRgb(hex).split(",").map((v) => Number(v) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const l0 = (mx + mn) / 2, s0 = d ? d / (1 - Math.abs(2 * l0 - 1)) : 0;
    const s = Math.max(s0, minSat), l = light;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
  }

  function mix(a, b, k) {
    const A = hexToRgb(a).split(",").map(Number), B = hexToRgb(b).split(",").map(Number);
    return "#" + A.map((v, i) => Math.round(v * (1 - k) + B[i] * k).toString(16).padStart(2, "0")).join("");
  }

  // Dark-mode colours derived from the brand colour (also shown in the dashboard's brand guide)
  function darkPalette(t) {
    return { bg: mix(t.primary, "#0B0A0E", 0.9), surface: mix(t.primary, "#16151B", 0.86), text: "#F2F0F7", muted: "#B2ACBF", dark: mix(t.primary, "#040309", 0.55), fg: vivid(t.primary) };
  }

  // Light tokens come from the dashboard; the dark palette is derived from the brand color.
  // CSS maps --bg, --surface, … to --l-* or --dk-* depending on html[data-theme].
  function applyTheme(settings, root = document.documentElement) {
    const vars = themeVars(settings, loadFont(settings.font.family));
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  }
  // The CSS variables of the theme — also used by the server to paint the right colours on the first frame
  function themeVars(settings, fam) {
    const t = settings.theme, f = settings.font;
    if (!FONTS[fam]) fam = "Alexandria";
    const dk = darkPalette(t);
    const vars = {
      "--primary": t.primary, "--primary-rgb": hexToRgb(t.primary), "--primary-ink": t.primaryInk,
      "--accent": t.accent, "--accent-rgb": hexToRgb(t.accent), "--accent-ink": mix(t.accent, "#04222A", 0.5),
      "--l-bg": t.bg, "--l-surface": t.surface, "--l-surface-rgb": hexToRgb(t.surface), "--l-text": t.text, "--l-text-rgb": hexToRgb(t.text),
      "--l-muted": t.muted, "--l-dark": t.dark, "--l-dark-rgb": hexToRgb(t.dark), "--l-fg": t.primary, "--l-fg-rgb": hexToRgb(t.primary),
      "--dk-bg": dk.bg, "--dk-surface": dk.surface, "--dk-surface-rgb": hexToRgb(dk.surface), "--dk-text": dk.text, "--dk-text-rgb": hexToRgb(dk.text),
      "--dk-muted": dk.muted, "--dk-dark": dk.dark, "--dk-dark-rgb": hexToRgb(dk.dark), "--dk-fg": dk.fg, "--dk-fg-rgb": hexToRgb(dk.fg),
      "--radius": `${Number(t.radius) || 0}px`,
      "--font": `"${fam}", system-ui, sans-serif`,
      "--scale": String(Math.min(1.4, Math.max(0.8, Number(f.scale) || 1))),
      "--hw": String(f.headingWeight || 800),
    };
    return vars;
  }

  // Red "trial version" bar shown only on the staging copy (staging.wixa.dev).
  function isStagingHost() {
    return /^staging\./.test(location.hostname) || /wixa-staging\./.test(location.hostname);
  }
  function markEnv(env) {
    if (env !== "staging" && !isStagingHost()) return;
    const root = document.documentElement;
    if (root.classList.contains("is-staging")) return;
    root.classList.add("is-staging");
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    const style = document.createElement("style");
    style.textContent = `
      .staging-bar{position:fixed;top:0;left:0;right:0;z-index:1000;height:34px;display:flex;align-items:center;justify-content:center;gap:10px;
        background:#D92D20;color:#fff;font:600 13px/1 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;letter-spacing:.01em;
        box-shadow:0 2px 10px rgba(217,45,32,.35);direction:rtl;padding:0 12px;white-space:nowrap;overflow:hidden}
      .staging-bar b{background:#fff;color:#D92D20;border-radius:6px;padding:3px 8px;font-size:12px}
      .staging-bar a{color:#fff;text-decoration:underline;text-underline-offset:3px;opacity:.9}
      .staging-bar span{overflow:hidden;text-overflow:ellipsis}
      html.is-staging body{padding-top:34px}
      html.is-staging .header{top:46px}
      html.is-staging .top{top:34px}
      html.is-staging .side{top:34px;height:calc(100vh - 34px)}
      @media (max-width:560px){.staging-bar .hide-sm{display:none}}`;
    document.head.appendChild(style);
    const bar = document.createElement("div");
    bar.className = "staging-bar";
    bar.setAttribute("role", "status");
    bar.innerHTML = '<b>نسخة تجريبية</b><span class="hide-sm">التعديلات هنا لا تظهر على الموقع الرئيسي</span><a href="https://wixa.dev" target="_blank" rel="noopener">الموقع الرئيسي ↗</a>';
    const add = () => document.body.prepend(bar);
    document.body ? add() : addEventListener("DOMContentLoaded", add, { once: true });
  }
  if (typeof document !== "undefined") markEnv();

  window.WIXA = { DEFAULTS, FONTS, ICONS, merge, navPlan, applyTheme, themeVars, loadFont, markEnv, darkPalette, vivid, mix };
})();
