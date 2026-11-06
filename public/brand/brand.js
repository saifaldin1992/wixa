// Brand guide: logo download cards + click-to-copy colours.
(() => {
  const variants = [
    ["lockup", "مع العبارة"], ["horizontal", "أفقي"], ["stacked", "عمودي"], ["symbol", "الرمز"],
  ];
  const colours = [["color", "ملوّن", ""], ["color-dark", "للخلفية الداكنة", "dark"], ["white", "أبيض", "brand"], ["black", "أسود", ""]];
  const cards = [];
  for (const [v, vl] of variants) for (const [c, cl, bg] of colours) {
    const f = `wixa-${v}-${c}`;
    cards.push(`<div class="card"><div class="art ${bg}"><img src="/brand/${f}.svg" alt="" loading="lazy"></div>
      <div class="meta"><b>${vl} · ${cl}</b><span class="dl"><a href="/brand/${f}.svg" download>SVG</a><a href="/brand/png/${f}.png" download>PNG</a></span></div></div>`);
  }
  document.getElementById("logos").innerHTML = cards.join("");

  document.querySelectorAll(".sw").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.hex); } catch {}
    b.classList.add("copied"); setTimeout(() => b.classList.remove("copied"), 1400);
  }));
})();
