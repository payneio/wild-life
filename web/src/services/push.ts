// Web Push opt-in: register the service worker, subscribe via the browser's
// PushManager using the server's VAPID key, and persist the subscription in
// personal-api. Mirrors the bearer-auth apiClient for all API calls.

import { apiClient } from "@/services/api/client"

export type PushState = "unsupported" | "default" | "denied" | "subscribed"

export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  const buffer = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  return navigator.serviceWorker.register("/sw.js")
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported"
  if (Notification.permission === "denied") return "denied"
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub && Notification.permission === "granted") return "subscribed"
  return "default"
}

export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported"

  const permission = await Notification.requestPermission()
  if (permission !== "granted") return permission === "denied" ? "denied" : "default"

  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker())
  if (!reg) return "unsupported"
  await navigator.serviceWorker.ready

  const { key } = await apiClient.get<{ key: string }>("/push/vapid-public-key")
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  })

  const json = sub.toJSON()
  await apiClient.post("/push/subscriptions", {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    label: navigator.userAgent.slice(0, 120),
  })
  return "subscribed"
}

export async function sendTestPush(): Promise<{ sent: number; subscriptions: number }> {
  return apiClient.post<{ sent: number; subscriptions: number }>("/push/test")
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported"
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    try {
      await apiClient.delete(
        `/push/subscriptions?endpoint=${encodeURIComponent(sub.endpoint)}`,
      )
    } finally {
      await sub.unsubscribe()
    }
  }
  return "default"
}
