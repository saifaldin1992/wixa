// 404 page: a link pasted with punctuation stuck to its end ("/faq،", "/pricing.", "/about)") opens the real page
(function () {
  var path;
  try { path = decodeURIComponent(location.pathname); } catch (e) { return; }
  var clean = path.replace(/[\u060C\u061B\u06D4,.;:!?)\]\u00BB"'\u2019]+$/, "");
  if (clean && clean !== path) location.replace(clean + location.search + location.hash);
})();
