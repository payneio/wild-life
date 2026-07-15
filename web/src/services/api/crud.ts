import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/services/api/client"
import type { Entity } from "@/services/api/types"

type Params = Record<string, string | undefined>
export type Body = Record<string, unknown>

/** Build the standard list/create/update/delete hooks for a REST resource. */
export function createCrud<T extends Entity>(resource: string) {
  const base = `/${resource}`

  function useList(params?: Params) {
    return useQuery({
      queryKey: [resource, params ?? {}],
      queryFn: () => apiClient.get<T[]>(base, params),
    })
  }

  function useCreate() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: (body: Body) => apiClient.post<T>(base, body),
      onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
    })
  }

  function useUpdate() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ id, body }: { id: string; body: Body }) =>
        apiClient.patch<T>(`${base}/${id}`, body),
      onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
    })
  }

  function useRemove() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: (id: string) => apiClient.delete<void>(`${base}/${id}`),
      onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
    })
  }

  return { resource, useList, useCreate, useUpdate, useRemove }
}
