// Public pages rendered on the server: home and its sections, services, projects, blog, privacy.

// WIXA — Cloudflare Worker: serves the site (public/) and the API.
//
// Built to stay fast under heavy traffic:
//  • Site content is read from Supabase at most once a minute per edge location
//    (isolate memory + Cloudflare edge cache), never once per visitor.
//  • The homepage HTML gets that content injected, so a visit needs no extra API round trip.
//  • The contact form is rate limited per IP, checked by Turnstile and written through a
//    token-checked database function, so nobody can write to the database directly.
//  • Visits are counted by Cloudflare Web Analytics, not by this Worker.

import { PRIVACY_DEFAULTS } from "../../public/js/privacy-defaults.js";
import { STATUS_DEFAULTS, TEAM_DEFAULTS, sitePages } from "../../public/js/site-pages.js";
import { UI_DEFAULTS } from "../../public/js/ui-strings.js";
import { SOCIAL } from "../../public/js/social-icons.js";
import { SECURITY_HEADERS, WIXA, esc, fmtDate, notFound, pickLang, safeHref, versionAssets, versioned } from "../lib/core.js";
import { cspWithTags, getConfig, getPosts, getSiteData, hasBypass, maintenancePage, memo as siteMemo } from "../services/data.js";
import { FOOTER_GROUPS, groupOf, navLink, sectionShown } from "../../public/js/site-structure.js";
import { arrangeSections } from "../lib/arrange.js";

// Cloudflare Web Analytics: privacy-friendly, cookie-less visit counting that never touches our database.
export const beacon = (env) => env.CF_BEACON_TOKEN
  ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${env.CF_BEACON_TOKEN}"}'></script>`
  : "";

// Hero text used when the dashboard has not changed it (the HTML itself ships the Arabic version).
export const HERO_DEFAULTS = {
  ar: { hero_badge: "الشريك التقني لمشاريعك", hero_title: "نبني المستقبل الرقمي", hero_sub: "ويكسا تصمم وتطور منصات وتطبيقات وأنظمة رقمية سريعة وآمنة تختصر الوقت على عملائك — من الفكرة حتى التشغيل." },
  en: { hero_badge: "Your technology partner", hero_title: "Building the digital future", hero_sub: "WIXA designs and builds fast, secure platforms, apps and digital systems that save your customers time — from idea to launch." },
};
export const SEO_DEFAULTS = {
  en: { title: "WIXA — Websites, apps & software development in Iraq", description: "WIXA designs and builds websites, digital platforms, mobile apps and custom business systems in Iraq — from idea to launch." },
};

// Questions & answers for search engines (only when the FAQ section is shown)
export function faqLd(st, lang) {
  const list = (st.content?.[lang]?.faq || []).filter((x) => x?.q && x?.a);
  if (st.sections?.faq === false || !list.length) return "";
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: list.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) };
  return `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
}

// GET / — static HTML with the content embedded (no flash of default text, one request per visit).
// /about, /pricing and /careers are the homepage's HTML showing only their own sections (html[data-page])
// «الصفحة غير موجودة» (404) inside the site's own header and footer, in the brand colour and font, with links to the
// main pages. pageNotFound() when the site settings are already loaded; handleNotFound() loads them first.
export function pageNotFound(request, st) {
  const lang = pickLang(request, st.default_lang), ar = lang === "ar", q = `?lang=${lang}`;
  const links = ar
    ? [["/order", "ابدأ مشروعك"], ["/services", "خدماتنا"], ["/projects", "نماذج من عملنا"], ["/pricing", "الباقات والأسعار"], ["/faq", "الأسئلة الشائعة"], ["/contact", "تواصل معنا"]]
    : [["/order", "Start your project"], ["/services", "Services"], ["/projects", "Our work"], ["/pricing", "Packages & pricing"], ["/faq", "FAQ"], ["/contact", "Contact us"]];
  const body = `<div class="nf"><svg class="nf__logo" viewBox="0 0 2021 982" aria-hidden="true"><use href="/logo.svg#m" fill="currentColor"/></svg>
    <div class="nf__code" aria-hidden="true">404</div>
    <h1>${ar ? "الصفحة غير موجودة" : "Page not found"}</h1>
    <p>${ar ? "ربما تغيّر الرابط أو حُذفت الصفحة. يمكنك العودة إلى الرئيسية أو الانتقال مباشرة إلى ما تبحث عنه." : "The link may have changed or the page was removed. Go back to the homepage or straight to what you are looking for."}</p>
    <p class="actions" style="margin-top:0"><a class="btn btn--primary" href="/${q}">${ar ? "العودة إلى الرئيسية" : "Back to the homepage"}</a></p>
    <nav class="nf__links" aria-label="${ar ? "أقسام الموقع" : "Site sections"}">${links.map(([h, l]) => `<a href="${h}${q}">${l}</a>`).join("")}</nav></div>`;
  return simplePage(request, st, { lang, title: ar ? "الصفحة غير موجودة" : "Page not found", description: "", path: new URL(request.url).pathname, body, status: 404, ending: false, noindex: true });
}
export async function handleNotFound(request, env, ctx) {
  try {
    let st = {};
    try { st = JSON.parse(await getSiteData(env, ctx)).settings || {}; } catch {}
    return pageNotFound(request, st);
  } catch { return notFound(request, env); } // the plain page (public/404.html) if anything goes wrong
}

// a short preview of a longer text: cut at the last whole word and end with «…» (never in the middle of a word)
function snip(text, max) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max), sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s،,.؛:–—-]+$/, "")}…`;
}

