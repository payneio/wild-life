// Service worker for Wild Life — Web Push reminders only (no offline caching).
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
      // userVisibleOnly requires every push to show a notification, so always do
      // so (even when a tab is focused). Also notify any focused tab so the app
      // can react in-page.
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      for (const c of clients) c.postMessage({ kind: data.kind || "reminder", ...data })
      await self.registration.showNotification(data.title || "Reminder", {
        body: data.body || "",
        tag: data.tag,
        data: { url: data.url || "/" },
        requireInteraction: false,
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
