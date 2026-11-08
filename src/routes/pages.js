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
import { cspWithTags, getConfig, getPosts, getSiteData, hasBypass, maintenancePage } from "../services/data.js";

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
export const PAGE_TITLES = { about: { ar: "من نحن", en: "About us" }, careers: { ar: "الوظائف", en: "Careers" }, contact: { ar: "تواصل معنا", en: "Contact us" }, order: { ar: "اطلب مشروعك", en: "Order your project" }, track: { ar: "تتبع طلبك", en: "Track your order" }, faq: { ar: "الأسئلة الشائعة", en: "Frequently asked questions" } };
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
  const pc = st.content?.[lang] || {}, brandName = (lang === "en" ? st.brand?.name_en : st.brand?.name_ar) || "WIXA";
  const pageDesc = { about: pc.about_text, careers: pc.careers_sub, contact: pc.cta_sub, faq: pc.faq_sub, order: pc.pricing_sub, track: pc.pricing_sub }[pageName];
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
  const navAt = Object.fromEntries(WIXA.navPlan(st).map((x, i) => [x.k, { at: x.at, i }]));
  const themeCss = `<style id="wixa-theme">:root{${Object.entries(vars).map(([k, v]) => `${k}:${String(v).replace(/[<>{};]/g, "")}`).join(";")}}</style>`;
  const fontHref = full.font?.family && full.font.family !== "Alexandria" && WIXA.FONTS[full.font.family]
    ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(full.font.family).replace(/%20/g, "+")}:wght@${WIXA.FONTS[full.font.family]}&display=swap` : "";
  const res = versionAssets(new HTMLRewriter())
    .on("head", { element: (el) => el.append(`${headTags}<script id="wixa-data" type="application/json">${safe}</script>`, { html: true }) })
    .on("html", { element: (el) => { el.setAttribute("lang", lang); el.setAttribute("dir", lang === "ar" ? "rtl" : "ltr"); el.setAttribute("data-page", pageName); } })
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
    .on("[data-nav]", { element: (el) => {
      const p = navAt[el.getAttribute("data-nav")]; if (!p) return;
      el.setAttribute("style", `order:${p.i}`);
      // the footer copy decides by "footer", the top bar and phone menu by "menu"
      if (el.getAttribute("data-where") === "footer" ? !["both", "footer"].includes(p.at) : !["both", "menu"].includes(p.at)) el.setAttribute("hidden", ""); else if (!hide.has(el.getAttribute("data-sec") || "")) el.removeAttribute("hidden");
    } })
    .on("#langBtn", { element: (el) => el.setInnerContent(lang === "ar" ? "EN" : "ع") })
    .on(".footer__nav", { element: (el) => { const row = footerLegal(st, lang, "/"); if (row) el.after(row, { html: true }); } })
    .on("#processMore", { element: (el) => {
      // under «كيف نعمل»: where the terms and the payment policy are written down
      const q = lang === "ar" ? "" : "?lang=en";
      const ps = sitePages(st).filter((p) => p.published && ["terms", "payment"].includes(p.id));
      if (!ps.length) return;
      el.setInnerContent(`${lang === "ar" ? "التفاصيل مكتوبة في:" : "It is all written down in:"} ${ps.map((p) => `<a href="${p.path}${q}">${esc(p[`title_${lang}`] || p.title_ar)}</a>`).join(" · ")}`, { html: true });
      el.removeAttribute("hidden");
    } })
    .on(".hero", { element: (el) => el.setAttribute("class", `${el.getAttribute("class") || ""} in in-hero`) })
    .on("body", { element: (el) => el.removeAttribute("class") })
    .on("body", { element: (el) => {
      if (!preview) el.append(beacon(env), { html: true });
      if (Object.keys(tags).length) el.append(`<script id="wixa-tags" type="application/json">${JSON.stringify(tags)}</script><script type="module" src="${versioned("/build/tags.js")}"></script>`, { html: true });
      if (cfg.maintenance.on && owner && !preview) el.append('<div style="position:fixed;inset:auto 12px 12px auto;z-index:99999;background:#B45309;color:#fff;padding:8px 14px;border-radius:10px;font:600 13px system-ui,Tahoma,sans-serif">وضع الصيانة مفعّل — الزوار يرون صفحة «نعود قريباً»</div>', { html: true });
    } })
    .transform(page);
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

// The site's header (logo, menu, theme, language, "start your project") and footer for the server-built pages,
// with the same classes as the home page so they share one stylesheet and one look.
// The small row of company pages under the footer links: pages added from the dashboard, our team, services status
export function footerLegal(st, lang, path = "") {
  const q = lang === "ar" ? "" : "?lang=en";
  const team = { ...TEAM_DEFAULTS, ...(st.team || {}) }, status = { ...STATUS_DEFAULTS, ...(st.status_page || {}) };
  const links = [
    ...sitePages(st).filter((p) => p.published && p.footer).map((p) => [p.path, p[`title_${lang}`] || p.title_ar || p.title_en]),
    ...(team.on && team.footer ? [["/team", team[`title_${lang}`] || TEAM_DEFAULTS[`title_${lang}`]]] : []),
    ...(status.on && status.footer ? [["/status", lang === "ar" ? "حالة الخدمات" : "Service status"]] : []),
  ].filter(([, t]) => t);
  return links.length ? `<nav class="footer__legal" aria-label="${lang === "ar" ? "صفحات الشركة" : "Company pages"}">${links.map(([h, t]) => `<a href="${h}${q}"${path === h ? ' aria-current="page"' : ""}>${esc(t)}</a>`).join("")}</nav>` : "";
}
// A page's text: [{h, p}] → headings and paragraphs; "{email}" becomes the contact email link
const sectionsHtml = (list, email) => {
  const mail = `<a href="mailto:${esc(email)}">${esc(email)}</a>`;
  return (Array.isArray(list) ? list : []).filter((x) => x?.h || x?.p)
    .map((x) => `${x.h ? `<h2>${esc(x.h)}</h2>` : ""}${x.p ? `<p>${esc(x.p).split("{email}").join(mail).replace(/\n/g, "<br>")}</p>` : ""}`).join("");
};

export function siteShell(st, lang, path) {
  const ar = lang === "ar", q = ar ? "" : "?lang=en", other = ar ? "en" : "ar";
  const ui = { ...UI_DEFAULTS[lang] };
  for (const [k, v] of Object.entries(st.ui?.[lang] || {})) if (typeof v === "string" && v.trim() && k in ui) ui[k] = v;
  const HREF = { home: "/", services: "/#services", industries: "/#industries", projects: "/#projects", pricing: "/#pricing", calc: "/#calculator", about: "/about", partners: "/#partners", careers: "/careers", contact: "/contact", faq: "/faq", blog: "/blog", privacy: "/privacy" };
  const LABEL = (k) => ui[k === "privacy" ? "privacy" : `nav_${k}`] || k;
  const href = (k) => { const h = HREF[k] || "/"; const [p, hash] = h.split("#"); return `${p}${q}${hash ? `#${hash}` : ""}`; };
  const plan = WIXA.navPlan(st);
  const link = (x, where) => `<a href="${href(x.k)}"${path === HREF[x.k] ? ' aria-current="page"' : ""}>${esc(LABEL(x.k))}</a>`;
  const top = plan.filter((x) => x.at === "both" || x.at === "menu"), foot = plan.filter((x) => x.at === "both" || x.at === "footer");
  const mark = '<span class="brand__mark"><svg viewBox="0 0 2021 982" aria-hidden="true"><use href="/logo.svg#m"/></svg></span>';
  const word = `<span class="brand__name"><svg class="wm" viewBox="0 0 716.6 150" aria-hidden="true"><use href="/wordmark.svg#wm"/></svg><span class="sr-only">${ar ? "ويكسا" : "WIXA"}</span></span>`;
  const c = st.contact || {};
  const host = { instagram: "www.instagram.com", x: "x.com", linkedin: "www.linkedin.com", facebook: "www.facebook.com" };
  const social = (k) => { let v = String(c[k] || "").trim(); if (!v) return ""; if (!/^https?:\/\/[^/]+\.[a-z]{2,}/i.test(v)) v = `https://${host[k]}/${v.replace(/^https?:\/\//i, "").replace(/^@/, "").replace(/^(www\.)?(instagram|facebook|linkedin|x|twitter)(\.com)?\/?/i, "").replace(/^\/+/, "")}`; return safeHref(v); };
  const socials = ["instagram", "x", "linkedin", "facebook"].map((k) => [k, social(k)]).filter(([, u]) => u).map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${k}">${SOCIAL[k]}</a>`).join("")
    + (c.email ? `<a href="mailto:${esc(c.email)}" aria-label="email"><svg viewBox="0 0 24 24"><path d="M3 5h18v14H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 6l9 7 9-7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></a>` : "");
  const header = `<header class="header" id="header"><div class="header__bar">
    <a href="/${q}" class="brand" aria-label="WIXA">${mark}${word}</a>
    <nav class="header__nav" aria-label="main">${top.map((x) => link(x)).join("")}<a href="/order${q}" class="nav-cta" data-start>${esc(ui.nav_start)}</a></nav>
    <div class="header__end">
      <button class="theme-btn" id="tbtn" data-theme-toggle type="button" aria-label="${ar ? "الوضع الليلي / النهاري" : "Dark / light mode"}"><svg class="moon" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/></svg><svg class="sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
      <a class="pill-btn lang-btn" href="${path}?lang=${other}" hreflang="${other}">${ar ? "EN" : "ع"}</a>
      <button class="menu-btn" id="menuBtn" type="button" aria-label="menu" aria-expanded="false"><span></span><span></span></button>
    </div></div>
    <div class="header__menu" id="menu"><a href="/order${q}" class="menu-cta" data-start>${esc(ui.nav_start)}</a>${top.map((x) => link(x)).join("")}</div></header>`;
  const footer = `<footer class="footer">
    <svg class="footer__wave footer__wave--brand" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="fwv" x1="0" x2="1"><stop offset="0" style="stop-color:var(--fg)"/><stop offset=".5" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--fg)"/></linearGradient></defs><path pathLength="1" stroke="url(#fwv)" d="M0 20 C 100 0, 200 0, 300 20 S 500 40, 600 20 S 800 0, 900 20 S 1100 40, 1200 20"/></svg>
    <svg class="footer__wave" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M0 20 C 100 0, 200 0, 300 20 S 500 40, 600 20 S 800 0, 900 20 S 1100 40, 1200 20"/></svg>
    <nav class="footer__nav">${foot.map((x) => link(x)).join("")}</nav>${footerLegal(st, lang, path)}
    <div class="footer__tools"><a href="/track${q}" class="track-btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg><span>${esc(ui.track)}</span></a><div class="footer__social">${socials}</div></div>
    <div class="footer__brand"><a href="/${q}" class="brand">${mark}${word}</a></div>
    <p class="footer__credit">${esc(st.content?.[lang]?.footer_text || (ar ? "طُوّر بواسطة فريق ويكسا" : "Developed by the WIXA team"))} · © ${new Date().getFullYear()}</p></footer>`;
  return { header, footer, ui };
}

