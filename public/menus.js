/* The site's menus, on every page (home and its sister pages, and the server-built pages):
   • computers: «خدماتنا» in the top bar opens a drop-down with every service and quick links (hover, focus, ↓ key);
   • phones and tablets: the full-screen ☰ menu's links arrive one after another, and «خدماتنا ›» opens a second
     panel with the services and «رجوع».
   The menu's opening and closing stays with the page's own script (ui.js / theme-pre.js); this only adds to it. */
(function () {
  function ready(fn) { if (document.readyState !== "loading") fn(); else addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    var header = document.getElementById("header");
    if (!header) return;

    // ---------- computers: the services drop-down ----------
    var fly = document.getElementById("svcFly");
    var opener = header.querySelector('.header__nav a[aria-controls="svcFly"]');
    if (fly && opener) {
      var timer;
      var set = function (open) {
        clearTimeout(timer);
        if (open === !fly.hidden) return;
        fly.hidden = !open; opener.setAttribute("aria-expanded", open ? "true" : "false");
      };
      var later = function () { clearTimeout(timer); timer = setTimeout(function () { set(false); }, 180); };
      var fine = matchMedia("(hover: hover) and (pointer: fine)");
      opener.addEventListener("pointerenter", function () { if (fine.matches) set(true); });
      opener.addEventListener("pointerleave", later);
      fly.addEventListener("pointerenter", function () { clearTimeout(timer); });
      fly.addEventListener("pointerleave", later);
      header.querySelectorAll(".header__nav a:not([aria-controls]), .header__end > *").forEach(function (a) { a.addEventListener("pointerenter", function () { set(false); }); });
      // keyboard: ↓ on «خدماتنا» opens the drop-down and moves into it; Esc closes it and comes back
      opener.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); set(true); var f = fly.querySelector("a"); if (f) f.focus(); }
      });
      fly.addEventListener("keydown", function (e) {
        var links = Array.prototype.slice.call(fly.querySelectorAll("a")), i = links.indexOf(document.activeElement);
        if (e.key === "Escape") { set(false); opener.focus(); }
        else if (e.key === "ArrowDown" && i >= 0) { e.preventDefault(); links[(i + 1) % links.length].focus(); }
        else if (e.key === "ArrowUp" && i >= 0) { e.preventDefault(); links[(i - 1 + links.length) % links.length].focus(); }
      });
      document.addEventListener("focusin", function (e) { if (!fly.hidden && !fly.contains(e.target) && e.target !== opener) set(false); });
      document.addEventListener("pointerdown", function (e) { if (!fly.hidden && !fly.contains(e.target) && e.target !== opener) set(false); });
      fly.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
      addEventListener("scroll", function () { if (!fly.hidden && !fly.matches(":hover")) set(false); }, { passive: true });
    }

    // ---------- a service page's local bar: the part of the page being read is marked ----------
    var parts = Array.prototype.slice.call(document.querySelectorAll(".localnav__links a"));
    if (parts.length && "IntersectionObserver" in window) {
      var seen = {};
      var mark = function () {
        var on = null;
        parts.forEach(function (a) { if (seen[a.getAttribute("href")]) on = a; });
        parts.forEach(function (a) { a.classList.toggle("on", a === (on || parts[0])); });
      };
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { seen["#" + e.target.id] = e.boundingClientRect.top < innerHeight * 0.4; }); mark(); }, { threshold: [0, 1], rootMargin: "0px 0px -60% 0px" });
      parts.forEach(function (a) { var t = document.getElementById(a.getAttribute("href").slice(1)); if (t && t.id !== "content") io.observe(t); });
      mark();
    }

    // ---------- phones and tablets: the full-screen menu ----------
    var menu = document.getElementById("menu"), main = document.getElementById("menuMain"), btn = document.getElementById("menuBtn");
    if (!menu || !main) return;
    var stagger = function (panel) {
      var n = 0;
      Array.prototype.forEach.call(panel.children, function (el) { if (!el.hidden) el.style.setProperty("--i", n++); });
    };
    var show = function (panel, focus) {
      Array.prototype.forEach.call(menu.querySelectorAll(".mpanel"), function (p) { p.hidden = p !== panel; });
      menu.querySelectorAll("[data-sub]").forEach(function (b) { b.setAttribute("aria-expanded", panel.id === b.getAttribute("data-sub") ? "true" : "false"); });
      stagger(panel);
      menu.scrollTop = 0;
      if (focus) { var f = panel.querySelector("button, a"); if (f) f.focus({ preventScroll: true }); }
    };
    menu.addEventListener("click", function (e) {
      var sub = e.target.closest("[data-sub]");
      if (sub) { var p = document.getElementById(sub.getAttribute("data-sub")); if (p) show(p, true); return; }
      if (e.target.closest("[data-back]")) {
        show(main, false);
        var back = main.querySelector("[data-sub]"); if (back) back.focus({ preventScroll: true });
      }
    });
    // each time the menu opens it starts on its first panel, the links arriving in order
    if (btn) new MutationObserver(function () { if (btn.getAttribute("aria-expanded") === "true") show(main, false); else setTimeout(function () { if (btn.getAttribute("aria-expanded") !== "true") show(main, false); }, 320); })
      .observe(btn, { attributes: true, attributeFilter: ["aria-expanded"] });
    stagger(main);
  });
})();
