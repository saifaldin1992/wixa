// Site size rules, as a customer sees them, on a phone, a tablet and a computer, for every page:
//  1. nothing is wider than the screen (no sideways scrolling);
//  2. every card and panel uses one of the three corner sizes (controls 14 · cards 22 · panels 28) or a pill;
//  3. every row of cards is centred and as wide as one of the three page widths
//     (wide 1240 · reading 820 · narrow 560, minus the side gutters), or is one column of a two-column section that
//     starts at the page edge — so no page or section has its own width;
//  4. on inner pages the first title or panel sits the same distance under the header bar (40 / 48 / 64px);
//  5. every section has the same gap after it (56 / 80 / 104px) and none above it.
// Usage: BASE=http://localhost:8787 node tests/site-layout.mjs [paths…]
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const BASE = process.env.BASE || "http://localhost:8787";
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/about", "/careers", "/contact", "/faq", "/privacy", "/terms", "/payment", "/status", "/blog", "/track", "/order", "/review"];
const SIZES = [["phone", { width: 390, height: 844 }], ["tablet", { width: 820, height: 1180 }], ["computer", { width: 1440, height: 900 }]];

const b = await chromium.launch();
let bad = 0;
for (const [name, viewport] of SIZES) {
  const ctx = await b.newContext({ viewport, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  for (const path of PAGES) {
    await p.goto(BASE + path, { waitUntil: "load" });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } scrollTo(0, 0); });
    await p.waitForTimeout(400);
    const problems = await p.evaluate(() => {
      const out = [];
      const page = document.body.getBoundingClientRect(), vw = document.documentElement.clientWidth, root = getComputedStyle(document.documentElement);
      const px = (v) => { const d = document.createElement("div"); d.style.width = v; document.body.append(d); const w = d.getBoundingClientRect().width; d.remove(); return w; };
      const g = px("var(--gutter)"), R = px("var(--radius)"), radii = [px("var(--radius-sm)"), R, px("var(--radius-lg)")];
      const widths = [px("var(--max)"), px("var(--read)"), px("var(--narrow)")].map((w) => Math.min(w, page.width) - 2 * g);
      const edge = (gap) => widths.some((W) => Math.abs(gap - (page.width - W) / 2) <= 3); // starts at the edge of a page width
      if (document.documentElement.scrollWidth > vw + 1) out.push(`page is ${document.documentElement.scrollWidth}px wide on a ${vw}px screen`);
      const name = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/)[0] : ""}`;
      const shown = (e) => { const s = getComputedStyle(e); return e.offsetParent !== null && s.visibility !== "hidden" && +s.opacity > 0; };
      // inside a sideways-scrolling row (testimonials, packages on a phone): the row decides, not each card
      const inScroller = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(s.overflowX) && a.scrollWidth > a.clientWidth + 2) return true; } return false; };
      const isBox = (e) => {
        const s = getComputedStyle(e), r = e.getBoundingClientRect();
        if (r.width < 120 || r.height < 48) return false;
        if (s.borderTopStyle === "none" && s.backgroundColor === "rgba(0, 0, 0, 0)" && s.boxShadow === "none") return false;
        return parseFloat(s.borderTopLeftRadius) >= 10 && !/^(BUTTON|A|INPUT|TEXTAREA|SELECT|IMG|SVG|LABEL)$/.test(e.tagName) || e.matches(".way, .ord__pkg, .ctype, .post, .more__grid a");
      };
      const scope = [...document.querySelectorAll("main, .page")];
      const boxes = scope.flatMap((m) => [...m.querySelectorAll("*")]).filter((e) => shown(e) && isBox(e) && !e.closest("[role=dialog], .chatw, .pmodal, .jmodal, .hero, .header"));
      // 2. corners
      for (const e of boxes) {
        const r = parseFloat(getComputedStyle(e).borderTopLeftRadius), h = e.getBoundingClientRect().height;
        if (r >= Math.min(99, h / 2 - 1) || getComputedStyle(e).borderTopLeftRadius.includes("%")) continue; // pill / circle
        if (!radii.some((x) => Math.abs(x - r) < 1)) out.push(`${name(e)} has ${r}px corners (allowed ${radii.map(Math.round).join("/")})`);
      }
      // 3. rows of top-level boxes
      const top = boxes.filter((e) => !boxes.some((o) => o !== e && o.contains(e)) && !inScroller(e));
      const rows = new Map();
      for (const e of top) { const x = e.getBoundingClientRect(), k = Math.round((x.top + scrollY) / 6); (rows.get(k) || rows.set(k, []).get(k)).push([e, x]); }
      for (const row of rows.values()) {
        // a row is the boxes that share a parent grid; take the parent's content box as the row
        let left = Math.min(...row.map(([, x]) => x.left)), right = Math.max(...row.map(([, x]) => x.right));
        const par = row[0][0].parentElement, ps = getComputedStyle(par);
        if (row.length && row.every(([e]) => e.parentElement === par) && /grid|flex/.test(ps.display)) {
          const pr = par.getBoundingClientRect();
          left = pr.left + parseFloat(ps.paddingLeft) + parseFloat(ps.borderLeftWidth); right = pr.right - parseFloat(ps.paddingRight) - parseFloat(ps.borderRightWidth);
          row.length = Math.max(row.length, 2); // judged as a grid row
        }
        const w = right - left, gapL = left - page.left, gapR = page.right - right;
        const what = row.filter(Boolean).map(([e]) => name(e)).filter((v, i, a) => a.indexOf(v) === i).join("+");
        if (Math.abs(gapL - gapR) > 3 && !(edge(gapL) || edge(gapR))) out.push(`${what} is off-centre (${Math.round(gapL)} / ${Math.round(gapR)})`);
        else if (row.length === 1 && !widths.some((x) => Math.abs(x - w) <= 3)) out.push(`${what} is ${Math.round(w)}px wide (allowed ${widths.map(Math.round).join("/")})`);
        else if (row.length > 1 && !widths.some((x) => Math.abs(x - w) <= 3) && w > widths[2] + 3 && !(Math.abs(gapL - gapR) > 3 && (edge(gapL) || edge(gapR)))) out.push(`row of ${what} is ${Math.round(w)}px wide (allowed ${widths.map(Math.round).join("/")})`);
      }
      // 5. one gap between sections: none above, --sec below
      const sec = px("var(--sec)");
      for (const el of document.querySelectorAll("main > section:not(.hero)")) {
        if (!shown(el)) continue;
        const cs = getComputedStyle(el);
        if (parseFloat(cs.paddingTop) > 0.5 || Math.abs(parseFloat(cs.paddingBottom) - sec) > 1) out.push(`section ${name(el)} spacing ${cs.paddingTop} / ${cs.paddingBottom} (should be 0 / ${Math.round(sec)}px)`);
      }
      // 4. inner pages: the first title or panel sits --page-top under the header bar
      if (document.documentElement.dataset.page !== "home" && location.pathname !== "/") {
        const bar = document.querySelector(".header__bar")?.getBoundingClientRect().bottom ?? 0;
        const first = scope.flatMap((m) => [...m.querySelectorAll("h1, h2, h3, *")]).find((e) => shown(e) && (/^H[1-3]$/.test(e.tagName) && !e.classList.contains("sr-only") || isBox(e)) && e.getBoundingClientRect().height > 0);
        const want = px("var(--page-top)"), got = first ? first.getBoundingClientRect().top + scrollY - bar : NaN;
        if (!(Math.abs(got - want) <= 3)) out.push(`first title/panel is ${Math.round(got)}px under the header (should be ${Math.round(want)})`);
      }
      return [...new Set(out)];
    });
    if (problems.length) { bad++; console.log(`✗ ${name} ${path}\n   ${problems.slice(0, 8).join("\n   ")}`); }
    else console.log(`✓ ${name} ${path}`);
  }
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
