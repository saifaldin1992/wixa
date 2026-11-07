/* Developer guide: docs/DEVELOPERS.md from the repository, served to signed-in admins only and shown here. */
import { $, esc, sb, toast } from "../core.js";

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
  const toc = [...html.matchAll(/<h3 id="([^"]+)">(.*?)<\/h3>/g)].map(([, id, t]) => `<a href="#" data-to="${id}">${t.replace(/<[^>]+>/g, "")}</a>`).join("");
  view.innerHTML = `<div class="devguide"><nav class="dg-toc card">${toc}</nav><article class="card dg-body">${html}</article></div>`;
  view.querySelectorAll("[data-to]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); view.querySelector(`#${a.dataset.to}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  $("#dgDownload").onclick = () => {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "text/markdown" })), download: "WIXA-DEVELOPERS.md" });
    document.body.append(a); a.click(); a.remove(); toast("تم التنزيل ✓");
  };
}
