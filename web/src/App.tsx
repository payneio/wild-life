import { useEffect } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "react-router-dom"
import { AuthProvider } from "@/auth/AuthContext"
import { LoginGate } from "@/auth/LoginGate"
import { useAuth } from "@/auth/context"
import { queryClient } from "@/lib/queryClient"
import { showToast } from "@/lib/toast"
import { router } from "@/router/routes"
import { appEventHandlers, useLiveUpdates } from "@/services/api/live"
import { pushSupported, registerServiceWorker } from "@/services/push"

/** Opens the single live SSE connection while authenticated. */
function LiveUpdates() {
  const { token } = useAuth()
  useLiveUpdates(token)
  return null
}

interface ReminderEnvelope {
  title?: string
  body?: string
  url?: string
}

/**
 * Wires up reminder delivery to open tabs. Two paths, deduped:
 *   • Subscribed + focused → the service worker postMessages here (no OS banner).
 *   • Not subscribed → the SSE "reminder" event shows an in-app toast (works
 *     without notification permission). When subscribed, the SW covers it, so
 *     we skip the SSE toast to avoid a double.
 */
function Reminders() {
  useEffect(() => {
    if (pushSupported()) void registerServiceWorker()

    appEventHandlers["reminder"] = (e) => {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        return // the service worker (or its postMessage) is handling this one
      }
      const r = e as ReminderEnvelope
      showToast(r.title ?? "Reminder", r.body, r.url)
    }

    const onSwMessage = (ev: MessageEvent) => {
      const d = ev.data as { kind?: string } & ReminderEnvelope
      if (d?.kind === "reminder") showToast(d.title ?? "Reminder", d.body, d.url)
    }
    navigator.serviceWorker?.addEventListener("message", onSwMessage)
    return () => {
      delete appEventHandlers["reminder"]
      navigator.serviceWorker?.removeEventListener("message", onSwMessage)
    }
  }, [])
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LiveUpdates />
        <Reminders />
        <LoginGate>
          <RouterProvider router={router} />
        </LoginGate>
      </AuthProvider>
    </QueryClientProvider>
  )
}