export const PAGE_TITLES = { services: { ar: "خدماتنا", en: "Our services" }, projects: { ar: "نماذج من عملنا", en: "Our work" }, pricing: { ar: "الباقات والأسعار", en: "Packages & pricing" }, about: { ar: "من نحن", en: "About us" }, careers: { ar: "الوظائف", en: "Careers" }, contact: { ar: "تواصل معنا", en: "Contact us" }, order: { ar: "اطلب مشروعك", en: "Order your project" }, track: { ar: "تتبع طلبك", en: "Track your order" }, faq: { ar: "الأسئلة الشائعة", en: "Frequently asked questions" } };
export async function handleHome(request, env, ctx, pageName = "home") {
  const [page, raw, cfg] = await Promise.all([env.ASSETS.fetch(new Request(new URL("/", request.url), request)), getSiteData(env, ctx), getConfig(env)]);
  const data = cfg.spam.turnstile ? raw : raw.replace(/"turnstile":"[^"]*"/, '"turnstile":""');
  const owner = hasBypass(request, cfg);
  if (cfg.maintenance.on && !owner) { let st0 = {}; try { st0 = JSON.parse(data)?.settings || {}; } catch {} return maintenancePage(request, cfg, st0); }
  const preview = new URL(request.url).searchParams.has("preview");
  const tags = preview ? {} : Object.fromEntries(Object.entries(cfg.tags).filter(([, v]) => v));
  const safe = data.replace(/</g, "\\u003c");
  // Put the hero text in the HTML itself (same markup the script builds), so the first paint
  // already has it and nothing moves when the script runs.
  let st = {};
  try { st = JSON.parse(data)?.settings || {}; } catch {}
  const lang = pickLang(request, st.default_lang);
  const hero = { ...HERO_DEFAULTS[lang], ...Object.fromEntries(Object.entries(st.content?.[lang] || {}).filter(([, v]) => v)) };
  const seo = st.seo || {};
  const origin = new URL(request.url).origin;
  const abs = (u) => (/^https?:\/\//.test(u) ? u : `${origin}${u.startsWith("/") ? "" : "/"}${u}`);
  const attr = (sel, name, val) => [sel, { element: (el) => { if (val) el.setAttribute(name, val); } }];
  const siteTitle = seo[`title_${lang}`] || (lang === "en" ? SEO_DEFAULTS.en.title : ""), siteDesc = seo[`description_${lang}`] || (lang === "en" ? SEO_DEFAULTS.en.description : ""), img = seo.og_image ? abs(seo.og_image) : "";
  const pc = { ...(WIXA.DEFAULTS.content?.[lang] || {}), ...Object.fromEntries(Object.entries(st.content?.[lang] || {}).filter(([, v]) => v)) }, brandName = (lang === "en" ? st.brand?.name_en : st.brand?.name_ar) || (lang === "en" ? "WIXA" : "ويكسا");
  const pageDesc = { services: pc.services_sub, projects: pc.projects_sub, pricing: pc.pricing_sub, about: pc.about_text, careers: pc.careers_sub, contact: pc.cta_sub, faq: pc.faq_sub, order: pc.pricing_sub, track: pc.pricing_sub }[pageName];
  const title = pageName === "home" ? siteTitle : `${PAGE_TITLES[pageName][lang]} — ${brandName}`;
  const desc = pageName === "home" ? siteDesc : String(pageDesc || siteDesc || "").replace(/\s+/g, " ").slice(0, 160);
  const pagePath = pageName === "home" ? "/" : `/${pageName}`;
  const headTags = [
    seo.google_verification && `<meta name="google-site-verification" content="${esc(seo.google_verification)}">`,
    seo.bing_verification && `<meta name="msvalidate.01" content="${esc(seo.bing_verification)}">`,
    seo.index === false && `<meta name="robots" content="noindex, nofollow">`,
    pageName === "faq" && faqLd(st, lang), // the questions are on /faq now
    // one address, two languages: tell search engines about both versions
    `<link rel="alternate" hreflang="ar" href="${origin}${pagePath}?lang=ar"><link rel="alternate" hreflang="en" href="${origin}${pagePath}?lang=en"><link rel="alternate" hreflang="x-default" href="${origin}${pagePath}">`,
  ].filter(Boolean).join("");
  const words = (t) => String(t).split(/\s+/).filter(Boolean).map((w, i) => `<span class="word"><span style="transition-delay:${i * 70}ms">${esc(w)}</span></span>`).join(" ");
  // The whole page is painted from the server with the same texts, colours and sections the script would set,
  // so the first frame is the finished page and no loading screen is needed.
  const full = WIXA.merge(WIXA.DEFAULTS, st);
  const C = full.content?.[lang] || full.content?.ar || {};
  const ui = { ...UI_DEFAULTS[lang] };
  for (const [k, v] of Object.entries(st.ui?.[lang] || {})) if (typeof v === "string" && v.trim() && k in ui) ui[k] = v;
  let parsed = {}; try { parsed = JSON.parse(data); } catch {}
  const hide = new Set(Object.entries(full.sections || {}).filter(([, on]) => !on).map(([k]) => k));
  if (!(parsed.partners || []).length) hide.add("partners");
  if (!(parsed.testimonials || []).length) hide.add("testimonials");
  const vars = WIXA.themeVars(full, full.font?.family);
  const themeCss = `<style id="wixa-theme">:root{${Object.entries(vars).map(([k, v]) => `${k}:${String(v).replace(/[<>{};]/g, "")}`).join(";")}}</style>`;
  const fam = WIXA.FONTS[full.font?.family] ? full.font.family : WIXA.BRAND_FONT;
  const fontHref = WIXA.HOSTED[fam] ? (WIXA.HOSTED[fam] === "/fonts/noto-sans-arabic.css" ? "" : WIXA.HOSTED[fam])
    : `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, "+")}:wght@${WIXA.FONTS[fam]}&display=swap`;
  // one header and footer for every page (siteShell), and the sections in the order of this page's layout
  const empty = new Set([...hide].filter((k) => k === "partners" || k === "testimonials"));
  const shell = siteShell(st, lang, pagePath, { empty });
  let html = await page.text();
  html = html.replace(/<header class="header" id="header">[\s\S]*?<\/header>/, () => shell.header)
    .replace(/<footer class="footer">[\s\S]*?<\/footer>/, () => shell.footer);
  html = arrangeSections(html, st, pageName);
  // the FAQ page ends with its own invitation («لم تجد إجابتك؟») instead of the general one
  if (pageName === "faq") html = html.replace('data-c="cta_title"', 'data-c="faq_cta_title"').replace('data-c="cta_sub"', 'data-c="faq_cta_sub"');
  const q = lang === "ar" ? "" : "?lang=en";
  const moreHref = (k) => { const h = navLink(st, k, empty).href; const [p0, hash] = h.split("#"); return `${p0}${q}${hash ? `#${hash}` : ""}`; };
  const res = versionAssets(new HTMLRewriter())
    .on("head", { element: (el) => el.append(`${headTags}<script id="wixa-data" type="application/json">${safe}</script>`, { html: true }) })
    .on("html", { element: (el) => { el.setAttribute("lang", lang); el.setAttribute("dir", lang === "ar" ? "rtl" : "ltr"); el.setAttribute("data-page", pageName); el.setAttribute("data-look", full.look === "soft" ? "soft" : "flat"); } })
    // one main heading per page: «تواصل معنا» is the main heading only on /contact; elsewhere it is a section heading
    .on("h1.head__title", { element: (el) => { if (pageName !== "contact") el.tagName = "h2"; } })
    // the inner pages that are a section of the home page: that section's title becomes the page's main heading
    .on(`section#${pageName} h2.head__title`, { element: (el) => { if (["about", "pricing", "careers", "faq", "services", "projects"].includes(pageName)) el.tagName = "h1"; } })
    // inner pages hide the home headline; keep it out of their outline so each page has a single main heading
    .on("h1.hero__title", { element: (el) => { if (pageName !== "home") el.tagName = "div"; } })
    .on(...attr('link[rel="canonical"]', "href", `${origin}${pagePath}`))
    .on(...attr('meta[property="og:url"]', "content", `${origin}${pagePath}`))
    .on("title", { element: (el) => { if (title) el.setInnerContent(title); } })
    .on(...attr('meta[property="og:locale"]', "content", lang === "en" ? "en_US" : "ar_IQ"))
    .on(...attr('meta[name="description"]', "content", desc))
    .on(...attr('meta[name="keywords"]', "content", seo.keywords))
    .on(...attr('meta[property="og:title"]', "content", title))
    .on(...attr('meta[name="twitter:title"]', "content", title))
    .on(...attr('meta[property="og:description"]', "content", desc))
    .on(...attr('meta[name="twitter:description"]', "content", desc))
    .on(...attr('meta[property="og:image"]', "content", img))
    .on(...attr('meta[name="twitter:image"]', "content", img))
    .on(...attr('link[rel="icon"][type="image/svg+xml"]', "href", seo.icon_url))
    .on(...attr('link[rel="icon"][sizes]', "href", seo.icon_url))
    .on(...attr('link[rel="apple-touch-icon"]', "href", seo.icon_url))
    .on("head", { element: (el) => el.append(themeCss, { html: true }) })
    .on("#wixa-font", { element: (el) => { if (fontHref) el.setAttribute("href", fontHref); } })
    .on("#heroTitle", { element: (el) => el.setInnerContent(words(C.hero_title ?? hero.hero_title), { html: true }) })
    .on("[data-c]", { element: (el) => { const k = el.getAttribute("data-c"); if (el.getAttribute("id") !== "heroTitle" && k in C) el.setInnerContent(String(C[k] ?? "")); } })
    .on("[data-t]", { element: (el) => { const k = el.getAttribute("data-t"); if (k !== "brand" && typeof ui[k] === "string") el.setInnerContent(ui[k]); } })
    .on("[data-section], [data-sec]", { element: (el) => { if (hide.has(el.getAttribute("data-section") || el.getAttribute("data-sec"))) el.setAttribute("hidden", ""); } })
    .on("#langBtn", { element: (el) => el.setInnerContent(lang === "ar" ? "EN" : "ع") })
    .on(".hero", { element: (el) => el.setAttribute("class", `${el.getAttribute("class") || ""} in in-hero`) })
    .on("a[data-more]", { element: (el) => el.setAttribute("href", moreHref(el.getAttribute("data-more"))) })
    .on("body", { element: (el) => el.removeAttribute("class") })
    .on("body", { element: (el) => {
      if (!preview) el.append(beacon(env), { html: true });
      if (Object.keys(tags).length) el.append(`<script id="wixa-tags" type="application/json">${JSON.stringify(tags)}</script><script type="module" src="${versioned("/build/tags.js")}"></script>`, { html: true });
      if (cfg.maintenance.on && owner && !preview) el.append('<div style="position:fixed;inset:auto 12px 12px auto;z-index:99999;background:#B45309;color:#fff;padding:8px 14px;border-radius:10px;font:600 13px system-ui,Tahoma,sans-serif">وضع الصيانة مفعّل — الزوار يرون صفحة «نعود قريباً»</div>', { html: true });
    } })
    .transform(new Response(html, { status: page.status, headers: page.headers }));
  const headers = new Headers(res.headers);
  headers.set("cache-control", "no-cache");
  headers.set("vary", "Accept-Language, Cookie");
  headers.set("content-language", lang);
  headers.delete("etag");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  headers.set("content-security-policy", cspWithTags(tags));
  headers.set("speculation-rules", '"/speculation-rules.json"');
  return new Response(res.body, { status: res.status, headers });
}

// Project details text: blank-line separated blocks; a short first line becomes a heading, "•" lines a list (same as the site's window).
export function detailsHtml(raw) {
  return String(raw || "").split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let html = "";
    if (lines.length > 1 && lines[0].length < 40 && !lines[0].startsWith("•")) html += `<h2>${esc(lines.shift())}</h2>`;
    const bullets = lines.filter((l) => /^[•\-–]/.test(l)), text = lines.filter((l) => !/^[•\-–]/.test(l));
    if (text.length) html += `<p>${text.map(esc).join("<br>")}</p>`;
    if (bullets.length) html += `<ul>${bullets.map((l) => `<li>${esc(l.replace(/^[•\-–]\s*/, ""))}</li>`).join("")}</ul>`;
    return html;
  }).join("");
}

