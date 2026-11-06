/* Analytics and ad pixels switched on in the dashboard (Integrations page). Loaded only when at least one is set;
   the Worker adds the matching hosts to the page's security policy. A sent contact form counts as a "lead". */
const el = document.getElementById("wixa-tags");
const t = el ? JSON.parse(el.textContent) : {};
const w = window;
const add = (src) => { const s = document.createElement("script"); s.async = true; s.src = src; document.head.append(s); };

if (t.ga4) {
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () { w.dataLayer.push(arguments); };
  w.gtag("js", new Date()); w.gtag("config", t.ga4);
  add(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(t.ga4)}`);
}
if (t.meta_pixel) {
  const f = (w.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); });
  if (!w._fbq) w._fbq = f;
  Object.assign(f, { push: f, loaded: true, version: "2.0", queue: [] });
  add("https://connect.facebook.net/en_US/fbevents.js");
  w.fbq("init", t.meta_pixel); w.fbq("track", "PageView");
}
if (t.clarity) {
  w.clarity = w.clarity || function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
  add(`https://www.clarity.ms/tag/${encodeURIComponent(t.clarity)}`);
}
if (t.tiktok) {
  w.TiktokAnalyticsObject = "ttq";
  const ttq = (w.ttq = w.ttq || []);
  ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
  ttq.setAndDefer = (o, m) => { o[m] = function () { o.push([m, ...arguments]); }; };
  ttq.methods.forEach((m) => ttq.setAndDefer(ttq, m));
  ttq.instance = (id) => { const e = ttq._i[id] || []; ttq.methods.forEach((m) => ttq.setAndDefer(e, m)); return e; };
  ttq.load = (id) => {
    const u = "https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._i[id]._u = u; ttq._t = ttq._t || {}; ttq._t[id] = +new Date(); ttq._o = ttq._o || {}; ttq._o[id] = {};
    add(`${u}?sdkid=${encodeURIComponent(id)}&lib=ttq`);
  };
  ttq.load(t.tiktok); ttq.page();
}

addEventListener("wixa:lead", () => {
  try { w.gtag?.("event", "generate_lead"); } catch {}
  try { w.fbq?.("track", "Lead"); } catch {}
  try { w.ttq?.track?.("SubmitForm"); } catch {}
  try { w.clarity?.("event", "lead"); } catch {}
});
