/* Home page, before first paint: the visitor's light/dark choice, and a safety net — if the page's script has not
   started within 4 seconds (slow or broken connection), everything is shown without animations instead of a blank
   page (sections stay hidden until the script reveals them). */
(function () {
  var r = document.documentElement, t, m;
  try { t = localStorage.getItem("wixa-theme"); m = (JSON.parse(localStorage.getItem("wixa-site") || "{}").settings || {}).mode; } catch (e) {}
  if (t !== "light" && t !== "dark") t = (m === "light" || m === "dark") ? m : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  r.setAttribute("data-theme", t);
  setTimeout(function () { if (!r.classList.contains("site-ready")) r.classList.add("no-anim"); }, 4000);
})();
