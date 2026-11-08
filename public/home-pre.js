/* Home page, before first paint: the visitor's light/dark choice, and the loading screen (the same as the
   dashboard's). The screen (#boot) shows only while the page's script has not started; the script adds
   «site-ready» and it goes. If that has not happened after 10 seconds (slow or broken connection) the screen says so
   and offers «إعادة المحاولة» (reload), like the dashboard. */
(function () {
  var r = document.documentElement, t, m;
  try { t = localStorage.getItem("wixa-theme"); m = (JSON.parse(localStorage.getItem("wixa-site") || "{}").settings || {}).mode; } catch (e) {}
  if (t !== "light" && t !== "dark") t = (m === "light" || m === "dark") ? m : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  r.setAttribute("data-theme", t);
  r.classList.add("booting");
  setTimeout(function () {
    if (r.classList.contains("site-ready")) return;
    var a = document.getElementById("bootRetry");
    if (!a) { r.classList.add("no-anim"); r.classList.remove("booting"); return; } // the page itself did not arrive in full: never hide what did
    r.classList.add("boot-slow");
    a.onclick = function () { location.reload(); };
  }, 10000);
})();
