/* WIXA — defaults and theme helpers shared by the site and the admin dashboard. */
(function () {
  const FONTS = {
    "Alexandria": "300;400;500;700;800",
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
      primary: "#570622",
      primaryInk: "#FFFFFF",
      accent: "#D9A441",
      bg: "#FAF7F6",
      surface: "#FFFFFF",
      text: "#1A0E12",
      muted: "#6E5F64",
      dark: "#2A0711",
      radius: 22,
    },
    font: { family: "Alexandria", scale: 1, headingWeight: 800 },
    brand: { name_ar: "ويكسا", name_en: "WIXA", logo_url: "" },
    contact: {
      email: "hello@wixa.tech", phone: "", whatsapp: "",
      address_ar: "", address_en: "",
      instagram: "", x: "", linkedin: "", facebook: "",
    },
    sections: { story: true, projects: true, services: true, stats: true, partners: true, contact: true },
    animations: true,
    stats: [
      { value: 120, suffix: "+", label_ar: "مشروع منجز", label_en: "Projects delivered" },
      { value: 40, suffix: "+", label_ar: "عميل وشريك", label_en: "Clients & partners" },
      { value: 1, suffix: "M+", label_ar: "مستخدم لأنظمتنا", label_en: "Users of our systems" },
      { value: 9, suffix: "", label_ar: "سنوات خبرة", label_en: "Years of experience" },
    ],
    content: {
      ar: {
        hero_badge: "الشريك التقني لمشاريعك",
        hero_title: "نبني المستقبل الرقمي",
        hero_sub: "ويكسا تصمم وتطور منصات وتطبيقات وأنظمة رقمية تختصر الوقت وتخدم الملايين — من الفكرة حتى التشغيل.",
        hero_cta: "أعمالنا",
        hero_cta2: "تواصل معنا",
        story: [
          { title: "لا معاملات ورقية", text: "لا ملفات ولا أختام ولا مراجعة دوائر. كل شيء رقمي وفي مكان واحد." },
          { title: "انتهى زمن الانتظار", text: "ما كان يحتاج طابوراً صار يُنجز من الهاتف خلال دقائق." },
          { title: "نبني من الفكرة حتى التشغيل", text: "نحلل، نصمم، نطور ونشغّل — ونبقى معك بعد الإطلاق." },
        ],
        projects_title: "إنجازاتنا",
        projects_sub: "حلول رقمية حقيقية صنعت فرقاً لعملائنا ومستخدميهم.",
        services_title: "خدماتنا",
        services_sub: "كل ما يحتاجه مشروعك الرقمي تحت سقف واحد.",
        stats_title: "أرقام نفخر بها",
        partners_title: "شركاؤنا",
        partners_sub: "نتعاون مع مؤسسات رائدة لتقديم نتائج استثنائية.",
        cta_title: "جاهزون لإنجاز مشروعكم القادم",
        cta_sub: "أخبرنا عن التحدي الذي تواجهه، وسنعود إليك بخطة عمل واضحة.",
        cta_button: "تواصل معنا",
        footer_text: "صُنع بشغف بواسطة فريق ويكسا",
      },
      en: {
        hero_badge: "Your technology partner",
        hero_title: "Building the digital future",
        hero_sub: "WIXA designs and builds platforms, apps and digital systems that save time and serve millions — from idea to operation.",
        hero_cta: "Our work",
        hero_cta2: "Contact us",
        story: [
          { title: "No more paperwork", text: "No files, no stamps, no office visits. Everything digital, in one place." },
          { title: "The waiting is over", text: "What used to need a queue now takes minutes on a phone." },
          { title: "From idea to operation", text: "We analyse, design, build and run — and stay with you after launch." },
        ],
        projects_title: "Our work",
        projects_sub: "Real digital solutions that made a difference for our clients and their users.",
        services_title: "Services",
        services_sub: "Everything your digital project needs, under one roof.",
        stats_title: "Numbers we're proud of",
        partners_title: "Partners",
        partners_sub: "We work with leading organizations to deliver exceptional results.",
        cta_title: "Ready to deliver your next project",
        cta_sub: "Tell us about the challenge you face and we'll come back with a clear plan.",
        cta_button: "Contact us",
        footer_text: "Crafted with care by the WIXA team",
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

  function hexToRgb(hex) {
    const h = String(hex || "").replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return isNaN(n) ? "0,0,0" : `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  function loadFont(family) {
    if (!FONTS[family]) family = "Alexandria";
    const id = "wixa-font";
    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${FONTS[family]}&display=swap`;
    let link = document.getElementById(id);
    if (!link) { link = document.createElement("link"); link.id = id; link.rel = "stylesheet"; document.head.appendChild(link); }
    if (link.href !== href) link.href = href;
    return family;
  }

  // Mix two hex colors: k = share of `b` (0..1).
  function mix(a, b, k) {
    const A = hexToRgb(a).split(",").map(Number), B = hexToRgb(b).split(",").map(Number);
    return "#" + A.map((v, i) => Math.round(v * (1 - k) + B[i] * k).toString(16).padStart(2, "0")).join("");
  }

  // Light tokens come from the dashboard; the dark palette is derived from the brand color.
  // CSS maps --bg, --surface, … to --l-* or --dk-* depending on html[data-theme].
  function applyTheme(settings, root = document.documentElement) {
    const t = settings.theme, f = settings.font;
    const fam = loadFont(f.family);
    const dk = {
      bg: mix(t.primary, "#0C0A0B", 0.9),
      surface: mix(t.primary, "#18151A", 0.86),
      text: "#F4EEF0",
      muted: "#B9ABB0",
      dark: mix(t.primary, "#050304", 0.55),
      fg: mix(t.primary, "#FFD9E4", 0.68),
    };
    const vars = {
      "--primary": t.primary, "--primary-rgb": hexToRgb(t.primary), "--primary-ink": t.primaryInk,
      "--accent": t.accent, "--accent-rgb": hexToRgb(t.accent),
      "--l-bg": t.bg, "--l-surface": t.surface, "--l-surface-rgb": hexToRgb(t.surface), "--l-text": t.text, "--l-text-rgb": hexToRgb(t.text),
      "--l-muted": t.muted, "--l-dark": t.dark, "--l-dark-rgb": hexToRgb(t.dark), "--l-fg": t.primary, "--l-fg-rgb": hexToRgb(t.primary),
      "--dk-bg": dk.bg, "--dk-surface": dk.surface, "--dk-surface-rgb": hexToRgb(dk.surface), "--dk-text": dk.text, "--dk-text-rgb": hexToRgb(dk.text),
      "--dk-muted": dk.muted, "--dk-dark": dk.dark, "--dk-dark-rgb": hexToRgb(dk.dark), "--dk-fg": dk.fg, "--dk-fg-rgb": hexToRgb(dk.fg),
      "--radius": `${Number(t.radius) || 0}px`,
      "--font": `"${fam}", system-ui, sans-serif`,
      "--scale": String(Math.min(1.4, Math.max(0.8, Number(f.scale) || 1))),
      "--hw": String(f.headingWeight || 800),
    };
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
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
  markEnv();

  window.WIXA = { DEFAULTS, FONTS, ICONS, merge, applyTheme, loadFont, markEnv };
})();
