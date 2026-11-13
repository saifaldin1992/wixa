// Puts a page's sections in the order its layout says (public/js/site-structure.js → layoutFor).
// public/index.html holds every section once, each wrapped in <!--s:key--> … <!--/s-->. For the page being built:
//  • the sections that are on in its layout come first, in the layout's order, marked data-pages="<page>" (shown);
//  • every other section follows, marked data-pages="" — the stylesheet hides it, but it stays in the page,
//    because the site's script fills all sections and must find them.
// The text before the first marker and after the last one is kept as it is.
import { layoutFor } from "../../public/js/site-structure.js";

const BLOCK = /<!--s:([a-z]+)-->([\s\S]*?)<!--\/s-->/g;

export function arrangeSections(html, settings, page) {
  const blocks = [...html.matchAll(BLOCK)];
  if (!blocks.length) return html;
  const first = blocks[0].index, last = blocks[blocks.length - 1];
  const end = last.index + last[0].length;
  const byKey = new Map(blocks.map((m) => [m[1], m[2]]));
  const mark = (body, value, k) => body.replace(/^(\s*<section\b[^>]*?)\sdata-pages="[^"]*"/, "$1").replace(/^(\s*<section\b)/, `$1 data-pages="${value}" data-s="${k}"`);
  const shown = layoutFor(settings, page).filter((x) => x.on && byKey.has(x.k)).map((x) => x.k);
  const rest = [...byKey.keys()].filter((k) => !shown.includes(k));
  const out = [...shown.map((k) => `<!--s:${k}-->${mark(byKey.get(k), page, k)}<!--/s-->`), ...rest.map((k) => `<!--s:${k}-->${mark(byKey.get(k), "", k)}<!--/s-->`)];
  return html.slice(0, first) + out.join("\n    ") + html.slice(end);
}
