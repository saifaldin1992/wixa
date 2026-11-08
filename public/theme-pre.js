/* Standalone pages (services, projects, articles, privacy, review): apply the visitor's light/dark choice before
   first paint (saved choice → dashboard default on <html data-mode> → device), and wire the toggle button. */
(function () {
  var r = document.documentElement, t;
  try { t = localStorage.getItem("wixa-theme"); } catch (e) {}
  var m = r.getAttribute("data-mode");
  if (t !== "light" && t !== "dark") t = (m === "light" || m === "dark") ? m : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  r.setAttribute("data-theme", t);
  addEventListener("DOMContentLoaded", function () {
    var b = document.getElementById("tbtn");
    if (b) b.addEventListener("click", function () {
      var n = r.getAttribute("data-theme") === "dark" ? "light" : "dark";
      r.setAttribute("data-theme", n);
      try { localStorage.setItem("wixa-theme", n); } catch (e) {}
    });
  });
})();
