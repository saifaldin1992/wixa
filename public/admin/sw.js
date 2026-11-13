/* Dashboard service worker: shows the team's notifications (chat, orders, messages, bookings, reminders) on their
   devices. A push carries no text; the worker asks /api/push/last what it was about (only a subscribed device gets
   an answer). It caches nothing. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const KINDS = {
  chat: ["💬 رسالة جديدة في دردشة الموقع", (l) => `${l || "زبون"} يكتب الآن — اضغط للرد.`, "chats"],
  order: ["🧾 طلب مشروع جديد", (l) => `${l ? `من ${l} — ` : ""}افتح الطلبات لتراه.`, "orders"],
  message: ["✉️ رسالة جديدة من الموقع", (l) => `${l ? `من ${l} — ` : ""}افتح الوارد لتقرأها.`, "inbox"],
  booking: ["📅 حجز موعد جديد", (l) => `${l ? `${l} حجز موعداً — ` : ""}افتح الوارد لتراه.`, "inbox"],
  job: ["👤 طلب توظيف جديد", (l) => `${l ? `من ${l} — ` : ""}افتح الوارد لتراه.`, "inbox"],
  reminder: ["⏰ موعد بعد ساعة", (l) => (l ? `${l} (بتوقيت بغداد)` : "لديك موعد بعد ساعة."), "inbox"],
};

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let kind = "chat", label = "";
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch(`/api/push/last?endpoint=${encodeURIComponent(sub?.endpoint || "")}`, { cache: "no-store" });
      const d = await r.json();
      if (KINDS[d.kind]) { kind = d.kind; label = d.label || ""; }
    } catch { /* the chat text below */ }
    const [title, body, view] = KINDS[kind];
    await self.registration.showNotification(title, {
      body: body(label), data: { view },
      icon: "/icons/icon-192.png", badge: "/icons/icon-96.png", tag: `wixa-${kind}`, renotify: true, dir: "rtl", lang: "ar",
    });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const view = e.notification.data?.view || "chats";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => new URL(c.url).pathname.startsWith("/admin"));
    if (w) { await w.focus(); w.postMessage({ type: "open-view", view }); if (view === "chats") w.postMessage({ type: "open-chats" }); return; }
    await self.clients.openWindow(`/admin/#${view}`);
  })());
});
