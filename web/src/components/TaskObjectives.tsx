import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { X } from "lucide-react"
import { EntityCombobox } from "@/components/EntityCombobox"
import { apiClient } from "@/services/api/client"
import type { MentionResult } from "@/services/api/mentions"
import type { Outcome } from "@/services/api/types"

/**
 * What this task is *for* — A9's means-end edge.
 *
 * The one thing this deliberately does not do is close anything. Contribution
 * is not satisfaction: an objective becomes true when its claim is true, never
 * because the tasks pointing at it are finished. Drafting, editing and
 * submitting do not publish the paper; publishing does. So this answers "what
 * is left before X" and stays silent on whether X holds.
 *
 * Optional by design. Plenty of what you do serves no declared end, and a task
 * that has to name one before it can exist is a task you stop capturing.
 */
export function TaskObjectives({ taskId }: { taskId: string }) {
  const qc = useQueryClient()
  const [picking, setPicking] = useState(false)

  const { data: serving } = useQuery({
    queryKey: ["tasks", taskId, "objectives"],
    queryFn: () => apiClient.get<Outcome[]>(`/tasks/${taskId}/objectives`),
  })

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["tasks", taskId, "objectives"] })

  const add = async (r: MentionResult) => {
    if (r.type !== "outcome") return
    await apiClient.put(`/tasks/${taskId}/objectives/${r.id}`, {})
    setPicking(false)
    void refresh()
  }

  const drop = async (outcomeId: string) => {
    await apiClient.delete(`/tasks/${taskId}/objectives/${outcomeId}`)
    void refresh()
  }

  return (
    <div className="space-y-2">
      {(serving ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(serving ?? []).map((o) => (
            <span
              key={o.id}
              className="flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800"
            >
              {o.statement}
              <button
                type="button"
                className="text-emerald-400 transition hover:text-red-600"
                title="No longer serves this"
                onClick={() => drop(o.id)}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {picking ? (
        <EntityCombobox
          intent="reference"
          type="outcome"
          placeholder="Which objective does this serve?"
          onSelect={add}
          onClose={() => setPicking(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
        >
          Serves…
        </button>
      )}
    </div>
  )
}