// Company pages in the footer: pages added from the dashboard (group «قانوني» unless the page says otherwise), our team
// («الشركة»), services status («الدعم») — each { g, html }.
export function footerExtra(st, lang, path = "") {
  const team = { ...TEAM_DEFAULTS, ...(st.team || {}) }, status = { ...STATUS_DEFAULTS, ...(st.status_page || {}) };
  const q = lang === "ar" ? "" : "?lang=en";
  const a = (href, label, i) => `<a href="${href}${q}"${path === href ? ' aria-current="page"' : ""} style="order:${100 + i}">${esc(label)}</a>`;
  const out = sitePages(st).filter((p) => p.published && p.footer).map((p, i) => ({ g: ["services", "company", "support", "legal"].includes(p.group) ? p.group : "legal", html: a(p.path, p[`title_${lang}`] || p.title_ar || p.title_en, i) }));
  if (team.on && team.footer) out.push({ g: "company", html: a("/team", team[`title_${lang}`] || TEAM_DEFAULTS[`title_${lang}`], 50) });
  if (status.on && status.footer) out.push({ g: "support", html: a("/status", lang === "ar" ? "حالة الخدمات" : "Service status", 60) });
  out.push({ g: "support", html: a("/portal", lang === "ar" ? "بوابة العملاء" : "Client portal", 55) });
  return out;
}
// A page's text: [{h, p}] → headings and paragraphs; "{email}" becomes the contact email link
const sectionsHtml = (list, email) => {
  const mail = `<a href="mailto:${esc(email)}">${esc(email)}</a>`;
  return (Array.isArray(list) ? list : []).filter((x) => x?.h || x?.p)
    .map((x) => `${x.h ? `<h2>${esc(x.h)}</h2>` : ""}${x.p ? `<p>${esc(x.p).split("{email}").join(mail).replace(/\n/g, "<br>")}</p>` : ""}`).join("");
};


