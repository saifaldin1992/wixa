/* Order status for the customer, shared by the track page and the live chat: the friendly message for each stage
   (editable in the dashboard → المحادثات → الإعدادات), the stage list, and the calls to the server. */
import { lang, state } from "./core.js";

export const STAGES = ["new", "contacted", "quoted", "in_progress", "done"];
import { DEFAULT_STATUS_MSGS } from "../order-msgs.js";
export { DEFAULT_STATUS_MSGS };
export const STAGE_LABEL = {
  ar: { new: "وصلنا طلبك", contacted: "تواصلنا معك", quoted: "أرسلنا عرض السعر", in_progress: "العمل جارٍ على مشروعك", done: "تم التسليم", cancelled: "ملغى" },
  en: { new: "Order received", contacted: "We contacted you", quoted: "Quote sent", in_progress: "Work in progress", done: "Delivered", cancelled: "Cancelled" },
};

// the message the dashboard set for this stage (falls back to the default)
export function statusMsg(status) {
  const custom = state.settings?.chat?.status_msgs?.[status];
  const d = DEFAULT_STATUS_MSGS[status] || DEFAULT_STATUS_MSGS.new;
  return (custom && (custom[lang] || custom.ar)) || d[lang === "en" ? "en" : "ar"];
}

// this device's latest order (saved when the order is sent), so the chat can show it without asking
export function lastOrder() { try { const o = JSON.parse(localStorage.getItem("wixa-last-order") || "null"); return o?.number ? o : null; } catch { return null; } }
export function rememberOrder(number, phone) { try { if (number) localStorage.setItem("wixa-last-order", JSON.stringify({ number, phone, at: Date.now() })); } catch {} }

async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}
// number + phone → { order } | { error: "not_found" | "validation" | "rate_limited" | "storage" }
export async function lookupOrder(number, phone) {
  const { ok, status, d } = await post("/api/order-status", { number, phone });
  return ok && d.order ? { order: d.order } : { error: status === 404 ? "not_found" : status === 422 ? "validation" : status === 429 ? "rate_limited" : "storage" };
}
// phone + name → { orders: [...] } | { error }
export async function findOrders(phone, name) {
  const { ok, status, d } = await post("/api/order-find", { phone, name });
  return ok ? { orders: d.orders || [] } : { error: status === 422 ? "validation" : status === 429 ? "rate_limited" : "storage" };
}
export const ORDER_RE = /WX-?\d{6}-?[A-Z0-9]{4}/i;
export const normNumber = (s) => { const m = String(s || "").toUpperCase().replace(/\s/g, "").match(/WX-?(\d{6})-?([A-Z0-9]{4})/); return m ? `WX-${m[1]}-${m[2]}` : String(s || "").trim().toUpperCase(); };
