import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query"
import { apiClient } from "@/services/api/client"
import { showActionToast } from "@/lib/toast"
import type { Entity } from "@/services/api/types"

/** Surfaced whenever an optimistic write rolls back — so a failed save is never silent. */
function onWriteError() {
  showActionToast("Couldn’t save — the change was undone.", undefined, "error")
}

type Params = Record<string, string | string[] | undefined>
export type Body = Record<string, unknown>
/** Per-observer query overrides (e.g. the mention resolver pins staleTime). */
type ListOptions = { staleTime?: number; gcTime?: number; enabled?: boolean }

// --- optimistic-cache helpers ----------------------------------------------
// Edits patch every cached query under `[resource]` (lists, detail, derived)
// synchronously in `onMutate`, so the UI reflects the change instantly instead
// of waiting for the request round-trip (which, through the tunnel, is the bulk
// of the perceived latency). The background invalidate then reconciles.

type Snapshot = [QueryKey, unknown][]
const hasId = (v: unknown, id: string): v is { id: string } =>
  !!v && typeof v === "object" && (v as { id?: unknown }).id === id

/** Merge `patch` into any cached row (list item or single object) with this id. */
function mergeById(old: unknown, id: string, patch: Body): unknown {
  if (Array.isArray(old)) return old.map((it) => (hasId(it, id) ? { ...it, ...patch } : it))
  if (hasId(old, id)) return { ...old, ...patch }
  return old
}
/** Drop any cached list row with this id. */
function dropById(old: unknown, id: string): unknown {
  return Array.isArray(old) ? old.filter((it) => !hasId(it, id)) : old
}

/** Cancel in-flight fetches and snapshot every `[resource]` query for rollback. */
async function snapshot(qc: QueryClient, resource: string): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: [resource] })
  return qc.getQueriesData({ queryKey: [resource] })
}
function rollback(qc: QueryClient, prev: Snapshot | undefined): void {
  for (const [key, data] of prev ?? []) qc.setQueryData(key, data)
}

/**
 * Build the standard list/create/update/delete hooks for a REST resource.
 *
 * Updates and deletes are **optimistic**: `onMutate` patches the cache
 * immediately (and rolls back on error), so the UI feels instant; `onSettled`
 * invalidates `[resource]` (which prefix-matches every list/detail/derived key)
 * to reconcile with the server. Creates invalidate on success. The live SSE
 * stream (see `services/api/live.ts`) drives the same invalidation for
 * *external* changes (other tabs/devices).
 */
export function createCrud<T extends Entity>(resource: string) {
  const base = `/${resource}`

  function useList(params?: Params, options?: ListOptions) {
    return useQuery({
      queryKey: [resource, params ?? {}],
      queryFn: () => apiClient.get<T[]>(base, params),
      ...options,
    })
  }

  /** Fetch a single row by id (for deep-linked detail views). */
  function useGet(id: string | undefined) {
    return useQuery({
      queryKey: [resource, "one", id],
      queryFn: () => apiClient.get<T>(`${base}/${id}`),
      enabled: !!id,
    })
  }

  function useCreate() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: (body: Body) => apiClient.post<T>(base, body),
      // No optimistic insert: the server assigns the id and list ordering, so we
      // wait for the response and let the invalidate place it correctly.
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: [resource] })
      },
      onError: onWriteError,
    })
  }

  function useUpdate() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ id, body }: { id: string; body: Body }) =>
        apiClient.patch<T>(`${base}/${id}`, body),
      onMutate: async ({ id, body }) => {
        const prev = await snapshot(qc, resource)
        qc.setQueriesData({ queryKey: [resource] }, (old) => mergeById(old, id, body))
        return { prev }
      },
      onError: (_e, _v, ctx) => {
        rollback(qc, ctx?.prev)
        onWriteError()
      },
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: [resource] })
      },
    })
  }

  function useRemove() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: (id: string) => apiClient.delete<void>(`${base}/${id}`),
      onMutate: async (id) => {
        const prev = await snapshot(qc, resource)
        qc.setQueriesData({ queryKey: [resource] }, (old) => dropById(old, id))
        return { prev }
      },
      onError: (_e, _v, ctx) => {
        rollback(qc, ctx?.prev)
        onWriteError()
      },
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: [resource] })
      },
    })
  }

  return { resource, useList, useGet, useCreate, useUpdate, useRemove }
}
