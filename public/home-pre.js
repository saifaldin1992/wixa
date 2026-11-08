/* Home page, before first paint: the visitor's light/dark choice, and the loading screen (the same as the
   dashboard's). The screen (#boot) shows only while the page's script has not started; the script adds
   «site-ready» and it goes. If that has not happened after 10 seconds (slow or broken connection) the screen says so
   and offers «إعادة المحاولة» or «عرض الصفحة» (the content is already in the page: shown without animations). */
(function () {
  var r = document.documentElement, t, m;
  try { t = localStorage.getItem("wixa-theme"); m = (JSON.parse(localStorage.getItem("wixa-site") || "{}").settings || {}).mode; } catch (e) {}
  if (t !== "light" && t !== "dark") t = (m === "light" || m === "dark") ? m : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  r.setAttribute("data-theme", t);
  r.classList.add("booting");
  var show = function () { r.classList.add("no-anim"); r.classList.remove("booting", "boot-slow"); };
  setTimeout(function () {
    if (r.classList.contains("site-ready")) return;
    r.classList.add("no-anim", "boot-slow"); // sections are ready to be seen the moment the screen goes
    var a = document.getElementById("bootRetry"), b = document.getElementById("bootShow");
    if (a) a.onclick = function () { location.reload(); };
    if (b) b.onclick = show;
    if (!a) show(); // the page itself did not arrive in full: never hide what did
  }, 10000);
})();