// The site's header (logo, menu, theme, language, «ابدأ مشروعك») and footer — ONE source for every page: the home page
// and its sister pages (they replace the copy in public/index.html with this) and the server-built pages (services,
// projects, articles, policies, status…). So the top bar and the footer can never differ from one page to another.
// Every menu link is written, each with its place (data-nav) and its text key (data-t), and hidden where it does not
// belong; where a link goes and whether it shows comes from the site structure (public/js/site-structure.js → navLink),
// so a link follows its section when the section moves to another page and disappears when the section is off.
// empty: sections with nothing to show (no partners yet) — their links are hidden too.
export function siteShell(st, lang, path, { empty } = {}) {
  const ar = lang === "ar", q = ar ? "" : "?lang=en", other = ar ? "en" : "ar";
  const ui = { ...UI_DEFAULTS[lang] };
  for (const [k, v] of Object.entries(st.ui?.[lang] || {})) if (typeof v === "string" && v.trim() && k in ui) ui[k] = v;
  const gone = empty || emptyNow();
  const c = WIXA.merge(WIXA.DEFAULTS, st).contact || {};
  const tkey = (k) => (k === "privacy" ? "privacy" : `nav_${k}`);
  const withLang = (h) => { const [p, hash] = h.split("#"); return `${p}${q}${hash ? `#${hash}` : ""}`; };
  const plan = WIXA.navPlan(st);
  const link = (x, i, footer) => {
    const t = navLink(st, x.k, gone);
    const place = x.at === "both" || x.at === (footer ? "footer" : "menu");
    return `<a href="${withLang(t.href)}"${footer ? ' data-where="footer"' : ""} data-nav="${x.k}" data-t="${tkey(x.k)}" style="order:${i}"${t.href === path ? ' aria-current="page"' : t.href !== "/" && !t.href.includes("#") && path.startsWith(t.href + "/") ? ' aria-current="true"' : ""}${place && t.shown ? "" : " hidden"}>${esc(ui[tkey(x.k)] || x.k)}</a>`;
  };
  const menu = plan.map((x, i) => link(x, i, false)).join("");
  // footer: the links in their groups (site-structure.js → FOOTER_GROUPS), each group titled; «قانوني» is one small line
  const extra = footerExtra(st, lang, path);
  const groupHtml = (g) => {
    const links = plan.map((x, i) => [x, i]).filter(([x]) => groupOf(x) === g.k).map(([x, i]) => link(x, i, true)).join("")
      + extra.filter((e) => e.g === g.k).map((e) => e.html).join("");
    const shown = /<a (?![^>]*\shidden)/.test(links);
    return { links, shown };
  };
  const main = FOOTER_GROUPS.filter((g) => g.k !== "legal").map((g) => {
    const { links, shown } = groupHtml(g);
    return `<details class="fgroup" open${shown ? "" : " hidden"}><summary class="fgroup__title">${esc(g[`name_${lang}`] || g.name_ar)}</summary><nav class="footer__nav">${links}</nav></details>`;
  }).join("");
  const legal = groupHtml(FOOTER_GROUPS.find((g) => g.k === "legal"));
  const reach = [
    c.whatsapp && !st.chat?.on ? `<a href="https://wa.me/${esc(String(c.whatsapp).replace(/\D/g, ""))}" target="_blank" rel="noopener" dir="ltr">${esc(c.phone || `+${String(c.whatsapp).replace(/\D/g, "")}`)}</a>` : c.phone || c.whatsapp ? `<a href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ""))}" dir="ltr">${esc(c.phone)}</a>` : "",
    c.email ? `<a href="mailto:${esc(c.email)}" dir="ltr">${esc(c.email)}</a>` : "",
    c[`address_${lang}`] || c.address_ar ? `<span>${esc(c[`address_${lang}`] || c.address_ar)}</span>` : "",
  ].filter(Boolean);
  const groups = `<div class="footer__groups">${main}</div>
    ${reach.length ? `<p class="footer__reach"><span class="footer__reach-t" data-t="f_reach">${esc(ui.f_reach || "")}</span>${reach.join('<span class="footer__dot" aria-hidden="true">·</span>')}</p>` : ""}
    <nav class="footer__nav footer__legal"${legal.shown ? "" : " hidden"}>${legal.links}</nav>`;
  const start = esc(ui.nav_start);
  const brandName = ar ? "ويكسا" : "WIXA";
  const mark = '<svg viewBox="0 0 2021 982" aria-hidden="true"><use href="/logo.svg#m"/></svg>';
  const word = `<svg class="wm" viewBox="0 0 716.6 150" aria-hidden="true"><use href="/wordmark.svg#wm"/></svg><span class="sr-only">${brandName}</span>`;
  const host = { instagram: "www.instagram.com", x: "x.com", linkedin: "www.linkedin.com", facebook: "www.facebook.com" };
  const social = (k) => { let v = String(c[k] || "").trim(); if (!v) return ""; if (!/^https?:\/\/[^/]+\.[a-z]{2,}/i.test(v)) v = `https://${host[k]}/${v.replace(/^https?:\/\//i, "").replace(/^@/, "").replace(/^(www\.)?(instagram|facebook|linkedin|x|twitter)(\.com)?\/?/i, "").replace(/^\/+/, "")}`; return safeHref(v); };
  const socials = ["instagram", "x", "linkedin", "facebook"].map((k) => [k, social(k)]).filter(([, u]) => u).map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${k}">${SOCIAL[k]}</a>`).join("")
    + (c.email ? `<a href="mailto:${esc(c.email)}" aria-label="email"><svg viewBox="0 0 24 24"><path d="M3 5h18v14H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 6l9 7 9-7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></a>` : "");
  const contactOff = !sectionShown(st, "contact", gone) ? " hidden" : "";
  const header = `<header class="header" id="header">
    <div class="header__bar">
      <a href="/${q}" class="brand" aria-label="WIXA">
        <span class="brand__mark" id="brandMark">${mark}</span>
        <span class="brand__name" data-t="brand">${word}</span>
      </a>
      <nav class="header__nav" aria-label="main">${menu}<a href="/order${q}" class="nav-cta" data-t="nav_start" data-sec="contact"${contactOff}>${start}</a></nav>
      <div class="header__end">
        <button class="theme-btn" id="themeBtn" data-theme-toggle type="button" aria-label="${ar ? "الوضع الليلي / النهاري" : "Dark / light mode"}"><svg class="moon" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/></svg><svg class="sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
        <a class="pill-btn lang-btn" id="langBtn" href="${path}?lang=${other}" hreflang="${other}">${ar ? "EN" : "ع"}</a>
        <a href="/order${q}" class="head-start" data-start data-t="nav_start">${start}</a>
        <button class="menu-btn" id="menuBtn" type="button" aria-label="menu" aria-expanded="false"><span></span><span></span></button>
      </div>
    </div>
    <div class="header__menu" id="menu"><a href="/order${q}" class="menu-cta" data-start data-t="nav_start">${start}</a>${menu}</div>
  </header>`;
  const footer = `<footer class="footer">
    <svg class="footer__wave footer__wave--brand" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="fwv" x1="0" x2="1"><stop offset="0" style="stop-color:var(--fg)"/><stop offset=".5" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--fg)"/></linearGradient></defs><path pathLength="1" stroke="url(#fwv)" d="M0 20 C 100 0, 200 0, 300 20 S 500 40, 600 20 S 800 0, 900 20 S 1100 40, 1200 20"/></svg>
    <svg class="footer__wave" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M0 20 C 100 0, 200 0, 300 20 S 500 40, 600 20 S 800 0, 900 20 S 1100 40, 1200 20"/></svg>
${groups}
    <div class="footer__tools">
      <a href="/track${q}" class="track-btn" data-track><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg><span data-t="track">${esc(ui.track)}</span></a>
      <div class="footer__social" id="social">${socials}</div>
    </div>
    <div class="footer__brand"><a href="${path === "/" ? "#top" : `/${q}`}" class="brand"><span class="brand__mark">${mark}</span><span class="brand__name" data-t="brand">${word}</span></a></div>
    <p class="footer__credit"><span data-c="footer_text">${esc(st.content?.[lang]?.footer_text || (ar ? "طُوّر بواسطة فريق ويكسا" : "Developed by the WIXA team"))}</span> · © <span id="year">${new Date().getFullYear()}</span></p>
  </footer>`;
  return { header, footer, ui };
}
// Sections with nothing to show right now (for pages built without the site data at hand): read from the shared copy.
function emptyNow() {
  const e = new Set();
  const t = siteMemo.text;
  // no copy yet means the site is running without its content (database unreachable): the home page then has no
  // partners either, so both agree
  if (!t || /"partners":\[\]/.test(t)) e.add("partners");
  return e;
}

// Loading screen of the stand-alone pages, the same as the home page's and the dashboard's. It is painted first
// (the stylesheets come right after it in <body>, so the browser can show it while they load) and the site's
// stylesheet hides it (.boot { display: none }) the moment it arrives — on a good connection it is never seen.
// After 10 s /theme-pre.js adds «boot-slow»: «التحميل يتأخر» + «إعادة المحاولة».
const BOOT_CSS = `.boot{position:fixed;inset:0;z-index:200;display:grid;place-content:center;justify-items:center;gap:14px;padding:16px;background:#FFFFFF;color:#140F1F;text-align:center;font:500 1rem/1.6 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
html[data-theme="dark"] .boot{background:#130C1F;color:#F2F0F7}
.boot>*{opacity:0;animation:bootIn .3s ease .4s forwards}.boot__mark{width:84px;height:auto;color:#5B21B6;animation:bootIn .3s ease .4s forwards,bootPulse 1.4s ease-in-out .7s infinite}
html[data-theme="dark"] .boot__mark{color:#A574F1}.boot p{margin:0}
.boot__slow,.boot__btns{display:none}.boot-slow .boot__wait{display:none}.boot-slow .boot__slow{display:block}.boot-slow .boot__btns{display:flex}
.boot__btns button{min-height:48px;padding:0 24px;border:0;border-radius:99px;background:#5B21B6;color:#fff;font:inherit;font-weight:700;cursor:pointer}
@keyframes bootIn{to{opacity:1}}@keyframes bootPulse{50%{opacity:.45}}`;
const bootHtml = (lang) => { const ar = lang === "ar"; return `<div class="boot" id="boot" role="status"><svg class="boot__mark" viewBox="0 0 2021 982" aria-hidden="true"><use href="/logo.svg#m"/></svg>
<p class="boot__wait">${ar ? "جارٍ التحميل…" : "Loading…"}</p><p class="boot__slow">${ar ? "التحميل يتأخر — الاتصال بطيء أو منقطع." : "This is taking a while — the connection is slow."}</p>
<div class="boot__btns"><button type="button" id="bootRetry">${ar ? "إعادة المحاولة" : "Try again"}</button></div></div>`; };

// One page layout shared by service and project pages, articles, the privacy policy and the review form:
// the site's own stylesheet, header, menu and footer, with the page's content in the middle.
export function simplePage(request, st, { lang, title, description, path, image, body, jsonld, status = 200, orderQ = "", ending = true, crumbs = null, startLabel = "", scripts = [], noindex = false }) {
  const ar = lang === "ar";
  const origin = new URL(request.url).origin;
  const t = st.theme || {};
  const color = /^#[0-9a-f]{3,8}$/i.test(t.primary || "") ? t.primary : "#5B21B6";
  const font = WIXA.FONTS[st.font?.family] ? st.font.family : WIXA.BRAND_FONT, hosted = WIXA.HOSTED[font];
  const brand = (ar ? st.brand?.name_ar : st.brand?.name_en) || (ar ? "ويكسا" : "WIXA");
  const c = st.contact || {};
  const wa = String(c.whatsapp || "").replace(/\D/g, "");
  const shell = siteShell(st, lang, path), ui = shell.ui;
  // breadcrumbs on deeper pages: الرئيسية › <section page> › <this page>. crumbs = [[ui key or label, path], …] without home and this page
  const trail = crumbs ? [[ui.nav_home || (ar ? "الرئيسية" : "Home"), "/"], ...crumbs] : null;
  const crumbHtml = trail ? `<nav class="crumbs" aria-label="${ar ? "مسار الصفحة" : "Breadcrumb"}"><ol>${trail.map(([l, h]) => `<li><a href="${h}?lang=${lang}">${esc(ui[l] || l)}</a></li>`).join("")}<li aria-current="page">${esc(title)}</li></ol></nav>` : "";
  if (trail) {
    const crumbLd = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [...trail, [title, path]].map(([l, h], i) => ({ "@type": "ListItem", position: i + 1, name: ui[l] || l, item: `${origin}${h}?lang=${lang}` })) };
    jsonld = jsonld ? [jsonld, crumbLd] : crumbLd;
  }
  const html = `<!doctype html><html lang="${lang}" dir="${ar ? "rtl" : "ltr"}" data-mode="${st.mode === "light" || st.mode === "dark" ? st.mode : ""}" data-look="${st.look === "soft" ? "soft" : "flat"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(brand)}</title><meta name="description" content="${esc(description)}">${noindex ? '<meta name="robots" content="noindex">' : ""}
<link rel="canonical" href="${origin}${path}?lang=${lang}"><link rel="alternate" hreflang="ar" href="${origin}${path}?lang=ar"><link rel="alternate" hreflang="en" href="${origin}${path}?lang=en">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${origin}${path}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
${font === WIXA.BRAND_FONT ? '<link rel="preload" href="/fonts/noto-sans-arabic/noto-sans-arabic-arabic-600-normal.woff2" as="font" type="font/woff2" crossorigin>' : hosted ? "" : '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
<script src="/theme-pre.js"></script>
<style>${BOOT_CSS}</style>
<style id="wixa-theme">:root{${Object.entries(WIXA.themeVars(WIXA.merge(WIXA.DEFAULTS, st), st.font?.family)).map(([k, v]) => `${k}:${String(v).replace(/[<>{};]/g, "")}`).join(";")}}</style>
<style>
/* page body on the site's colours: the content blocks below keep their own small layout */
.page{--p:var(--primary);--t:var(--text);--m:var(--muted);--l:var(--line);--s:var(--surface);max-width:var(--read,820px);margin:0 auto;padding:calc(var(--bar-end,78px) + var(--page-top,40px)) var(--gutter) clamp(48px,8vw,80px)}
html[data-theme="dark"] .page{--p:var(--fg)}
.page h1{font-size:var(--fs-h2,1.75rem);line-height:1.25;margin:0 0 12px;text-align:center;text-wrap:balance}
.page h2{font-size:1.25rem;margin:30px 0 8px}
.page>.lead,.page .lead{font-size:1.0625rem;color:var(--m);text-align:center;max-width:620px;margin-inline:auto}
.page .cat{display:table;margin:0 auto 6px;font-size:.8rem;font-weight:700;padding:3px 12px;border-radius:99px;background:color-mix(in srgb,var(--p) 12%,transparent);color:var(--p)}
.page .nf{text-align:center;padding-top:clamp(8px,4vw,32px)}.page .nf__logo{display:block;margin:0 auto;width:96px;height:auto;color:var(--p)}
.page .nf__code{font-size:clamp(4rem,16vw,6.5rem);font-weight:800;line-height:1;margin:8px 0 0;color:var(--p);letter-spacing:.02em}
.page .nf p{max-width:520px;margin:0 auto 22px}.page .nf__links{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:22px}
.page .nf__links a{padding:9px 16px;border-radius:99px;border:1px solid var(--l);background:var(--s);color:var(--t);text-decoration:none;font-size:.92rem;min-height:44px;display:inline-flex;align-items:center}
.page .nf__links a:hover{border-color:var(--p)}
.page p,.page li{color:var(--m);line-height:1.9}.page ul{padding-inline-start:20px}
.page .empty{text-align:center;padding:var(--panel-pad,24px);border-radius:var(--radius,22px);border:1px dashed var(--l-2,var(--line-2));background:var(--s);margin-top:24px}
.page .gallery{display:grid;gap:12px;margin:24px 0}.page .gallery img{width:100%;border-radius:var(--radius,22px);border:1px solid var(--l);display:block}.page .gallery .mob{max-width:300px;justify-self:center}
.page .stats{display:flex;flex-wrap:wrap;justify-content:center;gap:28px;margin:24px 0;padding:20px 0;border-top:1px solid var(--l);border-bottom:1px solid var(--l);text-align:center}
.page .stats b{display:block;font-size:1.6rem;color:var(--t)}.page .stats span{color:var(--m);font-size:.9rem}
.page .actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:32px}
.page .actions .btn{min-height:48px}
.page .case{display:grid;gap:12px;margin:24px 0}.page .case div{padding:var(--card-pad,18px);border-radius:var(--radius,22px);border:1px solid var(--l);background:var(--s)}.page .case h3{margin:0 0 6px;font-size:1rem;color:var(--p)}.page .case p{margin:0}
.page .more{margin-top:40px;padding-top:24px;border-top:1px solid var(--l)}.page .more h2{margin-top:0;text-align:center}.page .more__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.page .more__grid a{display:block;padding:var(--card-pad,18px);border-radius:var(--radius,22px);border:1px solid var(--l);background:var(--s);text-decoration:none;color:var(--t)}.page .more__grid b{display:block;font-size:1.0625rem;line-height:1.5}.page .more__grid span{color:var(--m);font-size:.875rem}
.page .posts{display:grid;gap:14px;margin-top:24px}.page .post{display:grid;grid-template-columns:160px 1fr;gap:16px;padding:var(--card-pad,18px);border-radius:var(--radius,22px);border:1px solid var(--l);background:var(--s);text-decoration:none;color:var(--t)}
.page .post img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--radius-sm,14px)}.page .post b{display:block;font-size:1.1rem}.page .post span{font-size:.8rem;color:var(--m)}.page .post p{margin:6px 0 0;font-size:.92rem}
@media(max-width:560px){.page .post{grid-template-columns:1fr}}
.page article h2{margin-top:30px}.page article p,.page article li{font-size:1.05rem}
.page a:not(.btn):not(.post):not(.more__grid a):not(.nf__links a){color:var(--p);text-decoration:underline;text-underline-offset:3px}
.page .rv{display:grid;gap:14px;margin-top:20px}.page .rv label{display:grid;gap:6px;font-weight:700;color:var(--t)}.page .rv input,.page .rv textarea{font:inherit;min-height:48px;padding:12px 14px;border-radius:var(--radius-sm,14px);border:1px solid var(--line-2);background:var(--s);color:var(--t);width:100%;box-sizing:border-box}
.page .rv fieldset{border:0;padding:0;margin:0}.page .rv legend{font-weight:700;margin-bottom:6px;color:var(--t)}.page .stars{display:flex;flex-wrap:wrap;gap:6px}
.page .star input{position:absolute;opacity:0}.page .star span{display:inline-block;padding:6px 12px;border-radius:99px;border:1px solid var(--l);background:var(--s);color:#D9A441;cursor:pointer}
.page .star input:checked+span{border-color:var(--p);box-shadow:0 0 0 3px color-mix(in srgb,var(--p) 20%,transparent)}.page .rv .btn{justify-self:center;border:0;cursor:pointer}
.page .hp{position:absolute;left:-9999px;opacity:0}
.page .btn--wa{background:#25D366;color:#fff}
.page .art--magazine .art__cover{margin:0 0 24px}.page .art--magazine .art__cover img{aspect-ratio:16/8;object-fit:cover;border-radius:var(--radius,22px)}
.page .art--magazine h1{font-size:clamp(1.9rem,4.4vw,2.6rem);text-align:start}.page .art--magazine .cat{margin-inline:0}.page .art--magazine>.lead{text-align:start;margin-inline:0;font-size:1.15rem;max-width:none}
.page .art--magazine article p:first-of-type::first-letter{float:inline-start;font-size:3.2em;line-height:.9;font-weight:800;color:var(--p);margin-inline-end:8px}
.page .art--minimal{max-width:640px;margin:0 auto}.page .art--minimal h1{text-align:start;font-size:clamp(1.6rem,3.6vw,2.1rem)}.page .art--minimal .cat{margin-inline:0;background:none;padding:0;color:var(--m)}
.page .art--minimal>.lead{text-align:start;margin-inline:0;padding-bottom:18px;border-bottom:1px solid var(--l)}.page .art--minimal article h2{padding-inline-start:12px;border-inline-start:3px solid var(--p)}.page .art--minimal article p{font-size:1.1rem;line-height:2}
.page .team{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-top:24px}.page .team__m{padding:var(--card-pad,18px);border-radius:var(--radius,22px);border:1px solid var(--l);background:var(--s);text-align:center}
.page .team__m img,.page .team__av{width:96px;height:96px;border-radius:50%;object-fit:cover;margin:0 auto 10px;display:grid;place-items:center;background:color-mix(in srgb,var(--p) 12%,transparent);color:var(--p);font-size:2rem;font-weight:800}
.page .team__m b{display:block;color:var(--t);font-size:1.0625rem}.page .team__m span{display:block;color:var(--p);font-size:.875rem;font-weight:700}.page .team__m p{margin:8px 0 0;font-size:.92rem;line-height:1.7}
.page .status{display:grid;gap:10px;margin:24px 0}.page .status__row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:14px 18px;border-radius:var(--radius,22px);border:1px solid var(--l);background:var(--s)}
.page .status__row b{color:var(--t)}.page .status__row small{grid-column:2/-1;color:var(--m);font-size:.85rem}.page .status__st{font-weight:700;color:var(--m)}
.page .status__dot{width:12px;height:12px;border-radius:50%;background:#0E7C47;box-shadow:0 0 0 4px color-mix(in srgb,#0E7C47 18%,transparent)}.page .status__dot--warn{background:#B45309;box-shadow:0 0 0 4px color-mix(in srgb,#B45309 18%,transparent)}.page .status__dot--down{background:#B91C1C;box-shadow:0 0 0 4px color-mix(in srgb,#B91C1C 18%,transparent)}.page .status__dot--off{background:#9CA3AF;box-shadow:none}
.page .crumbs{margin:0 0 18px;font-size:.84rem}.page .crumbs ol{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 0;list-style:none;margin:0;padding:0}
.page .crumbs li{color:var(--m);line-height:1.6}.page .crumbs li+li::before{content:"›";margin-inline:8px;color:var(--m);opacity:.6}
html[dir="rtl"] .page .crumbs li+li::before{content:"‹"}.page .crumbs a{color:var(--m)!important;text-decoration:none!important}.page .crumbs a:hover{color:var(--p)!important}
.page .crumbs [aria-current]{color:var(--t);font-weight:600;max-width:24ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.page .pn{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}.page .pn a{display:grid;gap:2px;padding:14px 18px;border-radius:var(--radius,22px);border:1px solid var(--l);background:var(--s);color:var(--t)!important;text-decoration:none!important}
.page .pn a span{font-size:.8rem;color:var(--m)}.page .pn a b{font-size:.98rem;line-height:1.5}.page .pn .pn__next{text-align:end;grid-column:2}
.footer .footer__wave path{stroke-dashoffset:0} /* no scroll script on these pages: the waves are drawn from the start (this wins over site.css, which loads later) */
</style></head><body>
${bootHtml(lang)}
${hosted ? `<link rel="stylesheet" href="${hosted}">` : `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@${WIXA.FONTS[font]}&display=swap">`}
<link rel="stylesheet" href="${versioned("/build/site.css")}">
${shell.header}
<div class="scrim" id="scrim"></div>
<main class="page">${crumbHtml}${body}
${ending ? `<div class="actions"><a class="btn btn--primary" data-start href="/order?lang=${lang}${orderQ}">${esc(startLabel || ui.nav_start)}</a><a class="btn btn--ghost" href="/contact?lang=${lang}">${ui.nav_contact}</a></div>` : ""}</main>
${shell.footer}
${st.chat?.on || scripts.length ? `<script src="${versioned("/build/shared.js")}" defer></script>` : ""}${scripts.map((u) => `<script type="module" src="${versioned(u)}"></script>`).join("")}${st.chat?.on && !scripts.length ? `<script type="module" src="${versioned("/build/chat.js")}"></script>` : ""}
</body></html>`;
  return new Response(request.method === "HEAD" ? null : html, { status, headers: { ...SECURITY_HEADERS, "speculation-rules": '"/speculation-rules.json"', "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "content-language": lang, vary: "Accept-Language, Cookie" } });
}

// GET /projects/<slug> — one page per project (shareable, and findable in search engines)
export async function handleProjectPage(request, env, ctx, slug) {
  const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
  let d = {};
  try { d = JSON.parse(raw); } catch {}
  const st = d.settings || {};
  if (cfg.maintenance.on && !hasBypass(request, cfg)) return maintenancePage(request, cfg, st);
  const lang = pickLang(request, st.default_lang);
  const p = (d.projects || []).find((x) => x.slug === slug || String(x.id) === slug);
  if (!p) return pageNotFound(request, st);
  const T = (f) => p[`${f}_${lang}`] || p[`${f}_ar`] || p[`${f}_en`] || "";
  const imgs = [p.image_url, ...(Array.isArray(p.gallery) ? p.gallery : [])].map(safeHref).filter(Boolean);
  const mob = safeHref(p.mobile_image_url);
  const stats = Array.isArray(p.stats) ? p.stats.filter((x) => String(x.value || "").trim()) : [];
  const link = safeHref(p.link);
  const all = d.projects || [], at = all.indexOf(p);
  const cat = (x) => String(x.category_ar || x.category_en || "").trim();
  const others = [...all.filter((x) => x !== p && cat(p) && cat(x) === cat(p)), ...all.filter((x) => x !== p && !(cat(p) && cat(x) === cat(p)))].slice(0, 3);
  // previous / next go round the list; with two projects there is only «next»
  const n = all.length, next = n > 1 ? all[(at + 1) % n] : null, prev = n > 2 ? all[(at - 1 + n) % n] : null;
  const pT = (o, f) => o[`${f}_${lang}`] || o[`${f}_ar`] || o[`${f}_en`] || "";
  // previous / next only when the «similar» cards do not already list every other project
  const pn = n - 1 > others.length ? `<nav class="pn" aria-label="${lang === "ar" ? "مشاريع أخرى" : "More projects"}">${prev ? `<a href="/projects/${encodeURIComponent(prev.slug)}?lang=${lang}"><span>${lang === "ar" ? "→ المشروع السابق" : "← Previous project"}</span><b>${esc(pT(prev, "title"))}</b></a>` : ""}${next ? `<a class="pn__next" href="/projects/${encodeURIComponent(next.slug)}?lang=${lang}"><span>${lang === "ar" ? "المشروع التالي ←" : "Next project →"}</span><b>${esc(pT(next, "title"))}</b></a>` : ""}</nav>` : "";
  const origin = new URL(request.url).origin;
  const body = `${T("category") ? `<span class="cat">${esc(T("category"))}</span>` : ""}<h1>${esc(T("title"))}</h1>
    ${T("summary") ? `<p class="lead">${esc(T("summary"))}</p>` : ""}
    ${imgs.length || mob ? `<div class="gallery">${imgs.map((u) => `<img src="${esc(u)}" alt="${esc(T("title"))}" loading="lazy">`).join("")}${mob ? `<img class="mob" src="${esc(mob)}" alt="" loading="lazy">` : ""}</div>` : ""}
    ${stats.length ? `<div class="stats">${stats.map((x) => `<div><b>${esc(x.value)}</b><span>${esc(x[`label_${lang}`] || x.label_ar || "")}</span></div>`).join("")}</div>` : ""}
    ${(() => { // case study: the challenge → our solution → the result
      const cs = [["problem", lang === "ar" ? "التحدي" : "The challenge"], ["solution", lang === "ar" ? "الحل" : "Our solution"], ["result", lang === "ar" ? "النتيجة" : "The result"]].filter(([f]) => T(f).trim());
      return cs.length ? `<div class="case">${cs.map(([f, h]) => `<div><h3>${h}</h3><p>${esc(T(f)).replace(/\n/g, "<br>")}</p></div>`).join("")}</div>` : "";
    })()}
    ${detailsHtml(T("details"))}
    ${link ? `<p><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link.replace(/^https?:\/\//, "").replace(/\/$/, ""))} ↗</a></p>` : ""}
    ${others.length ? `<section class="more"><h2>${lang === "ar" ? "مشاريع مشابهة" : "Similar projects"}</h2><div class="more__grid">${others.map((o) => {
      const t = (f) => o[`${f}_${lang}`] || o[`${f}_ar`] || o[`${f}_en`] || "";
      return `<a href="/projects/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(t("title"))}</b><span>${esc(t("category") || snip(t("summary"), 70))}</span></a>`;
    }).join("")}</div></section>` : ""}${pn}`;
  return simplePage(request, st, { orderQ: `&project=${encodeURIComponent(slug)}`, crumbs: [["nav_projects", "/projects"]], startLabel: lang === "ar" ? "اطلب مشروعاً مشابهاً" : "Start a similar project",
    lang, title: T("title"), description: (T("summary") || T("details")).slice(0, 160), path: `/projects/${encodeURIComponent(p.slug)}`,
    image: imgs[0] || mob || "", body,
    jsonld: { "@context": "https://schema.org", "@type": "CreativeWork", name: T("title"), description: T("summary"), url: `${origin}/projects/${encodeURIComponent(p.slug)}`, ...(imgs[0] ? { image: imgs[0] } : {}), creator: { "@type": "Organization", name: "WIXA", url: origin } },
  });
}

