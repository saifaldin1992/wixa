/* Light / dark mode */
import { $, state, lang } from "./core.js";

// ---------- dark mode ----------
export function applyDefaultMode() {
  let saved = null; try { saved = localStorage.getItem("wixa-theme"); } catch {}
  if (saved === "light" || saved === "dark") return;
  const m = state.settings.mode;
  const t = m === "light" || m === "dark" ? m : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", t);
}
export function setupTheme() {
  const btn = $("#themeBtn");
  if (!btn) return;
  const set = (t) => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("wixa-theme", t); } catch {}
    btn.setAttribute("aria-label", t === "dark" ? (lang === "ar" ? "الوضع النهاري" : "Light mode") : (lang === "ar" ? "الوضع الليلي" : "Dark mode"));
    setTimeout(() => root.classList.remove("theme-anim"), 600);
  };
  btn.addEventListener("click", () => set(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
}
