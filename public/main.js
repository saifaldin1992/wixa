/* WIXA — public site */
(() => {
  const { DEFAULTS, merge, applyTheme } = window.WIXA;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => { if (!u || typeof u !== "string" || !u.trim()) return ""; try { const x = new URL(u, location.href); return ["http:", "https:", "mailto:", "tel:"].includes(x.protocol) ? x.href : ""; } catch { return ""; } };
  const PREVIEW = new URLSearchParams(location.search).has("preview");
  const reducedOS = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const UI = {
    ar: { nav_home: "الرئيسية", nav_projects: "إنجازاتنا", nav_services: "خدماتنا", nav_partners: "شركاؤنا", nav_contact: "تواصل معنا",
      lang: "English", f_name: "الاسم", f_email: "البريد الإلكتروني", f_phone: "رقم الهاتف (اختياري)", f_service: "الخدمة المطلوبة", f_any: "استشارة عامة",
      f_message: "حدّثنا عن مشروعك", f_send: "إرسال", sending: "جارٍ الإرسال…", ok: "شكراً لك! وصلت رسالتك وسنتواصل معك قريباً.", err: "تعذّر الإرسال، حاول مرة أخرى.", invalid: "يرجى تعبئة الحقول المطلوبة بشكل صحيح.",
      no_projects: "ستُعرض المشاريع هنا قريباً.", step: "٠" },
    en: { nav_home: "Home", nav_projects: "Our work", nav_services: "Services", nav_partners: "Partners", nav_contact: "Contact",
      lang: "العربية", f_name: "Name", f_email: "Email", f_phone: "Phone (optional)", f_service: "Service", f_any: "General enquiry",
      f_message: "Tell us about your project", f_send: "Send", sending: "Sending…", ok: "Thank you! Your message arrived and we'll be in touch soon.", err: "Couldn't send. Please try again.", invalid: "Please fill in the required fields correctly.",
      no_projects: "Projects will appear here soon.", step: "0" },
  };

  const ICONS = window.WIXA.ICONS;
  const SOCIAL = {
    instagram: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.3" cy="6.7" r="1.2"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M17.8 2.5h3.1l-6.8 7.8 8 10.6h-6.3l-4.9-6.4-5.6 6.4H2.2l7.3-8.3L1.8 2.5h6.4l4.4 5.9zm-1.1 16.5h1.7L7.4 4.3H5.6z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9.5h4v11H3zm6.5 0h3.8v1.6h.1a4.2 4.2 0 013.8-2c4 0 4.8 2.6 4.8 6.1v6.3h-4v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9v5.7h-4z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path d="M14 8.5V6.6c0-.9.6-1.1 1-1.1h2.6V1.5h-3.6C10 1.5 9.2 4.4 9.2 6.3v2.2H6.5v4H9.2V22.5H14v-10h3.3l.4-4z"/></svg>',
  };
  const STORY_ART = [
    // stacked documents
    '<svg viewBox="0 0 300 220"><path d="M60 150l90 45 90-45-90-45z" class="fillp acc"/><path d="M60 135l90 45 90-45"/><path d="M60 120l90 45 90-45"/><path d="M60 105l90 45 90-45-90-45z"/><path d="M60 105v45M240 105v45M150 150v45"/><path d="M110 82l40-20 40 20" class="acc"/><path d="M95 95l55 27 55-27"/><line x1="205" y1="40" x2="245" y2="80" class="acc"/><line x1="245" y1="40" x2="205" y2="80" class="acc"/></svg>',
    // phone + clock
    '<svg viewBox="0 0 300 220"><rect x="105" y="30" width="90" height="170" rx="16"/><rect x="115" y="48" width="70" height="120" rx="6" class="fillp"/><line x1="140" y1="186" x2="160" y2="186"/><circle cx="150" cy="96" r="24" class="acc"/><polyline points="150,82 150,96 160,104" class="acc"/><rect x="125" y="134" width="50" height="16" rx="8" class="acc"/><path d="M40 70h40M30 100h50M45 130h35" /><path d="M220 70h40M220 100h50M220 130h35"/></svg>',
    // laptop + rocket
    '<svg viewBox="0 0 300 220"><rect x="70" y="50" width="160" height="105" rx="10"/><path d="M45 175h210l-18-20H63z"/><path d="M100 85l-14 14 14 14M200 85l14 14-14 14" class="acc"/><line x1="160" y1="78" x2="140" y2="122" class="acc"/><path d="M150 40c12-14 30-20 44-20 0 14-6 32-20 44l-14 4-14-14z" class="fillp acc"/><circle cx="178" cy="34" r="5" class="acc"/></svg>',
  ];

  let state = { settings: merge(DEFAULTS, {}), projects: [], services: [], partners: [] };
  let lang = "ar";
  try { lang = localStorage.getItem("wixa-lang") || "ar"; } catch {}
  if (!UI[lang]) lang = "ar";
  let anim = !reducedOS;

  const C = () => state.settings.content[lang] || state.settings.content.ar;
  const L = (row, f) => row[`${f}_${lang}`] || row[`${f}_ar`] || row[`${f}_en`] || "";

  // ---------- render ----------
  function splitWords(el, text) {
    el.innerHTML = String(text).split(/\s+/).filter(Boolean)
      .map((w, i) => `<span class="word"><span style="transition-delay:${i * 70}ms">${esc(w)}</span></span>`).join(" ");
  }

  function render() {
    const s = state.settings, c = C(), ui = UI[lang];
    anim = !reducedOS && s.animations !== false;
    document.documentElement.classList.toggle("no-anim", !anim);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    applyTheme(s);
    const brand = lang === "ar" ? s.brand.name_ar : s.brand.name_en;
    document.title = `${brand} — ${c.hero_title}`;

    $$("[data-c]").forEach((el) => { if (el.id !== "heroTitle") el.textContent = c[el.dataset.c] ?? ""; });
    $$("[data-t]").forEach((el) => { el.textContent = el.dataset.t === "brand" ? brand : ui[el.dataset.t] ?? ""; });
    splitWords($("#heroTitle"), c.hero_title);
    $("#langBtn").textContent = lang === "ar" ? "EN" : "ع";
    $("#langBtn2 span").textContent = ui.lang;

    $$(".brand__mark").forEach((m) => {
      if (s.brand.logo_url) { m.classList.add("has-logo"); m.innerHTML = `<img src="${esc(safeUrl(s.brand.logo_url))}" alt="">`; }
      else { m.classList.remove("has-logo"); m.innerHTML = '<svg viewBox="0 0 64 40"><path d="M4 6l10 28 14-22 14 22 10-28"/></svg>'; }
    });

    // sections visibility
    for (const [k, on] of Object.entries(s.sections)) {
      $$(`[data-section="${k}"]`).forEach((el) => (el.hidden = !on));
      $$(`[data-sec="${k}"]`).forEach((el) => (el.hidden = !on));
    }
    if (!state.partners.length) { $$('[data-section="partners"], [data-sec="partners"]').forEach((el) => (el.hidden = true)); }

    // story
    $("#storyList").innerHTML = (c.story || []).map((it, i) => `
      <article class="story-item">
        <div class="story-item__text reveal-up"><span class="story-item__num">0${i + 1}</span><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></div>
        <div class="story-item__art" aria-hidden="true">${STORY_ART[i % STORY_ART.length]}</div>
      </article>`).join("");

    // projects
    $("#projectsList").innerHTML = state.projects.length ? state.projects.map((p) => {
      const link = safeUrl(p.link);
      const stats = Array.isArray(p.stats) ? p.stats : [];
      return `<article class="project">
        <div class="project__body reveal-up">
          ${L(p, "category") ? `<span class="project__cat">${esc(L(p, "category"))}</span>` : ""}
          <h3>${esc(L(p, "title"))}</h3>
          <p>${esc(L(p, "summary"))}</p>
          ${link ? `<a class="project__link" href="${esc(link)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg>${esc(link.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : ""}
          ${stats.length ? `<div class="project__stats">${stats.map((st) => `<div><b>${esc(st.value)}</b><span>${esc(st[`label_${lang}`] || st.label_ar || "")}</span></div>`).join("")}</div>` : ""}
        </div>
        <div class="project__media">
          <div class="screen"><div class="screen__bar"><i></i><i></i><i></i></div>${p.image_url ? `<img src="${esc(safeUrl(p.image_url))}" alt="" loading="lazy">` : mockUI()}</div>
          <div class="phone">${p.mobile_image_url ? `<img src="${esc(safeUrl(p.mobile_image_url))}" alt="" loading="lazy">` : mockUI()}</div>
        </div>
      </article>`;
    }).join("") : `<p class="empty">${ui.no_projects}</p>`;

    // services
    $("#servicesGrid").innerHTML = state.services.map((sv) => `
      <article class="svc reveal-up"><div class="svc__ico">${ICONS[sv.icon] || ICONS.code}</div><h3>${esc(L(sv, "title"))}</h3><p>${esc(L(sv, "summary"))}</p></article>`).join("");
    $$(".svc").forEach((el) => el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect(); el.style.setProperty("--mx", `${e.clientX - r.left}px`); el.style.setProperty("--my", `${e.clientY - r.top}px`);
    }));

    // stats
    $("#statsGrid").innerHTML = (s.stats || []).map((st) => `
      <div class="stat reveal-up"><b><span data-count="${Number(st.value) || 0}">${anim ? 0 : Number(st.value) || 0}</span><em>${esc(st.suffix || "")}</em></b><span>${esc(st[`label_${lang}`] || st.label_ar || "")}</span></div>`).join("");

    // partners
    $("#partnersGrid").innerHTML = state.partners.map((p) => {
      const inner = p.logo_url ? `<img src="${esc(safeUrl(p.logo_url))}" alt="${esc(p.name)}" loading="lazy">` : `<span>${esc(p.name)}</span>`;
      const link = safeUrl(p.link);
      return link ? `<a class="partner" href="${esc(link)}" target="_blank" rel="noopener" title="${esc(p.name)}">${inner}</a>` : `<div class="partner" title="${esc(p.name)}">${inner}</div>`;
    }).join("");

    // contact
    const ct = s.contact;
    const sel = $("#serviceSelect");
    sel.innerHTML = `<option value="">${ui.f_any}</option>` + state.services.map((sv) => `<option>${esc(L(sv, "title"))}</option>`).join("");
    const phone = ct.phone || ct.whatsapp;
    $("#ctaPhone").hidden = !phone;
    if (phone) $("#ctaPhone").href = `tel:${phone.replace(/[^\d+]/g, "")}`;
    const wa = (ct.whatsapp || "").replace(/\D/g, "");
    $("#wa").hidden = !wa;
    if (wa) $("#wa").href = `https://wa.me/${wa}`;
    $("#social").innerHTML = ["instagram", "x", "linkedin", "facebook"].filter((k) => safeUrl(ct[k]))
      .map((k) => `<a href="${esc(safeUrl(ct[k]))}" target="_blank" rel="noopener" aria-label="${k}">${SOCIAL[k]}</a>`).join("")
      + (ct.email ? `<a href="mailto:${esc(ct.email)}" aria-label="email"><svg viewBox="0 0 24 24"><path d="M3 5h18v14H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 6l9 7 9-7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></a>` : "");
    $("#year").textContent = new Date().getFullYear();

    buildNet();
    observe();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  function mockUI() {
    return `<div class="mock"><div class="mock__row"><div class="mock__card"></div><div class="mock__card"></div><div class="mock__card"></div></div>
      <div class="mock__chart"><svg viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0 50 C30 40 40 20 70 28 S120 50 140 22 180 10 200 14"/></svg></div>
      <div class="mock__line"></div><div class="mock__line"></div><div class="mock__line"></div></div>`;
  }

  // ---------- hero network ----------
  function buildNet() {
    const svg = $("#net");
    const blob = "M210 110 C300 60 420 70 500 100 C590 135 640 120 700 190 C760 260 720 330 690 400 C660 470 700 540 620 600 C540 650 450 610 380 630 C300 650 220 620 170 560 C110 490 140 430 110 360 C80 290 90 220 130 170 C150 140 180 125 210 110 Z";
    const nodes = [[260, 200], [430, 170], [560, 250], [360, 330], [520, 420], [300, 480], [600, 520], [450, 560]];
    const links = [[0, 1], [1, 2], [0, 3], [1, 3], [2, 4], [3, 4], [3, 5], [4, 6], [5, 7], [4, 7]];
    const words = lang === "ar" ? ["منصات", "تطبيقات", "أنظمة"] : ["Platforms", "Apps", "Systems"];
    const flip = "";
    const chip = (x, y, t, d) => { const w = t.length * 11 + 48; return `<g class="chip" style="animation:float 6s ${d}s ease-in-out infinite"><g${flip} style="transform-box:fill-box;transform-origin:center"><rect x="${x}" y="${y}" rx="17" width="${w}" height="34"/><circle cx="${x + w - 18}" cy="${y + 17}" r="5"/><text x="${x + (w - 18) / 2}" y="${y + 22}" text-anchor="middle">${t}</text></g></g>`; };
    svg.innerHTML = `
      <style>@keyframes float{50%{transform:translateY(-10px)}}</style>
      <path class="blob" d="${blob}"/>
      ${[0.82, 0.64, 0.46].map((k) => `<path class="contour" d="${blob}" transform="translate(${400 * (1 - k)} ${360 * (1 - k)}) scale(${k})"/>`).join("")}
      ${links.map(([a, b]) => `<line class="link" x1="${nodes[a][0]}" y1="${nodes[a][1]}" x2="${nodes[b][0]}" y2="${nodes[b][1]}"/>`).join("")}
      ${nodes.map(([x, y], i) => `<circle class="halo" cx="${x}" cy="${y}" r="10" style="animation-delay:${(i * 0.37) % 2.6}s"/><circle class="node" cx="${x}" cy="${y}" r="5"/>`).join("")}
      ${chip(470, 120, words[0], 0)}${chip(150, 300, words[1], 1.5)}${chip(500, 470, words[2], 3)}`;
  }

  // ---------- reveal / counters ----------
  let io, cio;
  function observe() {
    io ??= new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    $$(".reveal-up:not(.in), .story-item:not(.in), .hero:not(.in)").forEach((el) => io.observe(el));

    cio ??= new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target, end = +el.dataset.count; cio.unobserve(el);
      if (!anim) { el.textContent = end.toLocaleString("en"); return; }
      const t0 = performance.now();
      const tick = (now) => { const k = Math.min(1, (now - t0) / 1800); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 4))).toLocaleString("en"); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }), { threshold: 0.5 });
    $$("[data-count]").forEach((el) => cio.observe(el));
  }

  // ---------- interactions ----------
  function setupUI() {
    const header = $("#header"), menu = $("#menu"), btn = $("#menuBtn"), scrim = $("#scrim");
    const toggle = (open) => { btn.setAttribute("aria-expanded", open); menu.classList.toggle("open", open); scrim.classList.toggle("open", open); };
    btn.addEventListener("click", () => toggle(btn.getAttribute("aria-expanded") !== "true"));
    scrim.addEventListener("click", () => toggle(false));
    $$("a", menu).forEach((a) => a.addEventListener("click", () => toggle(false)));

    let last = 0;
    addEventListener("scroll", () => {
      const y = scrollY;
      header.classList.toggle("hide", y > last && y > 300 && !menu.classList.contains("open"));
      last = y;
    }, { passive: true });

    const switchLang = () => {
      lang = lang === "ar" ? "en" : "ar";
      try { localStorage.setItem("wixa-lang", lang); } catch {}
      document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }).onfinish = () => {
        render(); $(".hero").classList.add("in", "in-hero");
        document.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: "forwards" });
      };
    };
    $("#langBtn").addEventListener("click", switchLang);
    $("#langBtn2").addEventListener("click", switchLang);

    $("#openForm").addEventListener("click", () => {
      const f = $("#contactForm"); f.classList.add("open");
      setTimeout(() => { f.querySelector("input").focus({ preventScroll: true }); window.ScrollTrigger && ScrollTrigger.refresh(); }, 500);
    });

    if (matchMedia("(hover: hover)").matches) $$(".magnetic").forEach((el) => {
      el.addEventListener("pointermove", (e) => { if (!anim) return; const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`; });
      el.addEventListener("pointerleave", () => (el.style.transform = ""));
    });

    // form
    const form = $("#contactForm"), status = $("#formStatus");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ui = UI[lang];
      let ok = true;
      ["name", "email", "message"].forEach((n) => {
        const f = form.elements[n]; const bad = !f.value.trim() || (n === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value));
        f.closest(".field").classList.toggle("bad", bad); if (bad) ok = false;
      });
      if (!ok) { status.className = "form__status err"; status.textContent = ui.invalid; return; }
      if (PREVIEW) { status.className = "form__status ok"; status.textContent = ui.ok; return; }
      const btnS = form.querySelector("[type=submit]"); btnS.disabled = true;
      status.className = "form__status"; status.textContent = ui.sending;
      try {
        const svc = form.elements.service.value;
        const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          name: form.elements.name.value, email: form.elements.email.value, phone: form.elements.phone.value,
          message: form.elements.message.value, services: svc ? [svc] : [], lang, website: form.elements.website.value }) });
        if (!res.ok) throw new Error(res.status);
        form.reset(); status.className = "form__status ok"; status.textContent = ui.ok;
      } catch { status.className = "form__status err"; status.textContent = ui.err; }
      finally { btnS.disabled = false; }
    });
  }

  function setupMotion() {
    if (!anim || !window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    if (window.Lenis) {
      const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
      document.addEventListener("click", (e) => {
        const a = e.target.closest('a[href^="#"]'); if (!a) return;
        const id = a.getAttribute("href"); const t = id === "#top" ? 0 : $(id);
        if (t !== null) { e.preventDefault(); lenis.scrollTo(t, { offset: -90 }); }
      });
    }
    gsap.to(".net", { yPercent: -18, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.to(".hero__content", { y: 80, opacity: 0.3, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    $$(".project").forEach((p) => {
      gsap.fromTo($(".screen", p), { y: 60 }, { y: -20, ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "bottom top", scrub: true } });
      gsap.fromTo($(".phone", p), { y: 120 }, { y: -40, ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "bottom top", scrub: true } });
      gsap.from(p, { y: 80, opacity: 0, scale: 0.97, duration: 1.2, ease: "power3.out", scrollTrigger: { trigger: p, start: "top 88%" } });
    });
    gsap.from(".stats__inner", { clipPath: "inset(12% 8% 12% 8% round 40px)", duration: 1.4, ease: "power3.out", scrollTrigger: { trigger: ".stats", start: "top 85%" } });
    gsap.from(".partner", { opacity: 0, y: 30, duration: 0.8, stagger: { each: 0.05, from: "random" }, ease: "power2.out", scrollTrigger: { trigger: ".partners__grid", start: "top 85%" } });
  }

  // ---------- data ----------
  async function load() {
    try {
      const cached = JSON.parse(localStorage.getItem("wixa-site") || "null");
      if (cached && !PREVIEW) setData(cached);
    } catch {}
    try {
      const res = await fetch("/api/site", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      setData(data);
      try { localStorage.setItem("wixa-site", JSON.stringify(data)); } catch {}
    } catch (e) { console.warn("Using default content:", e); }
  }
  function setData(d) {
    state = {
      settings: merge(DEFAULTS, d.settings || {}),
      projects: d.projects || [], services: d.services || [], partners: d.partners || [],
    };
  }

  function track() {
    if (PREVIEW) return;
    const body = JSON.stringify({ path: location.pathname, referrer: document.referrer, lang });
    try { navigator.sendBeacon ? navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" })) : fetch("/api/track", { method: "POST", body, keepalive: true }); } catch {}
  }

  // live preview from the admin dashboard
  if (PREVIEW) addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.data?.type !== "wixa-preview") return;
    const d = e.data.payload;
    if (d.settings) state.settings = merge(DEFAULTS, d.settings);
    for (const k of ["projects", "services", "partners"]) if (d[k]) state[k] = d[k];
    if (d.lang && UI[d.lang]) lang = d.lang;
    render(); $(".hero").classList.add("in", "in-hero");
  });

  // ---------- boot ----------
  (async () => {
    applyTheme(state.settings);
    await load();
    render();
    setupUI();
    const start = () => {
      $(".loader").classList.add("done");
      document.body.classList.remove("is-loading");
      setTimeout(() => $(".hero").classList.add("in", "in-hero"), 150);
      setupMotion();
      track();
    };
    if (document.readyState === "complete") start(); else addEventListener("load", start, { once: true });
    if (PREVIEW) parent.postMessage({ type: "wixa-preview-ready" }, location.origin);
  })();
})();
