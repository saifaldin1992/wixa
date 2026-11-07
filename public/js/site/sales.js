/* Sales sections: about us, solutions by field, guarantees and packages — all edited in the dashboard
   (المحتوى ← من نحن / المجالات / الضمانات / الباقات). A section with nothing in it stays hidden. */
import { $, $$, ICONS, UI, C, esc, lang } from "./core.js";
import { openContact } from "./contact.js";

const para = (t) => esc(t).split(/\n\s*\n/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
const show = (sel, on) => { const s = $(sel); if (s) s.classList.toggle("is-empty", !on); };

export function renderSales() {
  const c = C(), ui = UI[lang];
  // about
  $("#aboutBody").innerHTML = para(c.about_text || "");
  $("#aboutPoints").innerHTML = (c.about_points || []).filter((x) => x.title).map((x, i) =>
    `<div class="apoint reveal-up"><span class="apoint__n">${String(i + 1).padStart(2, "0")}</span><div><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div></div>`).join("");
  show("#about", (c.about_text || "").trim());
  // industries
  const inds = (c.industries || []).filter((x) => x.title);
  $("#industriesGrid").innerHTML = inds.map((x, i) => `<article class="ind reveal-up">
      <i class="ind__ico">${ICONS[x.icon] || ICONS.code}</i><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p>
      <div class="ind__foot">${x.price ? `<b>${esc(x.price)}</b>` : "<span></span>"}<button type="button" class="ind__cta" data-ind="${i}">${ui.ind_cta} ${lang === "ar" ? "←" : "→"}</button></div></article>`).join("");
  show("#industries", inds.length);
  // guarantees
  const gs = (c.guarantees || []).filter((x) => x.title);
  $("#guaranteesGrid").innerHTML = gs.map((x) => `<div class="guar reveal-up"><span class="guar__ok" aria-hidden="true">✓</span><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div>`).join("");
  show("#guarantees", gs.length);
  // packages
  const home = document.documentElement.dataset.page === "home";
  const allPk = (c.packages || []).filter((x) => x.name);
  const pk = home ? allPk.slice(0, 3) : allPk; // the homepage shows a taste; /pricing shows everything
  $(".pricing__more")?.toggleAttribute("hidden", !home || allPk.length <= 3);
  $("#pricingGrid").innerHTML = pk.map((x, i) => `<article class="pkg reveal-up ${x.featured ? "pkg--featured" : ""}">
      ${x.featured ? `<span class="pkg__badge">${ui.pkg_featured}</span>` : ""}
      <h3>${esc(x.name)}</h3><p class="pkg__desc">${esc(x.desc)}</p>
      <div class="pkg__price">${x.from ? `<small>${ui.pkg_from}</small>` : ""}<b dir="ltr" class="${/\d/.test(x.price || "") ? "" : "pkg__price--text"}">${esc(x.price)}</b></div>
      <ul>${String(x.features || "").split("\n").map((f) => f.trim()).filter(Boolean).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      <button type="button" class="btn ${x.featured ? "btn--primary" : "btn--ghost"} pkg__cta" data-pkg="${i}">${ui.pkg_cta}</button></article>`).join("");
  show("#pricing", pk.length);
  // services: "by service" / "by your field"
  const tab = (name) => {
    $$("#svcTabs [data-tab]").forEach((b) => { b.classList.toggle("on", b.dataset.tab === name); b.setAttribute("aria-selected", b.dataset.tab === name); });
    $("#servicesGrid").hidden = name !== "services"; $("#industries").hidden = name !== "industries";
  };
  if (!$("#svcTabs").dataset.bound) {
    $("#svcTabs").dataset.bound = 1;
    $("#svcTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) tab(b.dataset.tab); });
    const fromHash = () => { if (location.hash === "#industries") { tab("industries"); $("#services").scrollIntoView({ behavior: "smooth" }); } };
    addEventListener("hashchange", fromHash); setTimeout(fromHash, 300);
  }
  if (!$("#pricing").dataset.bound) {
    $("#pricing").dataset.bound = 1;
    $("#pricingGrid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-pkg]"); if (!b) return;
      const p = (C().packages || []).filter((x) => x.name)[+b.dataset.pkg]; // the teaser shows the first ones, so indexes match
      openContact(lang === "ar" ? `أرغب بباقة: ${p.name}` : `I'd like the package: ${p.name}`);
    });
    $("#industriesGrid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-ind]"); if (!b) return;
      const x = (C().industries || []).filter((y) => y.title)[+b.dataset.ind];
      openContact(lang === "ar" ? `أريد حلاً لمجالي: ${x.title}` : `I'd like a solution for: ${x.title}`);
    });
  }
}
