import { useEffect } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { fetchEventSource } from "@microsoft/fetch-event-source"
import { clearStoredToken } from "@/auth/context"

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:9005"

interface Envelope {
  kind: string
  [k: string]: unknown
}

/**
 * Handlers for non-"change" app events (notifications, job progress, …). Empty
 * for now — the seam that lets the server push arbitrary events over the same
 * single SSE connection without adding another transport.
 */
export const appEventHandlers: Record<string, (e: Envelope) => void> = {}

/**
 * The app's single live connection. One SSE stream (`GET /stream`) carries every
 * server event; `kind:"change"` drives a debounced `invalidateQueries()` so the
 * whole UI stays live — your own edits and external changes travel the same path.
 */
export function useLiveUpdates(token: string | null): void {
  const qc: QueryClient = useQueryClient()

  useEffect(() => {
    if (!token) return
    const ctrl = new AbortController()
    let debounce: ReturnType<typeof setTimeout> | null = null
    let opened = false
    // Resources changed since the last flush; coalesced over the debounce window.
    const pending = new Set<string>()

    const invalidateSoon = (resource: string) => {
      pending.add(resource)
      if (debounce) return
      debounce = setTimeout(() => {
        debounce = null
        const batch = new Set(pending)
        pending.clear()
        for (const r of batch) void qc.invalidateQueries({ queryKey: [r] })
      }, 200)
    }

    void fetchEventSource(`${BASE_URL}/stream`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}` },
      openWhenHidden: true,
      async onopen(res) {
        if (res.status === 401) {
          clearStoredToken()
          window.location.reload()
          throw new Error("unauthorized")
        }
        // On any *re*connect, catch up on anything missed while disconnected.
        if (opened) void qc.invalidateQueries()
        opened = true
      },
      onmessage(ev) {
        if (!ev.data) return
        let env: Envelope
        try {
          env = JSON.parse(ev.data) as Envelope
        } catch {
          return
        }
        if (env.kind === "change") {
          // entity_type is the backend tablename (snake_plural); the frontend
          // resource is the same with hyphens. Scope invalidation to it so one
          // change doesn't refetch the whole app.
          const resource = String(env.entity_type ?? "").replace(/_/g, "-")
          if (resource) invalidateSoon(resource)
          else void qc.invalidateQueries() // unknown type → safe global fallback
        } else if (env.kind === "connected") return
        else appEventHandlers[env.kind]?.(env)
      },
      onerror(err) {
        if (ctrl.signal.aborted) throw err // unmount → stop, don't retry
        // otherwise return (undefined) → fetch-event-source auto-reconnects
      },
    })

    return () => {
      ctrl.abort()
      if (debounce) clearTimeout(debounce)
    }
  }, [token, qc])
}
