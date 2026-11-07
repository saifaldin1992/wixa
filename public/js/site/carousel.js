/* Phones and tablets: packages and projects become swipeable rows with dots under them (desktop keeps the grid). */
const MQ = matchMedia("(max-width: 1080px)");
const LISTS = ["#pricingGrid", "#projectsList", "#servicesGrid", "#industriesGrid"];

export function carousels() {
  for (const sel of LISTS) {
    const list = document.querySelector(sel);
    if (!list) continue;
    let dots = list.nextElementSibling?.classList.contains("cdots") ? list.nextElementSibling : null;
    const items = [...list.children].filter((el) => el.offsetParent !== null || !MQ.matches);
    if (!MQ.matches || items.length < 2) { dots?.remove(); continue; }
    if (!dots) { dots = document.createElement("div"); dots.className = "cdots"; list.after(dots); }
    dots.innerHTML = items.map((_, i) => `<button type="button" aria-label="${i + 1} / ${items.length}"></button>`).join("");
    const btns = [...dots.children];
    const active = () => {
      const mid = list.getBoundingClientRect().left + list.clientWidth / 2;
      let best = 0, d = Infinity;
      items.forEach((el, i) => { const r = el.getBoundingClientRect(), x = Math.abs(r.left + r.width / 2 - mid); if (x < d) { d = x; best = i; } });
      btns.forEach((b, i) => b.classList.toggle("on", i === best));
    };
    btns.forEach((b, i) => (b.onclick = () => items[i].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })));
    if (!list.dataset.car) { list.dataset.car = 1; list.addEventListener("scroll", () => requestAnimationFrame(active), { passive: true }); }
    active(); setTimeout(active, 400); // again once fonts and images have settled
    if (!list.dataset.ro) { list.dataset.ro = 1; new ResizeObserver(() => requestAnimationFrame(active)).observe(list); }
  }
}
MQ.addEventListener?.("change", carousels);
