/* Dashboard light / dark, before first paint (no flash): the choice saved on this device («تلقائي» follows the
   device's own setting, and keeps following it while the page is open). The sidebar button cycles the choice. */
(function () {
  var r = document.documentElement, KEY = "wixa-admin-theme";
  var mq = matchMedia("(prefers-color-scheme: dark)");
  var get = function () { try { return localStorage.getItem(KEY) || "auto"; } catch (e) { return "auto"; } };
  var apply = function () { var c = get(); r.setAttribute("data-theme", c === "auto" ? (mq.matches ? "dark" : "light") : c); r.setAttribute("data-theme-choice", c); };
  apply();
  if (mq.addEventListener) mq.addEventListener("change", apply);
  window.wixaTheme = { get: get, set: function (c) { try { localStorage.setItem(KEY, c); } catch (e) {} apply(); } };
})();
