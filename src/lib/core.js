// Shared building blocks: security headers, JSON responses, Supabase calls, rate limits, small text helpers.

import "./window-shim.js";
import "../../public/shared.js";
import BUILD_MANIFEST from "../../public/build/manifest.json";

export const WIXA = globalThis.WIXA;
// /build/site.js → /build/site.js?v=<fingerprint of its content> (see scripts/build.mjs)
export const versioned = (path) => (BUILD_MANIFEST[path] ? `${path}?v=${BUILD_MANIFEST[path]}` : path);
export const versionAssets = (rw) => rw
  .on('link[href^="/build/"]', { element: (el) => el.setAttribute("href", versioned(el.getAttribute("href"))) })
  .on('script[src^="/build/"]', { element: (el) => el.setAttribute("src", versioned(el.getAttribute("src"))) });
// Built files: kept for a year when asked for by their fingerprint, otherwise always re-checked
export async function serveBuild(request, env, url) {
  const res = await env.ASSETS.fetch(request);
  if (!res.ok) return res;
  const headers = new Headers(res.headers);
  const exact = BUILD_MANIFEST[url.pathname] && url.searchParams.get("v") === BUILD_MANIFEST[url.pathname];
  headers.set("cache-control", exact ? "public, max-age=31536000, immutable" : "public, no-cache");
  return new Response(res.body, { status: res.status, headers });
}

export const SITE_TTL = 60; // seconds the site content may be served from cache
// Keep in sync with public/_headers. No inline scripts anywhere: the home page's early script is /home-pre.js.
export const CSP = "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://cloudflareinsights.com https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";
export const SECURITY_HEADERS = {
  "content-security-policy": CSP,
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "strict-transport-security": "max-age=31536000; includeSubDomains", // browsers always use https for wixa.dev and its subdomains
};

export const json = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers: { ...SECURITY_HEADERS, ...headers } });

export function sb(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json", ...(init.headers || {}) },
  });
}
export const deepMerge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" ? deepMerge(a[k], v) : v;
  return out;
};

// Which language a visit opens in: ?lang= link → the visitor's saved choice (cookie) → dashboard setting →
// the device language or the visitor's country. No header at all (most crawlers) → Arabic.
export const ARAB_COUNTRIES = new Set(["IQ", "SA", "AE", "KW", "QA", "BH", "OM", "JO", "SY", "LB", "PS", "EG", "LY", "TN", "DZ", "MA", "SD", "YE", "MR"]);

export function pickLang(request, setting) {
  const q = new URL(request.url).searchParams.get("lang");
  if (q === "ar" || q === "en") return q;
  const c = (request.headers.get("cookie") || "").match(/(?:^|;\s*)wixa-lang=(ar|en)/);
  if (c) return c[1];
  if (setting === "ar" || setting === "en") return setting;
  // Arabic anywhere in the device languages, or a visitor in an Arab country → Arabic; otherwise English.
  // (Many phones and in-app browsers send English first even when the phone itself is in Arabic.)
  const al = (request.headers.get("accept-language") || "").toLowerCase();
  if (!al.trim() || /(^|,)\s*ar\b/.test(al)) return "ar";
  if (ARAB_COUNTRIES.has(request.cf?.country)) return "ar";
  return "en";
}

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- protection helpers
export const clientIp = (request) => request.headers.get("cf-connecting-ip") || "0.0.0.0";

export async function allowed(limiter, key) {
  if (!limiter) return true; // binding not configured (local dev)
  try { return (await limiter.limit({ key })).success; } catch { return true; }
}

export async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // not configured (local dev)
  if (!token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const d = await r.json().catch(() => ({}));
  return d.success === true;
}

export const rpc = (env, fn, p) => sb(env, `rpc/${fn}`, { method: "POST", body: JSON.stringify({ token: env.WRITE_TOKEN || "", p }) });

// ---------------------------------------------------------------- alerts address (private)
// Kept in a private Cloudflare store, not in the public site settings, so it is never exposed to visitors.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const safeHref = (u) => { try { const x = new URL(String(u || "")); return ["http:", "https:"].includes(x.protocol) ? x.href : ""; } catch { return ""; } };

// ---------------------------------------------------------------- message counters (for the weekly report)
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export const notFound = (request, env) => env.ASSETS.fetch(new Request(new URL("/404", request.url), request)).then((r) => new Response(r.body, { status: 404, headers: r.headers }));

export const fmtDate = (d, lang) => { try { return new Date(d).toLocaleDateString(lang === "ar" ? "ar-IQ" : "en-GB", { dateStyle: "long", timeZone: "Asia/Baghdad" }); } catch { return ""; } };

// ---------------------------------------------------------------- appointments
// Opening hours come from the dashboard (settings.booking); booked times are kept in the private store.
export const BAGHDAD_OFFSET = 3 * 3600e3; // Iraq: UTC+3, no daylight saving
export const baghdadNow = () => new Date(Date.now() + BAGHDAD_OFFSET); // read with getUTC* = Baghdad wall clock
export const toMin = (hm) => { const [h, m] = String(hm || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const toHM = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// ---------------------------------------------------------------- team: invitations and roles
// owner: everything · editor: content and look · support: messages and appointments
export const ROLE_AR = { owner: "مالك", editor: "محرر محتوى", support: "خدمة العملاء" };
export const rpcToken = (env, fn, body) => sb(env, `rpc/${fn}`, { method: "POST", body: JSON.stringify({ token: env.WRITE_TOKEN || "", ...body }) });
export const newCode = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("").replace(/(.{4})(?=.)/g, "$1-");

// ---------------------------------------------------------------- router
// ---------- live chat ----------
// Visitors talk to the Worker only: each conversation has a random key kept in the visitor's browser
// (the database stores its sha-256). The team reads and replies in the dashboard through Supabase directly.
// An order number: WX-YYMMDD-XXXX (date in UTC, 4 characters that cannot be mistaken for each other)
export function newOrderNumber(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const rnd = [...crypto.getRandomValues(new Uint8Array(4))].map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
  return `WX-${String(d.getUTCFullYear()).slice(2)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${rnd}`;
}
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256hex = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export const cleanText = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, n);
export const PHONE_RE = /^\+?[\d\s()-]{6,30}$/;

// Web Push to the team's devices. The notification carries no content (the service worker shows a fixed text),
// so no payload encryption is needed — only a VAPID signature. The key pair is created once and kept in KV.
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ---------- sales: chat ratings, email campaigns, unsubscribe links, daily reminders ----------
export const STAGE_AR = { new: "جديد", contacted: "تواصلنا", quoted: "أُرسل العرض", won: "تم البيع", lost: "خسرناه" };

// unsubscribe links carry a signature, so nobody can unsubscribe someone else
// compares two strings in the same time whatever they contain, so a signature cannot be guessed one character at a time
export function sameText(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
