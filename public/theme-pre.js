/* Standalone pages (services, projects, articles, privacy, terms, review…): apply the visitor's light/dark choice before
   first paint (saved choice → dashboard default on <html data-mode> → device), the loading screen's «try again» after
   10 s, and wire the toggle button. */
(function () {
  var r = document.documentElement, t;
  try { t = localStorage.getItem("wixa-theme"); } catch (e) {}
  var m = r.getAttribute("data-mode");
  if (t !== "light" && t !== "dark") t = (m === "light" || m === "dark") ? m : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  r.setAttribute("data-theme", t);
  // the loading screen (#boot, hidden by the site's stylesheet once it arrives): after 10 s offer to try again
  setTimeout(function () {
    var bt = document.getElementById("boot");
    if (!bt || getComputedStyle(bt).display === "none") return;
    r.classList.add("boot-slow");
    var a = document.getElementById("bootRetry");
    if (a) a.onclick = function () { location.reload(); };
  }, 10000);
  addEventListener("DOMContentLoaded", function () {
    var m = document.getElementById("menu"), mb = document.getElementById("menuBtn"), sc = document.getElementById("scrim");
    var menu = function (open) { if (!m || !mb) return; mb.setAttribute("aria-expanded", open); m.classList.toggle("open", open); if (sc) sc.classList.toggle("open", open); r.classList.toggle("menu-open", open); };
    if (mb) mb.addEventListener("click", function () { menu(mb.getAttribute("aria-expanded") !== "true"); });
    if (sc) sc.addEventListener("click", function () { menu(false); });
    if (m) m.addEventListener("click", function (e) { if (e.target.closest("a")) menu(false); });
    var b = document.getElementById("tbtn");
    if (b) b.addEventListener("click", function () {
      var n = r.getAttribute("data-theme") === "dark" ? "light" : "dark";
      r.setAttribute("data-theme", n);
      try { localStorage.setItem("wixa-theme", n); } catch (e) {}
    });
  });
})();
