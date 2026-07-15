import { useMutation, useQuery } from "@tanstack/react-query"
import { apiClient } from "@/services/api/client"
import type { Entity } from "@/services/api/types"

type Params = Record<string, string | string[] | undefined>
export type Body = Record<string, unknown>

/**
 * Build the standard list/create/update/delete hooks for a REST resource.
 *
 * Mutations intentionally do NOT invalidate caches — reactivity is driven by the
 * single live SSE stream (see `services/api/live.ts`): every write lands in
 * `change_log`, which fans out over `LISTEN/NOTIFY` and refreshes the UI. Own
 * edits and external changes travel the exact same path.
 */
export function createCrud<T extends Entity>(resource: string) {
  const base = `/${resource}`

  function useList(params?: Params) {
    return useQuery({
      queryKey: [resource, params ?? {}],
      queryFn: () => apiClient.get<T[]>(base, params),
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
    return useMutation({
      mutationFn: (body: Body) => apiClient.post<T>(base, body),
    })
  }

  function useUpdate() {
    return useMutation({
      mutationFn: ({ id, body }: { id: string; body: Body }) =>
        apiClient.patch<T>(`${base}/${id}`, body),
    })
  }

  function useRemove() {
    return useMutation({
      mutationFn: (id: string) => apiClient.delete<void>(`${base}/${id}`),
    })
  }

  return { resource, useList, useGet, useCreate, useUpdate, useRemove }
}
