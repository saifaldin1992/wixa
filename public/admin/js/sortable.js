/* Drag to reorder, iOS style: a handle (≡) on each row, dragged with a finger or the mouse, or moved with ↑ ↓ from the
   keyboard. Used by «القوائم» and the lists (services, projects, testimonials, partners).
   sortable(list, onMove(from, to, byKeys), rowSel): rows are list's children matching rowSel, each with a [data-grip]
   handle; only the rows on screen count (a search that hides rows hides them from the drag too). */
import { $$ } from "./core.js";

export const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
export const moved = (arr, from, to) => { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };

export function sortable(list, onMove, rowSel = ".ios-row[data-i]") {
  const rowsNow = () => [...list.querySelectorAll(rowSel)].filter((r) => !r.hidden);
  $$("[data-grip]", list).forEach((g) => {
    g.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      if (!d) return;
      e.preventDefault();
      const rows = rowsNow(), i = rows.indexOf(g.closest(rowSel));
      if (i + d >= 0 && i + d < rows.length) onMove(i, i + d, true);
    });
    g.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      e.preventDefault();
      const rows = rowsNow(), row = g.closest(rowSel), from = rows.indexOf(row);
      if (from < 0) return;
      const boxes = rows.map((r) => r.getBoundingClientRect()), h = boxes[from].height, y0 = e.clientY;
      let to = from;
      g.setPointerCapture(e.pointerId); row.classList.add("is-drag");
      const move = (ev) => {
        const dy = Math.max(boxes[0].top - boxes[from].top, Math.min(boxes[rows.length - 1].bottom - boxes[from].bottom, ev.clientY - y0));
        row.style.transform = `translateY(${dy}px)`;
        const mid = boxes[from].top + h / 2 + dy;
        to = 0; boxes.forEach((b, i) => { if (i !== from && b.top + b.height / 2 < mid) to++; });
        rows.forEach((r, i) => { if (i === from) return; const sh = from < to && i > from && i <= to ? -h : from > to && i < from && i >= to ? h : 0; r.style.transform = sh ? `translateY(${sh}px)` : ""; });
      };
      const up = () => {
        g.removeEventListener("pointermove", move);
        rows.forEach((r) => (r.style.transform = "")); row.classList.remove("is-drag");
        if (to !== from) onMove(from, to);
      };
      g.addEventListener("pointermove", move);
      g.addEventListener("pointerup", up, { once: true });
      g.addEventListener("pointercancel", up, { once: true });
    });
  });
}