// GET /privacy — privacy policy (Arabic / English)
export async function handlePrivacy(request, env, ctx) {
  const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
  let st = {};
  try { st = JSON.parse(raw).settings || {}; } catch {}
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const email = st.contact?.email || "info@wixa.dev";
  const tagsOn = Object.values(cfg.tags || {}).some(Boolean);
  // text from the dashboard (المحتوى ← سياسة الخصوصية), or the default wording
  const pv = st.privacy || {};
  const list = (Array.isArray(pv[lang]) && pv[lang].some((x) => x?.h || x?.p) ? pv[lang] : PRIVACY_DEFAULTS[lang]).filter((x) => x?.h || x?.p);
  const updated = pv.updated || PRIVACY_DEFAULTS.updated;
  const mail = `<a href="mailto:${esc(email)}">${esc(email)}</a>`;
  const para = (t) => esc(t).split("{email}").join(mail).replace(/\n/g, "<br>");
  const S = list.map((x) => [esc(x.h || ""), para(x.p || "")]);
  // analytics or ad pixels switched on in the dashboard: say so automatically
  if (tagsOn) S.push([ar ? "أدوات القياس والإعلانات" : "Analytics and advertising tools", ar
    ? "نستخدم أيضاً أدوات قياس وإعلانات من جهات أخرى (مثل Google أو Meta أو Microsoft أو TikTok) لفهم أداء الموقع وحملاتنا، وقد تستخدم هذه الأدوات ملفات تعريف الارتباط وفق سياساتها."
    : "We also use third-party analytics and advertising tools (such as Google, Meta, Microsoft or TikTok) to understand how the site and our campaigns perform; these tools may use cookies under their own policies."]);
  const body = `<h1>${ar ? "سياسة الخصوصية" : "Privacy policy"}</h1><p class="lead">${ar ? "آخر تحديث:" : "Last updated:"} ${esc(updated)}</p>${S.map(([h, p]) => `${h ? `<h2>${h}</h2>` : ""}<p>${p}</p>`).join("")}`;
  return simplePage(request, st, { lang, title: ar ? "سياسة الخصوصية" : "Privacy policy", description: ar ? "كيف تجمع ويكسا بياناتك وتستخدمها وتحميها." : "How WIXA collects, uses and protects your data.", path: "/privacy", body , ending: false });
}

