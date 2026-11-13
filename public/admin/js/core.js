/* Shared helpers, icons, toasts, modals and the dashboard state */

export const { DEFAULTS, FONTS, merge, ICONS } = window.WIXA;
export const $ = (s, el = document) => el.querySelector(s);
// a page's sub-menus (status tabs, filters, sections, periods) go in one strip under the page title — the same on every page and screen
// Long pages as sub-menus: the first row picks a branch, the second a section of it; only that section shows.
// Every element of the page with data-sec="<section>" belongs to that section (several may share one).
// groups: [{ k, label, items: [[sectionKey, label], …] }]. The choice is remembered for the visit.
// Each page's sub-menu watchers belong to that page only: the router calls endSections() before drawing the next page.
let secGen = 0;
export const endSections = () => { secGen++; };
export function sectionTabs(view, key, groups) {
  const gen = secGen;
  const store = `wixa-sec-${key}`;
  let cur = ""; try { cur = sessionStorage.getItem(store) || ""; } catch {}
  const all = groups.flatMap((g) => g.items.map(([k]) => k));
  if (!all.includes(cur)) cur = all[0];
  const subEl = document.getElementById("subNav");
  const paint = () => {
    const g = groups.find((x) => x.items.some(([k]) => k === cur)) || groups[0];
    const own = [...subEl.children].filter((n) => !n.hasAttribute("data-secgrp") && !n.hasAttribute("data-secitem") && !n.hasAttribute("data-hub")); // the page's own rows (filters, period…) stay, under ours
    setSubnav((groups.length > 1 ? `<div class="seg" data-secgrp>${groups.map((x) => `<button type="button" data-g="${x.k}" class="${x === g ? "on" : ""}">${esc(x.label)}</button>`).join("")}</div>` : "")
      + (all.length > 1 && (g.items.length > 1 || groups.length === 1) ? `<div class="seg" data-secitem>${g.items.map(([k, l]) => `<button type="button" data-s="${k}" class="${k === cur ? "on" : ""}">${esc(l)}</button>`).join("")}</div>` : ""));
    own.forEach((n) => subEl.appendChild(n)); subEl.hidden = false;
    view.querySelectorAll("[data-sec]").forEach((el) => el.classList.toggle("sec-off", !el.dataset.sec.split(" ").includes(cur)));
    const sub = document.getElementById("subNav");
    sub.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => { cur = groups.find((x) => x.k === b.dataset.g).items[0][0]; go(); }));
    sub.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { cur = b.dataset.s; go(); }));
  };
  const go = () => { try { sessionStorage.setItem(store, cur); } catch {} paint(); scrollTo({ top: 0, behavior: "smooth" }); };
  paint();
  // a page that redraws its own sub-menu (a new period, a filter) gets our rows back on top
  const so = new MutationObserver(() => { if (gen !== secGen) return so.disconnect(); if (!subEl.querySelector("[data-secitem], [data-secgrp]")) paint(); });
  so.observe(subEl, { childList: true });
  return () => { if (gen === secGen) view.querySelectorAll("[data-sec]").forEach((el) => el.classList.toggle("sec-off", !el.dataset.sec.split(" ").includes(cur))); };
}

// Split an existing page into sub-menus without rewriting it: every card is given a section from its title
// (rules: [["#cardId" | "title starts with", "section"]]); cards drawn later (loaded data) are sorted the same way.
export function sectionize(view, key, groups, rules, fallback) {
  const title = (c) => (c.querySelector("h3")?.textContent || "").trim();
  const tag = () => {
    let changed = false;
    view.querySelectorAll(".card, .kpis, [data-sec-auto]").forEach((c) => {
      if (c.dataset.sec || c.parentElement?.closest("[data-sec]")) return;
      const hit = rules.find(([m]) => (m.startsWith("#") ? c.id === m.slice(1) : m.startsWith(".") ? c.matches(m) : title(c).startsWith(m)));
      c.dataset.sec = hit ? hit[1] : fallback || groups[0].items[0][0]; changed = true;
    });
    return changed;
  };
  tag();
  const gen = secGen;
  const apply = sectionTabs(view, key, groups);
  const mo = new MutationObserver(() => { if (gen !== secGen) return mo.disconnect(); if (tag()) apply(); });
  mo.observe(view, { childList: true, subtree: true });
  return apply;
}