// One page layout shared by service and project pages, articles, the privacy policy and the review form:
// the site's own stylesheet, header, menu and footer, with the page's content in the middle.
export function simplePage(request, st, { lang, title, description, path, image, body, jsonld, status = 200, orderQ = "" }) {
  const ar = lang === "ar";
  const origin = new URL(request.url).origin;
  const t = st.theme || {};
  const color = /^#[0-9a-f]{3,8}$/i.test(t.primary || "") ? t.primary : "#5B21B6";
  const font = String(st.font?.family || "Alexandria").replace(/[^\w\s-]/g, "");
  const brand = (ar ? st.brand?.name_ar : st.brand?.name_en) || (ar ? "ويكسا" : "WIXA");
  const c = st.contact || {};
  const wa = String(c.whatsapp || "").replace(/\D/g, "");
  const shell = siteShell(st, lang, path), ui = shell.ui;
  const html = `<!doctype html><html lang="${lang}" dir="${ar ? "rtl" : "ltr"}" data-mode="${st.mode === "light" || st.mode === "dark" ? st.mode : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(brand)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${origin}${path}?lang=${lang}"><link rel="alternate" hreflang="ar" href="${origin}${path}?lang=ar"><link rel="alternate" hreflang="en" href="${origin}${path}?lang=en">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${origin}${path}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
${font === "Alexandria" ? '<link rel="preload" href="/fonts/alexandria/alexandria-arabic-800-normal.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/fonts/alexandria.css">' : `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;700;800&display=swap">`}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
<script src="/theme-pre.js"></script>
<link rel="stylesheet" href="${versioned("/build/site.css")}">
<style id="wixa-theme">:root{${Object.entries(WIXA.themeVars(WIXA.merge(WIXA.DEFAULTS, st), st.font?.family)).map(([k, v]) => `${k}:${String(v).replace(/[<>{};]/g, "")}`).join(";")}}</style>
<style>
/* page body on the site's colours: the content blocks below keep their own small layout */
.page{--p:var(--primary);--t:var(--text);--m:var(--muted);--l:var(--line);--s:var(--surface);max-width:var(--read,820px);margin:0 auto;padding:calc(var(--bar-end,78px) + var(--page-top,40px)) var(--gutter) clamp(48px,8vw,80px)}
html[data-theme="dark"] .page{--p:var(--fg)}
.page h1{font-size:var(--fs-h2,1.75rem);line-height:1.25;margin:0 0 12px;text-align:center;text-wrap:balance}
.page h2{font-size:1.25rem;margin:30px 0 8px}
.page>.lead,.page .lead{font-size:1.0625rem;color:var(--m);text-align:center;max-width:620px;margin-inline:auto}
.page .cat{display:table;margin:0 auto 6px;font-size:.8rem;font-weight:700;padding:3px 12px;border-radius:99px;background:color-mix(in srgb,var(--p) 12%,transparent);color:var(--p)}
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
.page a:not(.btn):not(.post):not(.more__grid a){color:var(--p);text-decoration:underline;text-underline-offset:3px}
.page .rv{display:grid;gap:14px;margin-top:20px}.page .rv label{display:grid;gap:6px;font-weight:700;color:var(--t)}.page .rv input,.page .rv textarea{font:inherit;min-height:48px;padding:12px 14px;border-radius:var(--radius-sm,14px);border:1px solid var(--line-2);background:var(--s);color:var(--t);width:100%;box-sizing:border-box}
.page .rv fieldset{border:0;padding:0;margin:0}.page .rv legend{font-weight:700;margin-bottom:6px;color:var(--t)}.page .stars{display:flex;flex-wrap:wrap;gap:6px}
.page .star input{position:absolute;opacity:0}.page .star span{display:inline-block;padding:6px 12px;border-radius:99px;border:1px solid var(--l);background:var(--s);color:#D9A441;cursor:pointer}
.page .star input:checked+span{border-color:var(--p);box-shadow:0 0 0 3px color-mix(in srgb,var(--p) 20%,transparent)}.page .rv .btn{justify-self:center;border:0;cursor:pointer}
.page .hp{position:absolute;left:-9999px;opacity:0}
.page .btn--wa{background:#25D366;color:#fff}
.page .team{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-top:24px}.page .team__m{padding:var(--card-pad,18px);border-radius:var(--radius,22px);border:1px solid var(--l);background:var(--s);text-align:center}
.page .team__m img,.page .team__av{width:96px;height:96px;border-radius:50%;object-fit:cover;margin:0 auto 10px;display:grid;place-items:center;background:color-mix(in srgb,var(--p) 12%,transparent);color:var(--p);font-size:2rem;font-weight:800}
.page .team__m b{display:block;color:var(--t);font-size:1.0625rem}.page .team__m span{display:block;color:var(--p);font-size:.875rem;font-weight:700}.page .team__m p{margin:8px 0 0;font-size:.92rem;line-height:1.7}
.page .status{display:grid;gap:10px;margin:24px 0}.page .status__row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:14px 18px;border-radius:var(--radius,22px);border:1px solid var(--l);background:var(--s)}
.page .status__row b{color:var(--t)}.page .status__row small{grid-column:2/-1;color:var(--m);font-size:.85rem}.page .status__st{font-weight:700;color:var(--m)}
.page .status__dot{width:12px;height:12px;border-radius:50%;background:#0E7C47;box-shadow:0 0 0 4px color-mix(in srgb,#0E7C47 18%,transparent)}.page .status__dot--warn{background:#B45309;box-shadow:0 0 0 4px color-mix(in srgb,#B45309 18%,transparent)}.page .status__dot--down{background:#B91C1C;box-shadow:0 0 0 4px color-mix(in srgb,#B91C1C 18%,transparent)}.page .status__dot--off{background:#9CA3AF;box-shadow:none}
.footer__wave path{stroke-dashoffset:0}
.header .lang-btn{display:inline-grid;place-items:center;text-decoration:none;color:var(--text);line-height:1}
</style></head><body>
${shell.header}
<div class="scrim" id="scrim"></div>
<main class="page">${body}
<div class="actions"><a class="btn btn--primary" data-start href="/order?lang=${lang}${orderQ}">${ui.nav_start}</a><a class="btn btn--ghost" href="/contact?lang=${lang}">${ui.nav_contact}</a></div></main>
${shell.footer}
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
  if (!p) return env.ASSETS.fetch(new Request(new URL("/404", request.url), request)).then((r) => new Response(r.body, { status: 404, headers: r.headers }));
  const T = (f) => p[`${f}_${lang}`] || p[`${f}_ar`] || p[`${f}_en`] || "";
  const imgs = [p.image_url, ...(Array.isArray(p.gallery) ? p.gallery : [])].map(safeHref).filter(Boolean);
  const mob = safeHref(p.mobile_image_url);
  const stats = Array.isArray(p.stats) ? p.stats.filter((x) => String(x.value || "").trim()) : [];
  const link = safeHref(p.link);
  const others = (d.projects || []).filter((x) => x !== p).slice(0, 3);
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
    ${others.length ? `<section class="more"><h2>${lang === "ar" ? "مشاريع أخرى" : "More projects"}</h2><div class="more__grid">${others.map((o) => {
      const t = (f) => o[`${f}_${lang}`] || o[`${f}_ar`] || o[`${f}_en`] || "";
      return `<a href="/projects/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(t("title"))}</b><span>${esc(t("category") || t("summary").slice(0, 70))}</span></a>`;
    }).join("")}</div></section>` : ""}`;
  return simplePage(request, st, { orderQ: `&project=${encodeURIComponent(slug)}`,
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
  return simplePage(request, st, { lang, title: ar ? "سياسة الخصوصية" : "Privacy policy", description: ar ? "كيف تجمع ويكسا بياناتك وتستخدمها وتحميها." : "How WIXA collects, uses and protects your data.", path: "/privacy", body });
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
  return simplePage(request, st, { lang, title, description: String(pg[`desc_${lang}`] || pg.desc_ar || title).slice(0, 160), path, body });
}

// GET /team — our team (names, roles, photos from the dashboard). 404 until it is switched on.
export async function handleTeam(request, env, ctx) {
  const [raw, cfg] = await Promise.all([getSiteData(env, ctx), getConfig(env)]);
  let st = {};
  try { st = JSON.parse(raw).settings || {}; } catch {}
  const t = { ...TEAM_DEFAULTS, ...(st.team || {}) };
  if (!t.on) return notFound(request, env);
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
  if (!{ ...STATUS_DEFAULTS, ...(st.status_page || {}) }.on) return notFound(request, env);
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
  return simplePage(request, st, { lang, title: ar ? "حالة الخدمات" : "Service status", description: ar ? "هل خدمات ويكسا تعمل الآن." : "Whether WIXA's services are working right now.", path: "/status", body });
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
  if (!sv) return notFound(request, env);
  const T = (o, f) => o[`${f}_${lang}`] || o[`${f}_ar`] || o[`${f}_en`] || "";
  const wa = String(st.contact?.whatsapp || "").replace(/\D/g, "");
  const ask = ar ? `مرحباً ويكسا، أريد الاستفسار عن: ${T(sv, "title")}` : `Hello WIXA, I'd like to ask about: ${T(sv, "title")}`;
  const projects = (d.projects || []).slice(0, 3);
  const others = (d.services || []).filter((x) => x !== sv);
  const body = `<span class="cat">${ar ? "خدماتنا" : "Our services"}</span><h1>${esc(T(sv, "title"))}</h1>
    ${T(sv, "summary") ? `<p class="lead">${esc(T(sv, "summary"))}</p>` : ""}
    ${detailsHtml(T(sv, "details"))}
    ${wa ? `<p><a class="btn btn--wa" href="https://wa.me/${wa}?text=${encodeURIComponent(ask)}" target="_blank" rel="noopener">${ar ? "اسأل عن هذه الخدمة عبر واتساب" : "Ask about this service on WhatsApp"}</a></p>` : ""}
    ${projects.length ? `<section class="more"><h2>${ar ? "من أعمالنا" : "From our work"}</h2><div class="more__grid">${projects.map((o) => `<a href="/projects/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(T(o, "title"))}</b><span>${esc(T(o, "category") || T(o, "summary").slice(0, 70))}</span></a>`).join("")}</div></section>` : ""}
    ${others.length ? `<section class="more"><h2>${ar ? "خدمات أخرى" : "Other services"}</h2><div class="more__grid">${others.map((o) => `<a href="/services/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(T(o, "title"))}</b><span>${esc(T(o, "summary").slice(0, 80))}</span></a>`).join("")}</div></section>` : ""}`;
  const origin = new URL(request.url).origin;
  return simplePage(request, st, { orderQ: `&svc=${encodeURIComponent(slug)}`,
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
  if (!p) return notFound(request, env);
  const cover = safeHref(p.cover_url);
  const others = posts.filter((x) => x !== p).slice(0, 3);
  const body = `<span class="cat">${esc(fmtDate(p.published_at || p.created_at, lang))}</span><h1>${esc(T(p, "title"))}</h1>
    ${T(p, "excerpt") ? `<p class="lead">${esc(T(p, "excerpt"))}</p>` : ""}
    ${cover ? `<div class="gallery"><img src="${esc(cover)}" alt=""></div>` : ""}
    <article>${articleHtml(T(p, "body"))}</article>
    ${others.length ? `<section class="more"><h2>${ar ? "مقالات أخرى" : "More articles"}</h2><div class="more__grid">${others.map((o) => `<a href="/blog/${encodeURIComponent(o.slug)}?lang=${lang}"><b>${esc(T(o, "title"))}</b><span>${esc(T(o, "excerpt").slice(0, 80))}</span></a>`).join("")}</div></section>` : ""}`;
  return simplePage(request, st, {
    lang, title: T(p, "title"), description: (T(p, "excerpt") || T(p, "body")).slice(0, 160), path: `/blog/${encodeURIComponent(p.slug)}`, image: cover, body,
    jsonld: { "@context": "https://schema.org", "@type": "Article", headline: T(p, "title"), description: T(p, "excerpt"), datePublished: p.published_at || p.created_at, dateModified: p.updated_at, ...(cover ? { image: cover } : {}), author: { "@type": "Organization", name: "WIXA" }, publisher: { "@type": "Organization", name: "WIXA", url: origin }, mainEntityOfPage: `${origin}/blog/${encodeURIComponent(p.slug)}` },
  });
}
