self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "אהבת חינם ❤️", {
      body: data.body || "מישהו הפוך ממך נמצא בקרבתך!",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      dir: "rtl",
      lang: "he",
      data: { url: data.url || "/mission" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(event.notification.data.url);
          return c.focus();
        }
      }
      return clients.openWindow(event.notification.data.url);
    })
  );
});
