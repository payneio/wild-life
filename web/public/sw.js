// Service worker for Personal — Web Push reminders only (no offline caching).
//
// The backend sends a JSON push payload; we surface it as a notification. When
// a window is focused we hand it to the page instead (in-app toast) so an open
// tab doesn't get a redundant OS banner.

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "Reminder", body: event.data ? event.data.text() : "" }
  }

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      const focused = clientList.find((c) => c.focused)
      if (focused) {
        // A tab is in front — let the app show an in-app toast, no OS banner.
        focused.postMessage({ kind: "reminder", ...data })
        return
      }
      await self.registration.showNotification(data.title || "Reminder", {
        body: data.body || "",
        tag: data.tag,
        data: { url: data.url || "/" },
        icon: "/favicon.svg",
        badge: "/favicon.svg",
      })
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus()
          if ("navigate" in client && url) await client.navigate(url)
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })(),
  )
})