// ---------------------------------------------------------------- pages added from the dashboard
// GET /<path> — a stand-alone page (terms, payments…) written in the dashboard. null when there is no such page.
export async function handleCustomPage(request, env, ctx, path) {
  const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
  let st = {};
  try { st = JSON.parse(raw).settings || {}; } catch {}
  const pg = sitePages(st).find((p) => p.path === path && p.published);
  if (!pg) return null;
  if (cfg.maintenance.on && !hasBypass(request, cfg)) return maintenancePage(request, cfg, st);
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const title = pg[`title_${lang}`] || pg.title_ar || pg.title_en || "";
  const list = Array.isArray(pg[lang]) && pg[lang].some((x) => x?.h || x?.p) ? pg[lang] : pg[ar ? "en" : "ar"];
  const body = `<h1>${esc(title)}</h1>${pg.updated ? `<p class="lead">${ar ? "آخر تحديث:" : "Last updated:"} ${esc(pg.updated)}</p>` : ""}${sectionsHtml(list, st.contact?.email || "info@wixa.dev")}`;
  return simplePage(request, st, { lang, title, description: String(pg[`desc_${lang}`] || pg.desc_ar || title).slice(0, 160), path, body, ending: false });
}

// GET /team — our team (names, roles, photos from the dashboard). 404 until it is switched on.
export async function handleTeam(request, env, ctx) {
  const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
  let st = {};
  try { st = JSON.parse(raw).settings || {}; } catch {}
  const t = { ...TEAM_DEFAULTS, ...(st.team || {}) };
  if (!t.on) return pageNotFound(request, st);
  if (cfg.maintenance.on && !hasBypass(request, cfg)) return maintenancePage(request, cfg, st);
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const L = (o, f) => o[`${f}_${lang}`] || o[`${f}_ar`] || o[`${f}_en`] || "";
  const people = (Array.isArray(t.members) ? t.members : []).filter((m) => L(m, "name"));
  const initial = (n) => esc(String(n).trim()[0] || "?");
  const body = `<h1>${esc(L(t, "title"))}</h1>${L(t, "sub") ? `<p class="lead">${esc(L(t, "sub"))}</p>` : ""}
    ${people.length ? `<div class="team">${people.map((m) => { const img = safeHref(m.photo); return `<div class="team__m">
      ${img ? `<img src="${esc(img)}" alt="${esc(L(m, "name"))}" loading="lazy">` : `<span class="team__av" aria-hidden="true">${initial(L(m, "name"))}</span>`}
      <b>${esc(L(m, "name"))}</b>${L(m, "role") ? `<span>${esc(L(m, "role"))}</span>` : ""}${L(m, "bio") ? `<p>${esc(L(m, "bio"))}</p>` : ""}</div>`; }).join("")}</div>`
      : `<div class="empty">${ar ? "نضيف تعريف الفريق قريباً." : "Our team will be introduced here soon."}</div>`}`;
  return simplePage(request, st, { lang, title: L(t, "title"), description: L(t, "sub") || L(t, "title"), path: "/team", body });
}

