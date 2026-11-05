/* WIXA — site behaviour */
(() => {
  // ====== Company settings: edit these ======
  const CONFIG = {
    whatsapp: "", // e.g. "9665XXXXXXXX" (international format, digits only)
    whatsappDisplay: "+000 00 000 0000",
    email: "hello@wixa.tech",
  };

  // ====== Content (AR / EN) ======
  const I18N = {
    ar: {
      "nav.services": "الخدمات", "nav.process": "طريقتنا", "nav.about": "من نحن", "nav.contact": "تواصل", "nav.cta": "ابدأ مشروعك",
      "hero.tag": "متاحون لمشاريع جديدة", "hero.est": "استوديو تقني / ٢٠٢٦",
      "hero.l1": "نحوّل الأفكار", "hero.l2": "إلى", "hero.l3": "تُحَس.",
      "hero.words": ["منتجات", "مواقع", "تطبيقات", "أنظمة", "تجارب"],
      "hero.lead": "ويكسا استوديو تقني يصمّم ويبني مواقع وتطبيقات وأنظمة رقمية بعناية الحِرفي — تقنية تعمل بصمت، وتجربة يتذكّرها الناس.",
      "hero.scroll": "اكتشف المزيد • اكتشف المزيد •",
      "services.title": "ماذا نصنع", "services.sub": "خدمات متكاملة من الفكرة إلى الإطلاق — وما بعده.",
      "about.statement": "لا نكتب كوداً فقط. نصغي، نفهم عملك، ثم نبني شيئاً يشبهك — سريعاً، آمناً، وجميلاً بما يكفي ليُحَب.",
      "stats.projects": "مشروع مُنجز", "stats.satisfaction": "رضا العملاء", "stats.support": "دعم فني", "stats.years": "سنوات خبرة",
      "process.title": "كيف نعمل",
      "values.title": "لماذا ويكسا",
      "contact.l1": "لنصنع", "contact.l2": "شيئاً مذهلاً", "contact.sub": "أخبرنا عن فكرتك، وسنعود إليك خلال يوم عمل واحد.",
      "contact.emailLabel": "البريد", "contact.phoneLabel": "واتساب",
      "form.name": "الاسم", "form.email": "البريد الإلكتروني", "form.phone": "رقم الجوال (اختياري)", "form.service": "ما الذي تحتاجه؟",
      "form.message": "حدّثنا عن مشروعك", "form.send": "أرسل الرسالة",
      "form.sending": "جارٍ الإرسال…", "form.ok": "وصلت رسالتك ✓ سنتواصل معك قريباً.", "form.err": "تعذّر الإرسال، حاول مرة أخرى أو راسلنا على واتساب.",
      "form.invalid": "رجاءً أكمل الحقول المطلوبة بشكل صحيح.",
      "footer.line": "صُنع بشغف — من الفكرة إلى الإطلاق.", "footer.top": "للأعلى ↑", "footer.rights": "جميع الحقوق محفوظة",
      cursor: { go: "ابدأ", scroll: "انزل", send: "أرسل", chat: "تحدث", open: "افتح" },
      services: [
        { t: "تطوير المواقع", d: "مواقع سريعة ومتجاوبة تُبنى لتبيع وتُقنع، من الصفحات التعريفية إلى المنصات المعقدة والمتاجر الإلكترونية.", tags: ["مواقع الشركات", "المتاجر الإلكترونية", "لوحات التحكم", "SEO"] },
        { t: "تطبيقات الجوال", d: "تطبيقات iOS وAndroid بتجربة سلسة وأداء أصلي، من النموذج الأولي حتى النشر في المتاجر.", tags: ["iOS", "Android", "Flutter", "React Native"] },
        { t: "الأنظمة والبرمجيات المخصصة", d: "أنظمة إدارة تُصمَّم حول طريقة عملك: ERP وCRM وأنظمة الحجوزات والمخزون والفوترة.", tags: ["ERP", "CRM", "أتمتة العمليات", "التكامل مع الأنظمة"] },
        { t: "تصميم تجربة وواجهة المستخدم", d: "بحث، هوية بصرية، ونماذج تفاعلية تجعل منتجك واضحاً وممتعاً من النقرة الأولى.", tags: ["UI/UX", "الهوية البصرية", "Prototyping", "Design Systems"] },
        { t: "الحلول السحابية والاستضافة", d: "بنية تحتية سحابية قابلة للتوسّع، نشر مستمر، ومراقبة على مدار الساعة.", tags: ["Cloud", "DevOps", "الاستضافة", "النسخ الاحتياطي"] },
        { t: "الأمن السيبراني", d: "فحص الثغرات، تأمين الأنظمة والبيانات، وسياسات حماية تتوافق مع المعايير.", tags: ["اختبار الاختراق", "حماية البيانات", "المراجعة الأمنية"] },
        { t: "الذكاء الاصطناعي والأتمتة", d: "مساعدات ذكية، تحليل بيانات، وأتمتة المهام المتكررة لتوفير الوقت والتكلفة.", tags: ["روبوتات المحادثة", "تحليل البيانات", "الأتمتة"] },
        { t: "الدعم الفني والصيانة", d: "عقود صيانة ودعم مستمر لضمان أن كل شيء يعمل — اليوم وغداً.", tags: ["عقود الصيانة", "التحديثات", "الدعم ٢٤/٧"] },
      ],
      steps: [
        { t: "نكتشف", d: "جلسة لفهم عملك وأهدافك وجمهورك، ثم خطة واضحة بالنطاق والوقت والتكلفة." },
        { t: "نصمّم", d: "هوية وتجربة ونماذج تفاعلية تراها وتلمسها قبل كتابة سطر كود واحد." },
        { t: "نبني", d: "تطوير بمراحل قصيرة، تتابع التقدم أسبوعياً وتجرّب بنفسك." },
        { t: "نطلق وننمو", d: "إطلاق آمن، ثم قياس وتحسين ودعم مستمر لينمو المنتج معك." },
      ],
      values: [
        { t: "حِرفية في التفاصيل", d: "كل حركة وكل بكسل مقصود. لا قوالب جاهزة ولا حلول مكررة." },
        { t: "سرعة بلا تنازل", d: "مواعيد واضحة وتسليم في الوقت، مع جودة كود تصمد للمستقبل." },
        { t: "شريك لا مورّد", d: "نبقى معك بعد الإطلاق، ونفكر في نمو عملك كأنه عملنا." },
      ],
    },
    en: {
      "nav.services": "Services", "nav.process": "Process", "nav.about": "About", "nav.contact": "Contact", "nav.cta": "Start a project",
      "hero.tag": "Available for new projects", "hero.est": "Tech studio / 2026",
      "hero.l1": "We turn ideas", "hero.l2": "into", "hero.l3": "people feel.",
      "hero.words": ["products", "websites", "apps", "systems", "experiences"],
      "hero.lead": "WIXA is a technology studio that designs and builds websites, apps and digital systems with a craftsman's care — tech that works quietly, experiences people remember.",
      "hero.scroll": "SCROLL • EXPLORE • SCROLL • EXPLORE •",
      "services.title": "What we make", "services.sub": "End-to-end services, from idea to launch — and beyond.",
      "about.statement": "We don't just write code. We listen, understand your business, then build something that feels like you — fast, secure, and beautiful enough to be loved.",
      "stats.projects": "Projects delivered", "stats.satisfaction": "Client satisfaction", "stats.support": "Technical support", "stats.years": "Years of experience",
      "process.title": "How we work",
      "values.title": "Why WIXA",
      "contact.l1": "Let's make", "contact.l2": "something great", "contact.sub": "Tell us about your idea and we'll get back to you within one business day.",
      "contact.emailLabel": "Email", "contact.phoneLabel": "WhatsApp",
      "form.name": "Name", "form.email": "Email", "form.phone": "Phone (optional)", "form.service": "What do you need?",
      "form.message": "Tell us about your project", "form.send": "Send message",
      "form.sending": "Sending…", "form.ok": "Message received ✓ We'll be in touch soon.", "form.err": "Couldn't send. Please try again or message us on WhatsApp.",
      "form.invalid": "Please complete the required fields correctly.",
      "footer.line": "Made with passion — from idea to launch.", "footer.top": "Back to top ↑", "footer.rights": "All rights reserved",
      cursor: { go: "Go", scroll: "Scroll", send: "Send", chat: "Chat", open: "Open" },
      services: [
        { t: "Web Development", d: "Fast, responsive websites built to persuade and convert — from company sites to complex platforms and online stores.", tags: ["Company sites", "E-commerce", "Dashboards", "SEO"] },
        { t: "Mobile Apps", d: "iOS and Android apps with smooth experiences and native performance, from prototype to store launch.", tags: ["iOS", "Android", "Flutter", "React Native"] },
        { t: "Custom Software & Systems", d: "Management systems designed around how you work: ERP, CRM, booking, inventory and invoicing.", tags: ["ERP", "CRM", "Process automation", "Integrations"] },
        { t: "UI / UX Design", d: "Research, visual identity and interactive prototypes that make your product clear and delightful from the first tap.", tags: ["UI/UX", "Brand identity", "Prototyping", "Design systems"] },
        { t: "Cloud & Hosting", d: "Scalable cloud infrastructure, continuous deployment and round-the-clock monitoring.", tags: ["Cloud", "DevOps", "Hosting", "Backups"] },
        { t: "Cybersecurity", d: "Vulnerability testing, system and data hardening, and standards-aligned protection policies.", tags: ["Pen testing", "Data protection", "Security audits"] },
        { t: "AI & Automation", d: "Smart assistants, data analysis and automation of repetitive work to save time and cost.", tags: ["Chatbots", "Data analytics", "Automation"] },
        { t: "Support & Maintenance", d: "Maintenance contracts and ongoing support so everything keeps working — today and tomorrow.", tags: ["Maintenance", "Updates", "24/7 support"] },
      ],
      steps: [
        { t: "Discover", d: "A session to understand your business, goals and audience — then a clear plan for scope, time and cost." },
        { t: "Design", d: "Identity, experience and interactive prototypes you can see and touch before a line of code is written." },
        { t: "Build", d: "Development in short sprints. You follow progress weekly and try it yourself." },
        { t: "Launch & grow", d: "A safe launch, then measuring, improving and ongoing support so the product grows with you." },
      ],
      values: [
        { t: "Craft in the details", d: "Every motion and every pixel is intentional. No templates, no recycled solutions." },
        { t: "Speed without compromise", d: "Clear timelines and on-time delivery, with code quality that lasts." },
        { t: "A partner, not a vendor", d: "We stay with you after launch and care about your growth like it's ours." },
      ],
    },
  };

  const ICONS = [
    '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 32c8-16 40-16 48 0-8 16-40 16-48 0z"/><circle cx="32" cy="32" r="8"/></svg>',
    '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M32 6l6 20 20 6-20 6-6 20-6-20-20-6 20-6z"/></svg>',
    '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="22" cy="32" r="14"/><circle cx="42" cy="32" r="14"/></svg>',
  ];

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lang = "ar";
  try { lang = localStorage.getItem("wixa-lang") || "ar"; } catch (e) {}
  if (!I18N[lang]) lang = "ar";
  const selected = new Set();

  // ====== Rendering ======
  function render() {
    const t = I18N[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    $("#langToggle").textContent = lang === "ar" ? "EN" : "ع";
    document.title = lang === "ar" ? "WIXA — ويكسا | حلول تقنية" : "WIXA | Technology Studio";

    $$("[data-i18n]").forEach((el) => { const v = t[el.dataset.i18n]; if (typeof v === "string") el.textContent = v; });
    $("#rotator").textContent = t["hero.words"][0];

    // marquee
    const items = t.services.map((s) => `<span class="marquee__item">${s.t}</span>`).join("");
    $(".marquee__track").innerHTML = `<div class="marquee__group">${items}</div><div class="marquee__group">${items}</div>`;

    // services
    $("#svcList").innerHTML = t.services.map((s, i) => `
      <li class="svc" data-cursor="open">
        <button class="svc__row" type="button" aria-expanded="false">
          <span class="svc__num">${String(i + 1).padStart(2, "0")}</span>
          <span class="svc__title">${s.t}</span>
          <span class="svc__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
        </button>
        <div class="svc__body"><div><div class="svc__inner"><i></i><p>${s.d}</p><div class="svc__tags">${s.tags.map((x) => `<span>${x}</span>`).join("")}</div></div></div></div>
      </li>`).join("");
    $$(".svc").forEach((li) => {
      const btn = $(".svc__row", li);
      btn.style.width = "100%"; btn.style.textAlign = "start";
      btn.addEventListener("click", () => {
        const open = !li.classList.contains("open");
        $$(".svc.open").forEach((o) => { o.classList.remove("open"); $(".svc__row", o).setAttribute("aria-expanded", "false"); });
        if (open) { li.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
        setTimeout(() => window.ScrollTrigger && ScrollTrigger.refresh(), 750);
      });
    });

    // process
    $("#processTrack").innerHTML = t.steps.map((s, i) => `
      <article class="step"><div class="step__num">${String(i + 1).padStart(2, "0")}<small> /04</small></div>
      <div><h3>${s.t}</h3><p>${s.d}</p></div></article>`).join("");

    // values
    $("#valuesGrid").innerHTML = t.values.map((v, i) => `
      <div class="value reveal"><div class="value__ico">${ICONS[i]}</div><h3>${v.t}</h3><p>${v.d}</p></div>`).join("");

    // form chips
    $("#chipsRow").innerHTML = t.services.slice(0, 7).map((s, i) =>
      `<button type="button" class="chip" data-i="${i}" aria-pressed="${selected.has(i)}">${s.t}</button>`).join("");
    $$(".chip").forEach((c) => c.addEventListener("click", () => {
      const i = +c.dataset.i; selected.has(i) ? selected.delete(i) : selected.add(i);
      c.setAttribute("aria-pressed", selected.has(i));
    }));

    splitStatement();
    observeReveals();
    bindCursorTargets();
  }

  // ====== Contact links ======
  function setupContact() {
    $("#emailLink").href = `mailto:${CONFIG.email}`;
    $("#emailLink").textContent = CONFIG.email;
    const wa = CONFIG.whatsapp ? `https://wa.me/${CONFIG.whatsapp}` : "#contact";
    $("#waLink").href = wa; $("#waLink").textContent = CONFIG.whatsappDisplay;
    $("#waFloat").href = wa;
    if (!CONFIG.whatsapp) $("#waFloat").removeAttribute("target");
    $("#year").textContent = new Date().getFullYear();
  }

  // ====== Reveal on scroll ======
  let io;
  function observeReveals() {
    if (!io) io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }), { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    $$(".reveal:not(.is-in), .contact__title .line:not(.is-in), .footer__word:not(.is-in)").forEach((el) => io.observe(el));
  }

  // ====== Statement word-by-word light up ======
  function splitStatement() {
    const el = $("#statement");
    el.innerHTML = el.textContent.split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");
    updateStatement();
  }
  function updateStatement() {
    const el = $("#statement"); if (!el) return;
    const r = el.getBoundingClientRect(), vh = innerHeight;
    const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
    const words = $$(".w", el), n = Math.round(p * words.length);
    words.forEach((w, i) => w.classList.toggle("on", reduced || i < n));
  }

  // ====== Counters ======
  function setupCounters() {
    const cio = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target, end = +el.dataset.count, t0 = performance.now(), dur = 1800;
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur), eased = 1 - Math.pow(1 - k, 4);
        el.textContent = Math.round(end * eased);
        if (k < 1) requestAnimationFrame(tick);
      };
      reduced ? (el.textContent = end) : requestAnimationFrame(tick);
      cio.unobserve(el);
    }), { threshold: 0.6 });
    $$("[data-count]").forEach((el) => cio.observe(el));
  }

  // ====== Word rotator ======
  function setupRotator() {
    let i = 0; const el = $("#rotator");
    setInterval(() => {
      if (document.hidden) return;
      const words = I18N[lang]["hero.words"];
      el.classList.remove("swap-in"); el.classList.add("swap-out");
      setTimeout(() => {
        i = (i + 1) % words.length; el.textContent = words[i];
        el.classList.remove("swap-out"); el.classList.add("swap-in");
      }, 420);
    }, 2600);
  }

  // ====== Cursor & magnetic ======
  const cursor = $(".cursor"), cursorLabel = $(".cursor__label");
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  function setupCursor() {
    if (!fine) return;
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; }, { passive: true });
    const loop = () => { cx += (x - cx) * 0.18; cy += (y - cy) * 0.18; cursor.style.transform = `translate(${cx}px, ${cy}px)`; requestAnimationFrame(loop); };
    loop();
  }
  function bindCursorTargets() {
    if (!fine) return;
    $$("[data-cursor]").forEach((el) => {
      if (el.dataset.bound) return; el.dataset.bound = 1;
      el.addEventListener("mouseenter", () => { cursorLabel.textContent = I18N[lang].cursor[el.dataset.cursor] || ""; cursor.classList.add("is-big"); });
      el.addEventListener("mouseleave", () => cursor.classList.remove("is-big"));
    });
    $$(".magnetic").forEach((el) => {
      if (el.dataset.mag) return; el.dataset.mag = 1;
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.3}px, ${(e.clientY - r.top - r.height / 2) * 0.4}px)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  // ====== Menu ======
  function setupMenu() {
    const b = $("#burger"), m = $("#menu");
    const toggle = (open) => { b.setAttribute("aria-expanded", open); m.classList.toggle("open", open); m.setAttribute("aria-hidden", !open); document.body.style.overflow = open ? "hidden" : ""; };
    b.addEventListener("click", () => toggle(b.getAttribute("aria-expanded") !== "true"));
    $$("a", m).forEach((a) => a.addEventListener("click", () => toggle(false)));
  }

  // ====== Form ======
  function setupForm() {
    const form = $("#contactForm"), status = $("#formStatus"), btn = $("button[type=submit]", form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = I18N[lang];
      const fields = ["name", "email", "message"].map((n) => form.elements[n]);
      let ok = true;
      fields.forEach((f) => { const bad = !f.value.trim() || (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value)); f.parentElement.classList.toggle("invalid", bad); if (bad) ok = false; });
      if (!ok) { status.className = "form__status err"; status.textContent = t["form.invalid"]; return; }

      btn.classList.add("loading"); status.className = "form__status"; status.textContent = t["form.sending"];
      const payload = {
        name: form.elements.name.value.trim(), email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(), message: form.elements.message.value.trim(),
        services: [...selected].map((i) => I18N.en.services[i].t), lang, website: form.elements.website.value,
      };
      try {
        const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(res.status);
        status.className = "form__status ok"; status.textContent = t["form.ok"];
        form.reset(); selected.clear(); $$(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      } catch (err) {
        status.className = "form__status err"; status.textContent = t["form.err"];
      } finally { btn.classList.remove("loading"); }
    });
  }

  // ====== GSAP: smooth scroll, pinned horizontal process, parallax ======
  function setupMotion() {
    if (reduced || !window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);

    if (window.Lenis) {
      const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
        const id = a.getAttribute("href"); if (id.length < 2) { e.preventDefault(); lenis.scrollTo(0); return; }
        const target = $(id); if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -20 }); }
      }));
    }

    gsap.to(".hero__shape", { yPercent: -30, rotate: 25, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.to(".hero__title", { yPercent: 25, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

    const mm = gsap.matchMedia();
    mm.add("(min-width: 861px)", () => {
      const track = $("#processTrack");
      const dist = () => track.scrollWidth - innerWidth + parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gutter") || 0);
      const dir = () => (document.documentElement.dir === "rtl" ? 1 : -1);
      const tween = gsap.to(track, { x: () => dir() * Math.max(0, track.scrollWidth - innerWidth), ease: "none",
        scrollTrigger: { trigger: ".process", start: "top top", end: () => "+=" + dist(), pin: ".process__pin", scrub: 1, invalidateOnRefresh: true } });
      return () => tween.kill();
    });

    $$(".svc").forEach((el, i) => gsap.from(el, { y: 60, opacity: 0, duration: 1, ease: "power3.out", delay: (i % 4) * 0.05, scrollTrigger: { trigger: el, start: "top 92%" } }));
  }

  // ====== Language toggle ======
  function setupLang() {
    $("#langToggle").addEventListener("click", () => {
      lang = lang === "ar" ? "en" : "ar";
      try { localStorage.setItem("wixa-lang", lang); } catch (e) {}
      document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" }).onfinish = () => {
        render();
        if (window.ScrollTrigger) ScrollTrigger.refresh();
        document.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, fill: "forwards" });
      };
    });
  }

  // ====== Loader ======
  function runLoader(done) {
    const num = $("#loaderNum"), loader = $(".loader");
    if (reduced) { loader.remove(); done(); return; }
    const t0 = performance.now(), dur = 1400;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      num.textContent = Math.round(100 * (1 - Math.pow(1 - k, 3)));
      if (k < 1) return requestAnimationFrame(tick);
      loader.classList.add("done");
      setTimeout(done, 350);
      setTimeout(() => loader.remove(), 1200);
    };
    requestAnimationFrame(tick);
  }

  // ====== Boot ======
  render();
  setupContact(); setupCursor(); setupMenu(); setupForm(); setupLang(); setupCounters(); setupRotator();
  addEventListener("scroll", () => {
    updateStatement();
    $("#waFloat").classList.toggle("show", scrollY > innerHeight * 0.6);
  }, { passive: true });

  addEventListener("load", () => {
    runLoader(() => {
      document.body.classList.remove("is-loading");
      $$(".hero .line").forEach((l) => l.classList.add("is-in"));
      setupMotion();
    });
  });
})();
