/* Builds every section from the content */
import { $, $$, esc, safeUrl, reducedOS, UI, ICONS, SOCIAL, STORY_ART, C, L, state, lang, anim, setAnim } from "./core.js";
import { buildHeroLogo } from "./hero.js";
import { applyDefaultMode } from "./theme.js";
import { renderProcess, renderTestimonials, observe } from "./sections.js";
import { renderCalc } from "./calculator.js";
const { applyTheme } = window.WIXA;

// ---------- render ----------
function splitWords(el, text) {
  el.innerHTML = String(text).split(/\s+/).filter(Boolean)
    .map((w, i) => `<span class="word"><span style="transition-delay:${i * 70}ms">${esc(w)}</span></span>`).join(" ");
}

export function render() {
  const s = state.settings, c = C(), ui = UI[lang];
  setAnim(!reducedOS && s.animations !== false);
  document.documentElement.classList.toggle("no-anim", !anim);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  applyTheme(s);
  applyDefaultMode();
  const brand = lang === "ar" ? s.brand.name_ar : s.brand.name_en;
  document.title = `${brand} — ${c.hero_title}`;

  $$("[data-c]").forEach((el) => { if (el.id !== "heroTitle") el.textContent = c[el.dataset.c] ?? ""; });
  $$("[data-t]").forEach((el) => {
    if (el.dataset.t !== "brand") { el.textContent = ui[el.dataset.t] ?? ""; return; }
    // the official wordmark, unless a custom logo image was uploaded from the dashboard
    el.innerHTML = s.brand.logo_url ? esc(brand) : `<svg class="wm" viewBox="0 0 716.6 150" aria-hidden="true"><use href="/wordmark.svg#wm"/></svg><span class="sr-only">${esc(brand)}</span>`;
    el.classList.toggle("brand__name--text", !!s.brand.logo_url);
  });
  splitWords($("#heroTitle"), c.hero_title);
  $("#langBtn").textContent = lang === "ar" ? "EN" : "ع";
  $("#langBtn2 span").textContent = ui.lang;

  $$(".brand__mark").forEach((m) => {
    if (s.brand.logo_url) { m.classList.add("has-logo"); m.innerHTML = `<img src="${esc(safeUrl(s.brand.logo_url))}" alt="">`; }
    else { m.classList.remove("has-logo"); m.innerHTML = '<svg viewBox="0 0 2021 982" aria-hidden="true"><use href="/logo.svg#m"/></svg>'; }
  });

  // sections visibility
  for (const [k, on] of Object.entries(s.sections)) {
    $$(`[data-section="${k}"]`).forEach((el) => (el.hidden = !on));
    $$(`[data-sec="${k}"]`).forEach((el) => (el.hidden = !on));
  }
  if (!state.partners.length) { $$('[data-section="partners"], [data-sec="partners"]').forEach((el) => (el.hidden = true)); }
  if (!(state.testimonials || []).length) $$('[data-section="testimonials"]').forEach((el) => (el.hidden = true));
  if (!(s.stats || []).length) $$('[data-section="stats"]').forEach((el) => (el.hidden = true));

  // story
  $("#storyList").innerHTML = (c.story || []).map((it, i) => `
    <article class="story-item">
      <div class="story-item__text reveal-up"><span class="story-item__num">0${i + 1}</span><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></div>
      <div class="story-item__art" aria-hidden="true">${STORY_ART[i % STORY_ART.length]}</div>
    </article>`).join("");

  // projects
  $("#projectsList").innerHTML = state.projects.length ? state.projects.map((p, i) => {
    const link = safeUrl(p.link);
    const stats = Array.isArray(p.stats) ? p.stats : [];
    return `<article class="project">
      <div class="project__body reveal-up">
        ${L(p, "category") ? `<span class="project__cat">${esc(L(p, "category"))}</span>` : ""}
        <h3>${esc(L(p, "title"))}</h3>
        <p>${esc(L(p, "summary"))}</p>
        ${link ? `<a class="project__link" href="${esc(link)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg>${esc(link.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : ""}
        <button type="button" class="project__more" data-open="${i}">${esc(C().details || "")}<svg viewBox="0 0 24 24"><path d="M19 12H5m0 0l6-6m-6 6l6 6"/></svg></button>
        ${stats.length ? `<div class="project__stats">${stats.map((st) => `<div><b>${esc(st.value)}</b><span>${esc(st[`label_${lang}`] || st.label_ar || "")}</span></div>`).join("")}</div>` : ""}
      </div>
      <div class="project__media" data-open="${i}">
        <div class="stage">
          <div class="layer layer--screen"><div class="screen"><div class="screen__bar"><i></i><i></i><i></i></div>${p.image_url ? `<img src="${esc(safeUrl(p.image_url))}" alt="" loading="lazy">` : mockUI()}</div></div>
          <div class="layer layer--phone"><div class="phone">${p.mobile_image_url ? `<img src="${esc(safeUrl(p.mobile_image_url))}" alt="" loading="lazy">` : mockUI()}</div></div>
        </div>
      </div>
    </article>`;
  }).join("") : `<p class="empty">${ui.no_projects}</p>`;

  // services
  $("#servicesGrid").innerHTML = state.services.map((sv) => `
    <article class="svc reveal-up"><div class="svc__ico">${ICONS[sv.icon] || ICONS.code}</div><h3>${esc(L(sv, "title"))}</h3><p>${esc(L(sv, "summary"))}</p></article>`).join("");
  $$(".svc").forEach((el) => el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect(); el.style.setProperty("--mx", `${e.clientX - r.left}px`); el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }));

  // 3D tilt that follows the pointer
  if (matchMedia("(hover: hover)").matches) $$(".project__media").forEach((m) => {
    m.addEventListener("pointermove", (e) => {
      if (!anim) return;
      const r = m.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      m.style.setProperty("--tilt-y", `${x * 16}deg`);
      m.style.setProperty("--tilt-x", `${-y * 10}deg`);
    });
    m.addEventListener("pointerleave", () => { m.style.removeProperty("--tilt-y"); m.style.removeProperty("--tilt-x"); });
  });

  // stats
  $("#statsGrid").innerHTML = (s.stats || []).map((st) => `
    <div class="stat reveal-up"><b><span data-count="${Number(st.value) || 0}">${anim ? 0 : Number(st.value) || 0}</span><em>${esc(st.suffix || "")}</em></b><span>${esc(st[`label_${lang}`] || st.label_ar || "")}</span></div>`).join("");

  // partners
  const marquee = s.partners_style === "marquee";
  $("#partnersGrid").classList.toggle("is-marquee", marquee);
  const partnerCards = state.partners.map((p) => {
    const inner = p.logo_url ? `<img src="${esc(safeUrl(p.logo_url))}" alt="${esc(p.name)}" loading="lazy">` : `<span>${esc(p.name)}</span>`;
    const link = safeUrl(p.link);
    return link ? `<a class="partner" href="${esc(link)}" target="_blank" rel="noopener" title="${esc(p.name)}">${inner}</a>` : `<div class="partner" title="${esc(p.name)}">${inner}</div>`;
  });
  if (marquee && partnerCards.length) {
    // repeat so one half always fills the screen, then duplicate for a seamless loop
    let base = partnerCards.slice(); while (base.length < 8) base = base.concat(partnerCards);
    $("#partnersGrid").innerHTML = `<div class="partners__track" style="--dur:${Math.max(20, base.length * 3)}s">${base.join("") + base.join("")}</div>`;
  } else $("#partnersGrid").innerHTML = partnerCards.join("");

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

  buildHeroLogo();
  // "WIXA wave": the logo's double curve as a signature ornament above every section title
  // "WIXA wave": a long wave line opens every section (and the closing call to action), so each part reads as its own block
  $$(".head, .cta").forEach((h, i) => { if (!h.querySelector(":scope > .wave")) h.insertAdjacentHTML("afterbegin", `<svg class="wave" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wv${i}" x1="0" x2="1"><stop offset="0" style="stop-color:var(--fg)"/><stop offset=".5" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--fg)"/></linearGradient></defs><path pathLength="1" stroke="url(#wv${i})" d="M0 20 C 100 0, 200 0, 300 20 S 500 40, 600 20 S 800 0, 900 20 S 1100 40, 1200 20"/></svg>`); });
  renderProcess();
  renderTestimonials();
  renderCalc();
  observe();
  if (window.ScrollTrigger) ScrollTrigger.refresh();
}

export function mockUI() {
  return `<div class="mock"><div class="mock__row"><div class="mock__card"></div><div class="mock__card"></div><div class="mock__card"></div></div>
    <div class="mock__chart"><svg viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0 50 C30 40 40 20 70 28 S120 50 140 22 180 10 200 14"/></svg></div>
    <div class="mock__line"></div><div class="mock__line"></div><div class="mock__line"></div></div>`;
}