// A page made of cards from other pages (settings gathered in one place): each source page is drawn into its own
// box, then only the cards listed are kept — their buttons and saving work exactly as on the original page.
export async function composeView(view, parts) {
  view.innerHTML = "";
  for (const [render, keep] of parts) {
    const box = document.createElement("div"); box.className = "compose"; view.appendChild(box);
    await render(box);
    box.querySelectorAll(".card").forEach((c) => {
      if (c.parentElement.closest(".card")) return;
      const t = (c.querySelector("h3")?.textContent || "").trim();
      if (!keep.includes("*") && !keep.some((k) => (k.startsWith("#") ? c.id === k.slice(1) : t.startsWith(k)))) c.remove();
    });
  }
}
// The sub-menu under the page title. Re-drawing it keeps each row where it was scrolled, and the chosen item always
// stays in view (a long row no longer jumps back to its first item after a choice near its end).
// A group of pages shown as one item in the sidebar (الإعدادات، التقارير…): its pages are a first row of tabs above
// whatever sub-menu the page itself draws. The router sets it before drawing a page of the group (shell.js → HUBS).
let hubRow = "";
export const setHubRow = (html) => { hubRow = html || ""; };
export function setSubnav(html = "") {
  const n = document.getElementById("subNav"); if (!n) return;
  html = hubRow + html;
  const key = (s, i) => s.id || `${s.className}#${i}`;
  const was = Object.fromEntries([...n.querySelectorAll(".seg")].map((s, i) => [key(s, i), s.scrollLeft]));
  n.innerHTML = html; n.hidden = !html;
  [...n.querySelectorAll(".seg")].forEach((s, i) => {
    if (key(s, i) in was) s.scrollLeft = was[key(s, i)];
    const on = s.querySelector("button.on");
    if (!on) return;
    const sr = s.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (r.left < sr.left || r.right > sr.right) s.scrollLeft += (r.left + r.width / 2) - (sr.left + sr.width / 2);
  });
}
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const clone = (o) => structuredClone(o);
export const fmt = (n) => Number(n || 0).toLocaleString("en");

// Shared state: other modules read these live bindings and change them only through the setters.
export let sb, user, settings, savedJSON;
export const setSb = (v) => { sb = v; };
export const setUser = (v) => { user = v; };
export let role = "owner";
export const setRole = (v) => { role = v || "owner"; };
export const ROLE_AR = { owner: "مالك", editor: "محرر محتوى", support: "خدمة العملاء" };
export const setSettings = (v) => { settings = v; };
export const setSaved = (v) => { savedJSON = v; };
export const cache = {};

// ---------------- helpers ----------------
export function toast(text, type = "") {
  const t = document.createElement("div"); t.className = `toast ${type}`; t.textContent = text;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, 2800);
}
export function openModal(title, body, foot, small = false) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = ""; $("#modalFoot").innerHTML = "";
  if (typeof body === "string") $("#modalBody").innerHTML = body; else $("#modalBody").append(body);
  if (typeof foot === "string") $("#modalFoot").innerHTML = foot; else if (foot) $("#modalFoot").append(foot);
  $(".modal__box").classList.toggle("sm", small);
  $("#modal").hidden = false;
  setTimeout(() => $("#modalBody input, #modalBody textarea")?.focus(), 50);
}
export function closeModal() { $("#modal").hidden = true; }
export function confirmBox(title, text, okLabel = "تأكيد", danger = true) {
  return new Promise((resolve) => {
    openModal(title, `<p style="margin:0">${esc(text)}</p>`, `<button class="b" data-x>إلغاء</button><button class="b ${danger ? "b--danger" : "b--primary"}" data-ok>${esc(okLabel)}</button>`, true);
    const done = (v) => { closeModal(); resolve(v); };
    $("#modalFoot [data-x]").onclick = () => done(false);
    $("#modalFoot [data-ok]").onclick = () => done(true);
    $(".modal [data-close]").onclick = () => done(false);
  });
}
export const icon = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
export const I = {
  plus: icon('<path d="M12 5v14M5 12h14"/>'), edit: icon('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), trash: icon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  up: icon('<path d="M6 15l6-6 6 6"/>'), down: icon('<path d="M6 9l6 6 6-6"/>'), eye: icon('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  save: icon('<path d="M5 13l4 4L19 7"/>'), upload: icon('<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>'), x: icon('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: icon('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'), img: icon('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  users: icon('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 010 8M22 21c0-3-2-5.5-4-6.5"/>'), views: icon('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  bell: icon('<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>'), user: icon('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>'),
  gear: icon('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'), copy: icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'), download: icon('<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>'),
  print: icon('<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><path d="M7 14h10v7H7z"/>'), quote: icon('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'), bolt: icon('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  mail: icon('<path d="M4 5h16v14H4z"/><path d="M4 6l8 7 8-7"/>'), reset: icon('<path d="M4 4v6h6M4 10a8 8 0 112 6"/>'), out: icon('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
};

// ---------------- server endpoints (admins only; the Worker checks the session) ----------------
// requests to the site's own server give up after 20 s with a clear message, so a lost connection never leaves a
// page waiting for ever
export function timedFetch(url, opts = {}, ms = 20000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opts, signal: ctl.signal })
    .catch((e) => { if (e.name === "AbortError") { toast("الاتصال بطيء أو منقطع — أعد المحاولة بعد قليل", "err"); throw Object.assign(new Error("timeout"), { status: 0 }); } throw e; })
    .finally(() => clearTimeout(timer));
}
export async function adminApi(path, method = "GET", body) {
  const { data: ses } = await sb.auth.getSession();
  const r = await timedFetch(`/api/admin/${path}`, { method, headers: { authorization: `Bearer ${ses.session?.access_token || ""}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }, method === "GET" ? 20000 : 60000); // sending (a campaign, a backup) may take longer than reading
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || String(r.status)), { status: r.status, data });
  return data;
}
// Show saved changes on the site at once (instead of within a minute). Never blocks or fails a save.
export const publishNow = () => adminApi("refresh", "POST").catch(() => {});
// While maintenance mode is on, this browser keeps seeing the real site (the Worker checks this cookie).
export function rememberOwner(cfg) {
  const t = cfg?.maintenance?.bypass;
  if (t) document.cookie = `wixa-bypass=${t}; path=/; max-age=31536000; secure; samesite=lax`;
}
