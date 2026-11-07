/* Live chat in the dashboard: one Supabase Realtime subscription for the whole session (owner and customer service).
   It keeps the unread count in the menu, plays a short sound and shows a notice when a visitor writes,
   and tells the site that the team is online (a heartbeat every 45 s while the dashboard is visible). */
import { $, role, sb, toast, user } from "./core.js";

let channel = null, beat = 0;
const listeners = new Set();
export const onChat = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const canChat = () => role === "owner" || role === "support";

export async function refreshChatCount() {
  const { data, error } = await sb.from("chats").select("unread").gt("unread", 0);
  if (error) return;
  const n = (data || []).reduce((a, c) => a + (c.unread || 0), 0);
  const el = $("#chatCount"); if (el) { el.hidden = !n; el.textContent = n > 99 ? "99+" : n; }
}

let audio;
function beep() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(880, audio.currentTime); o.frequency.setValueAtTime(1320, audio.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.4);
  } catch {}
}

const ping = () => { if (!document.hidden && user) sb.from("chat_presence").upsert({ user_id: user.id, seen_at: new Date().toISOString() }).then(() => {}, () => {}); };

export async function startChatLive() {
  if (!canChat() || channel) return;
  const { error } = await sb.from("chats").select("id").limit(1);
  if (error) return; // the chat update is not applied to the database yet
  refreshChatCount();
  channel = sb.channel("wixa-chat")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (p) => {
      const m = p.new;
      if (m.sender === "visitor") {
        beep();
        if (location.hash !== "#chats") toast("💬 رسالة جديدة في دردشة الموقع");
      }
      listeners.forEach((f) => f("message", m));
      refreshChatCount();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "chats" }, (p) => { listeners.forEach((f) => f("chat", p.new || p.old)); refreshChatCount(); })
    .subscribe();
  ping(); beat = setInterval(ping, 45000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { ping(); refreshChatCount(); } });
  // a tap on a chat notification opens the conversations page
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "open-chats") location.hash = "#chats"; });
}
export function stopChatLive() {
  clearInterval(beat);
  if (channel) { sb.removeChannel?.(channel); channel = null; }
}

// ---------- notifications on this device (Web Push) ----------
const u8 = (b64) => { const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export async function pushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/admin/");
  return (await reg?.pushManager.getSubscription()) ? "on" : "off";
}
export async function enablePush(adminApi) {
  if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") throw new Error("denied");
  const reg = await navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/" });
  await navigator.serviceWorker.ready;
  const { key } = await adminApi("push");
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) });
  return adminApi("push", "POST", { endpoint: sub.endpoint, test: true });
}
export async function disablePush(adminApi) {
  const reg = await navigator.serviceWorker.getRegistration("/admin/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await adminApi("push", "DELETE", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
