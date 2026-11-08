/* Developer guide: docs/DEVELOPERS.md from the repository, served to signed-in admins only and shown here. */
import { $, esc, sb, toast, sectionTabs } from "../core.js";

// A small Markdown renderer for the guide: headings, paragraphs, lists, tables, code, bold, links.
function md(src) {
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code dir="ltr">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener" dir="ltr">$1</a>');
  const lines = src.replace(/\r/g, "").split("\n"), out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre dir="ltr"><code>${esc(buf.join("\n"))}</code></pre>`); continue; }
    if (/^#{1,4} /.test(l)) { const n = l.match(/^#+/)[0].length; const text = l.replace(/^#+ /, ""); out.push(`<h${n + 1} id="s-${out.length}">${inline(text)}</h${n + 1}>`); i++; continue; }
    if (/^---+$/.test(l.trim())) { out.push("<hr>"); i++; continue; }
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const [h, , ...b] = rows;
      out.push(`<div class="table-wrap"><table><thead><tr>${cells(h).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${b.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^\s*(\d+\.|-) /.test(l)) {
      const ordered = /^\s*\d+\./.test(l), items = [];
      while (i < lines.length && /^\s*(\d+\.|-) /.test(lines[i])) items.push(lines[i++].replace(/^\s*(\d+\.|-) /, ""));
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(#|\||```|\s*(\d+\.|-) |---)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("");
}

export async function viewDevGuide(view) {
  $("#topActions").innerHTML = `<button class="b" id="dgDownload">تنزيل الدليل (.md)</button>`;
  let text = "";
  try {
    const { data: ses } = await sb.auth.getSession();
    const r = await fetch("/api/admin/devguide", { headers: { authorization: `Bearer ${ses.session?.access_token || ""}` } });
    if (!r.ok) throw new Error(r.status);
    text = await r.text();
  } catch (e) { view.innerHTML = `<div class="empty">تعذّر تحميل الدليل (${esc(e.message)})</div>`; return; }
  const html = md(text);
  // each "## n. title" chapter becomes its own section, grouped into four branches
  const parts = html.split(/(?=<h3 id=)/), intro = parts.shift();
  const chapters = parts.map((p, i) => {
    const title = (p.match(/<h3[^>]*>(.*?)<\/h3>/) || [, ""])[1].replace(/<[^>]+>/g, "");
    const n = Number((title.match(/^(\d+)\./) || [])[1]) || 0;
    return { k: `c${i}`, n, label: title.replace(/^\d+\.\s*/, "").replace(/\s*\(.*?\)\s*$/, "").replace(/\s*\(`?src\/index\.js`?\)/, ""), html: p };
  });
  const BR = [["start", "البداية", [1, 2, 3, 4, 13]], ["data", "الإعدادات والبيانات", [5, 6]], ["code", "الخادم والواجهة", [7, 8, 0]], ["ops", "التشغيل والصيانة", [9, 10, 11, 12]]];
  view.innerHTML = `<div class="devguide devguide--tabs">${chapters.map((c) => `<article class="card dg-body" data-sec="${c.k}">${c.n === 1 ? intro : ""}${c.html}</article>`).join("")}</div>`;
  sectionTabs(view, "devguide", BR.map(([k, label, nums]) => ({ k, label, items: chapters.filter((c) => nums.includes(c.n)).sort((a, b) => nums.indexOf(a.n) - nums.indexOf(b.n)).map((c) => [c.k, c.label]) })).filter((g) => g.items.length));
  $("#dgDownload").onclick = () => {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "text/markdown" })), download: "WIXA-DEVELOPERS.md" });
    document.body.append(a); a.click(); a.remove(); toast("تم التنزيل ✓");
  };
}