// GET /status — services status for clients: is the site, ordering, order tracking and the live chat working.
// The database check is remembered for 60 s, so the page can never flood the database.
let statusMemo = { at: 0, db: false };
export async function handleStatus(request, env, ctx) {
  const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
  let st = {};
  try { st = JSON.parse(raw).settings || {}; } catch {}
  if (!{ ...STATUS_DEFAULTS, ...(st.status_page || {}) }.on) return pageNotFound(request, st);
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  if (Date.now() - statusMemo.at > 60_000) {
    let db = false;
    try { db = (await fetch(`${env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(5000) })).ok; } catch {}
    statusMemo = { at: Date.now(), db };
  }
  const db = statusMemo.db, chatOn = !!st.chat?.on;
  const rows = [
    [ar ? "الموقع" : "Website", cfg.maintenance.on ? "warn" : "ok", cfg.maintenance.on ? (ar ? "صيانة مجدولة" : "Scheduled maintenance") : ""],
    [ar ? "استقبال الطلبات والرسائل" : "Orders and messages", db ? "ok" : "down", ""],
    [ar ? "تتبع الطلب" : "Order tracking", db ? "ok" : "down", ""],
    [ar ? "الدردشة المباشرة" : "Live chat", !chatOn ? "off" : db ? "ok" : "down", !chatOn ? (ar ? "غير مفعّلة حالياً — راسلنا عبر واتساب" : "Not active right now — message us on WhatsApp") : ""],
  ];
  const word = { ok: ar ? "يعمل" : "Working", warn: ar ? "تنبيه" : "Notice", down: ar ? "متوقف مؤقتاً" : "Temporarily down", off: ar ? "متوقفة" : "Off" };
  const allOk = rows.every(([, s]) => s === "ok" || s === "off");
  const when = new Date(statusMemo.at).toLocaleString(ar ? "ar-IQ-u-nu-latn" : "en-GB", { timeZone: "Asia/Baghdad", dateStyle: "medium", timeStyle: "short" });
  const body = `<h1>${ar ? "حالة الخدمات" : "Service status"}</h1>
    <p class="lead">${allOk ? (ar ? "كل الخدمات تعمل بشكل طبيعي." : "All services are working normally.") : (ar ? "بعض الخدمات متأثرة الآن، ونعمل على إصلاحها." : "Some services are affected right now; we are on it.")}</p>
    <div class="status">${rows.map(([n, s, note]) => `<div class="status__row"><span class="status__dot status__dot--${s}" aria-hidden="true"></span><b>${n}</b><span class="status__st">${word[s]}</span>${note ? `<small>${esc(note)}</small>` : ""}</div>`).join("")}</div>
    <p class="lead" style="font-size:.875rem">${ar ? "آخر فحص:" : "Last checked:"} ${esc(when)}</p>`;
  return simplePage(request, st, { lang, title: ar ? "حالة الخدمات" : "Service status", description: ar ? "هل خدمات ويكسا تعمل الآن." : "Whether WIXA's services are working right now.", path: "/status", body , ending: false });
}

// ---------------------------------------------------------------- service pages
// GET /services/<slug> — one page per service, with a few projects and a ready WhatsApp question
export async function handleServicePage(request, env, ctx, slug) {
  const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
  let d = {};
  try { d = JSON.parse(raw); } catch {}
  const st = d.settings || {};
  if (cfg.maintenance.on && !hasBypass(request, cfg)) return maintenancePage(request, cfg, st);
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const sv = (d.services || []).find((x) => x.slug === slug || String(x.id) === slug);
  if (!sv) return pageNotFound(request, st);
  const T = (o, f) => o[`${f}_${lang}`] || o[`${f}_ar`] || o[`${f}_en`] || "";
  const wa = String(st.contact?.whatsapp || "").replace(/\D/g, "");
  const ask = ar ? `مرحباً ويكسا، أريد الاستفسار عن: ${T(sv, "title")}` : `Hello WIXA, I'd like to ask about: ${T(sv, "title")}`;
  const projects = (d.projects || []).slice(0, 3);
  const others = (d.services || []).filter((x) => x !== sv);
  const body = `<h1>${esc(T(sv, "title"))}</h1>
    ${T(sv, "summary") ? `<p class="lead">${esc(T(sv, "summary"))}</p>` : ""}
    ${detailsHtml(T(sv, "details"))}
    ${st.chat?.on ? `<p class="actions" style="margin-top:20px"><button type="button" class="btn btn--primary btn--chat" data-open-chat data-topic="svc" data-service="${esc(T(sv, "title"))}"><svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1121 12z"/></svg>${ar ? "اسأل عن هذه الخدمة في المحادثة المباشرة" : "Ask about this service in live chat"}</button></p>`
      : wa ? `<p><a class="btn btn--wa" href="https://wa.me/${wa}?text=${encodeURIComponent(ask)}" target="_blank" rel="noopener">${ar ? "اسأل عن هذه الخدمة عبر واتساب" : "Ask about this service on WhatsApp"}</a></p>` : ""}
    ${projects.length ? `<section class="more"><h2>${ar ? "من أعمالنا" : "From our work"}</h2><div class="more__grid">${projects.map((o) => `<a href="/projects/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(T(o, "title"))}</b><span>${esc(T(o, "category") || snip(T(o, "summary"), 70))}</span></a>`).join("")}</div></section>` : ""}
    ${others.length ? `<section class="more"><h2>${ar ? "خدمات أخرى" : "Other services"}</h2><div class="more__grid">${others.map((o) => `<a href="/services/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(T(o, "title"))}</b><span>${esc(snip(T(o, "summary"), 90))}</span></a>`).join("")}</div></section>` : ""}`;
  const origin = new URL(request.url).origin;
  return simplePage(request, st, { orderQ: `&svc=${encodeURIComponent(slug)}`, crumbs: [["nav_services", "/services"]], startLabel: ar ? "اطلب هذه الخدمة" : "Request this service",
    lang, title: T(sv, "title"), description: (T(sv, "summary") || T(sv, "details")).slice(0, 160), path: `/services/${encodeURIComponent(sv.slug)}`, body,
    jsonld: { "@context": "https://schema.org", "@type": "Service", name: T(sv, "title"), description: T(sv, "summary"), areaServed: "IQ", provider: { "@type": "Organization", name: "WIXA", url: origin } },
  });
}

// Article text: blank lines → paragraphs, "## " → heading, "- " / "• " → list, links become clickable, **bold**.
export function articleHtml(raw) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return String(raw || "").split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return "";
    if (lines.length === 1 && /^#{2,3}\s/.test(lines[0])) return `<h2>${inline(lines[0].replace(/^#+\s*/, ""))}</h2>`;
    let html = "";
    if (/^#{2,3}\s/.test(lines[0])) html += `<h2>${inline(lines.shift().replace(/^#+\s*/, ""))}</h2>`;
    const items = lines.filter((l) => /^[-•]\s?/.test(l)), text = lines.filter((l) => !/^[-•]\s?/.test(l));
    if (text.length) html += `<p>${text.map(inline).join("<br>")}</p>`;
    if (items.length) html += `<ul>${items.map((l) => `<li>${inline(l.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul>`;
    return html;
  }).join("");
}

// GET /blog and /blog/<slug>
export async function handleBlog(request, env, ctx, slug) {
  const [raw, cfg, posts] = await Promise.all([getSiteData(env, ctx), getConfig(env), getPosts(env)]);
  let st = {};
  try { st = JSON.parse(raw).settings || {}; } catch {}
  if (cfg.maintenance.on && !hasBypass(request, cfg)) return maintenancePage(request, cfg, st);
  const lang = pickLang(request, st.default_lang), ar = lang === "ar";
  const T = (o, f) => o[`${f}_${lang}`] || o[`${f}_ar`] || o[`${f}_en`] || "";
  const origin = new URL(request.url).origin;
  if (!slug) {
    const body = `<h1>${ar ? "المقالات" : "Articles"}</h1><p class="lead">${ar ? "أفكار ونصائح عن المواقع والتطبيقات والأنظمة الرقمية." : "Ideas and advice on websites, apps and digital systems."}</p>
      ${posts.length ? `<div class="posts">${posts.map((p) => `<a class="post" href="/blog/${encodeURIComponent(p.slug)}?lang=${lang}">${safeHref(p.cover_url) ? `<img src="${esc(safeHref(p.cover_url))}" alt="" loading="lazy">` : ""}<div><b>${esc(T(p, "title"))}</b><span>${esc(fmtDate(p.published_at || p.created_at, lang))}</span><p>${esc(T(p, "excerpt"))}</p></div></a>`).join("")}</div>` : `<p class="empty">${ar ? "ستُنشر المقالات هنا قريباً." : "Articles will appear here soon."}</p>`}`;
    return simplePage(request, st, { lang, title: ar ? "المقالات" : "Articles", description: ar ? "مقالات ويكسا عن تطوير المواقع والتطبيقات والأنظمة." : "WIXA articles on building websites, apps and systems.", path: "/blog", body });
  }
  const p = posts.find((x) => x.slug === slug);
  if (!p) return pageNotFound(request, st);
  const cover = safeHref(p.cover_url);
  const others = posts.filter((x) => x !== p).slice(0, 3);
  // the article's look: chosen for this article, or for all articles (dashboard → المقالات), else classic
  const look = ["classic", "magazine", "minimal"].find((k) => k === (st.blog?.per?.[p.id] || st.blog?.theme)) || "classic";
  const coverHtml = cover && look !== "minimal" ? `<div class="gallery art__cover"><img src="${esc(cover)}" alt=""></div>` : "";
  const body = `<div class="art art--${look}">${look === "magazine" ? coverHtml : ""}<span class="cat">${esc(fmtDate(p.published_at || p.created_at, lang))}</span><h1>${esc(T(p, "title"))}</h1>
    ${T(p, "excerpt") ? `<p class="lead">${esc(T(p, "excerpt"))}</p>` : ""}
    ${look === "classic" ? coverHtml : ""}
    <article>${articleHtml(T(p, "body"))}</article></div>
    ${others.length ? `<section class="more"><h2>${ar ? "مقالات أخرى" : "More articles"}</h2><div class="more__grid">${others.map((o) => `<a href="/blog/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(T(o, "title"))}</b><span>${esc(snip(T(o, "excerpt"), 90))}</span></a>`).join("")}</div></section>` : ""}`;
  return simplePage(request, st, { crumbs: [["nav_blog", "/blog"]],
    lang, title: T(p, "title"), description: (T(p, "excerpt") || T(p, "body")).slice(0, 160), path: `/blog/${encodeURIComponent(p.slug)}`, image: cover, body,
    jsonld: { "@context": "https://schema.org", "@type": "Article", headline: T(p, "title"), description: T(p, "excerpt"), datePublished: p.published_at || p.created_at, dateModified: p.updated_at, ...(cover ? { image: cover } : {}), author: { "@type": "Organization", name: "WIXA" }, publisher: { "@type": "Organization", name: "WIXA", url: origin }, mainEntityOfPage: `${origin}/blog/${encodeURIComponent(p.slug)}` },
  });
}
