/* Dashboard service worker: shows live-chat notifications on the team's devices. It caches nothing. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  e.waitUntil(self.registration.showNotification("💬 رسالة جديدة في دردشة الموقع", {
    body: "زبون يكتب الآن في نافذة الدردشة — اضغط للرد.",
    icon: "/icons/icon-192.png", badge: "/icons/icon-96.png", tag: "wixa-chat", renotify: true, dir: "rtl", lang: "ar",
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => new URL(c.url).pathname.startsWith("/admin"));
    if (w) { await w.focus(); w.postMessage({ type: "open-chats" }); return; }
    await self.clients.openWindow("/admin/#chats");
  })());
});
