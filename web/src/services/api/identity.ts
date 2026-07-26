import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/services/api/client"
import type { Identity } from "@/services/api/types"

/**
 * The Person the current token acts as (`WILD_LIFE_SELF_PERSON_ID` for the owner
 * token, its own person for a worker token).
 *
 * Fixed for the life of a token, so it is fetched once and never refetched —
 * pickers call this on every render and must not add a request to that path.
 * Returns `undefined` until it loads and when no self person is configured; every
 * caller must treat "no self" as a normal state, not an error.
 */
export function useSelfPersonId(): string | undefined {
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient.get<Identity>("/me"),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
  return data?.person_id ?? undefined
}
