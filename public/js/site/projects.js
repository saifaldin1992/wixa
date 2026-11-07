/* Project details window */
import { $, esc, safeUrl, L, state, lang } from "./core.js";
import { mockUI } from "./render.js";
import { goOrder } from "./order.js";

// ---------- project details modal ----------
function openProject(i) {
  const p = state.projects[i]; if (!p) return;
  const m = $("#pmodal");
  const imgs = [];
  if (p.image_url) imgs.push(`<div class="gimg"><img src="${esc(safeUrl(p.image_url))}" alt=""></div>`);
  (Array.isArray(p.gallery) ? p.gallery : []).forEach((u) => { const s = safeUrl(u); if (s) imgs.push(`<div class="gimg"><img src="${esc(s)}" alt="" loading="lazy"></div>`); });
  if (p.mobile_image_url) imgs.push(`<div class="gimg mob"><img src="${esc(safeUrl(p.mobile_image_url))}" alt=""></div>`);
  $("#pmGallery").innerHTML = imgs.join("") || `<div class="gimg">${mockUI()}</div>`;
  $("#pmCat").textContent = L(p, "category"); $("#pmCat").hidden = !L(p, "category");
  $("#pmTitle").textContent = L(p, "title");
  // details: blank-line separated blocks; a short first line becomes a heading, "•" lines become a list
  const raw = L(p, "details") || L(p, "summary");
  $("#pmText").innerHTML = raw.split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let html = "";
    if (lines.length > 1 && lines[0].length < 40 && !lines[0].startsWith("•")) html += `<h4>${esc(lines.shift())}</h4>`;
    const bullets = lines.filter((l) => /^[•\-–]/.test(l)), text = lines.filter((l) => !/^[•\-–]/.test(l));
    if (text.length) html += `<p>${text.map(esc).join("<br>")}</p>`;
    if (bullets.length) html += `<ul>${bullets.map((l) => `<li>${esc(l.replace(/^[•\-–]\s*/, ""))}</li>`).join("")}</ul>`;
    return html;
  }).join("");
  // case study: the challenge → our solution → the result
  const cs = [["problem", lang === "ar" ? "التحدي" : "The challenge"], ["solution", lang === "ar" ? "الحل" : "Our solution"], ["result", lang === "ar" ? "النتيجة" : "The result"]].filter(([f]) => L(p, f).trim());
  if (cs.length) $("#pmText").insertAdjacentHTML("afterbegin", `<div class="pcase">${cs.map(([f, h]) => `<div><h4>${h}</h4><p>${esc(L(p, f)).replace(/\n/g, "<br>")}</p></div>`).join("")}</div>`);
  const stats = Array.isArray(p.stats) ? p.stats : [];
  $("#pmStats").innerHTML = stats.map((st) => `<div><b>${esc(st.value)}</b><span>${esc(st[`label_${lang}`] || st.label_ar || "")}</span></div>`).join("");
  $("#pmStats").hidden = !stats.length;
  $("#pmPage").href = `/projects/${encodeURIComponent(p.slug || p.id)}`;
  $("#pmCta").onclick = () => { closeProject(); goOrder({ source: "similar", item: L(p, "title") }); };
  m.hidden = false; document.body.style.overflow = "hidden"; window.__lenis?.stop();
  $(".pmodal__x", m).focus();
}
function closeProject() {
  $("#pmodal").hidden = true; document.body.style.overflow = ""; window.__lenis?.start();
}
export function setupProjectModal() {
  $("#projectsList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]"); if (!b) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // new tab → the project's own page
    e.preventDefault(); openProject(+b.dataset.open);
  });
  $("#pmodal").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeProject(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#pmodal").hidden) closeProject(); });
}
