import { useQuery } from "@tanstack/react-query"
import { EmptyState } from "@/components/ui/primitives"
import { Log } from "@/components/Log"
import { apiClient } from "@/services/api/client"
import type { Identity } from "@/services/api/types"

/**
 * The Journal: the self Person's log, framed as a landing surface.
 *
 * There is no special "journal" kind of note. An entry here is my observations
 * about myself, which is the same relation a note on anyone else has to them —
 * so this is the ordinary log component pointed at one particular subject.
 *
 * "No self" is a normal state, not an error: the owner credential may carry no
 * Person (`WILD_LIFE_SELF_PERSON_ID` unset), and a token minted for a worker
 * never does. Say so plainly rather than rendering an empty journal that looks
 * like lost writing.
 */
export function JournalRoute() {
  // The shared `useSelfPersonId` returns undefined both while loading and when
  // there is no self, which would flash the message below on every visit. This
  // page is the one caller that has to tell those apart, so it reads the query.
  const { data, isPending } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient.get<Identity>("/me"),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
  const selfId = data?.person_id ?? undefined

  if (!isPending && !selfId) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState>
          No self person is configured, so there is no journal to show. Set
          <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs">
            WILD_LIFE_SELF_PERSON_ID
          </code>
          to the Person you are.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Log rootType="person" rootId={selfId} heading="Journal" base="/notes" />
    </div>
  )
}
