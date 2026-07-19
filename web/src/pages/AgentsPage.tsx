import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Bot } from "lucide-react"
import { Card } from "@/components/ui/primitives"
import { RefName, StatusBadge } from "@/components/cells"
import { apiClient } from "@/services/api/client"
import { requests, tasks } from "@/services/api/hooks"
import type { Request, Task } from "@/services/api/types"

interface AdminToken {
  id: string
  person_id: string | null
  role: string
  label: string
  revoked_at: string | null
}

const CLOSED = new Set(["completed", "cancelled"])

/** Live control tower for the autonomous agent fleet: each agent's active work,
 * what they've claimed, and the Requests they've raised. Updates over SSE. */
export function AgentsPage() {
  const { data: tokens } = useQuery<AdminToken[]>({
    queryKey: ["admin-tokens"],
    queryFn: () => apiClient.get<AdminToken[]>("/admin/tokens"),
  })
  const { data: allTasks } = tasks.useList()
  const { data: allReqs } = requests.useList()

  const agentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of tokens ?? [])
      if (t.role === "worker" && t.person_id && !t.revoked_at) ids.add(t.person_id)
    return ids
  }, [tokens])

  if (agentIds.size === 0) {
    return (
      <div className="p-6 text-sm text-slate-500">
        No worker credentials yet. Mint one from a person's detail page to enrol an
        agent.
      </div>
    )
  }

  const byAgent = [...agentIds].map((pid) => {
    const active = (allTasks ?? []).filter(
      (t: Task) =>
        !CLOSED.has(t.status) &&
        (t.assignee_id === pid || t.claimed_by_id === pid),
    )
    const raised = (allReqs ?? []).filter(
      (r: Request) => r.requester_id === pid && r.status === "open",
    )
    return { pid, active, raised }
  })

  const totalActive = byAgent.reduce((n, a) => n + a.active.length, 0)

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Bot size={18} className="text-slate-500" />
        <h1 className="text-lg font-semibold text-slate-900">Agents</h1>
        <span className="text-sm text-slate-400">
          {agentIds.size} agents · {totalActive} active tasks
        </span>
      </div>

      {byAgent.map(({ pid, active, raised }) => (
        <Card key={pid} className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium text-slate-900">
              <RefName kind="people" id={pid} />
            </div>
            <span className="text-xs text-slate-400">
              {active.length} active · {raised.length} open request
              {raised.length === 1 ? "" : "s"}
            </span>
          </div>

          {active.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {active.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-1.5 text-sm">
                  {t.claimed_by_id === pid && (
                    <span
                      className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500"
                      title="claimed — working now"
                    />
                  )}
                  <Link
                    to={`/tasks/${t.id}`}
                    className="min-w-0 flex-1 truncate text-slate-700 hover:text-indigo-600"
                  >
                    {t.title}
                  </Link>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">Idle — no active tasks.</p>
          )}

          {raised.length > 0 && (
            <div className="rounded-md bg-amber-50 p-2">
              <div className="mb-1 text-xs font-medium text-amber-800">
                Waiting on an answer:
              </div>
              <ul className="space-y-1">
                {raised.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-xs">
                    <Link
                      to={`/requests/${r.id}`}
                      className="min-w-0 flex-1 truncate text-amber-900 hover:underline"
                    >
                      {r.subject}
                    </Link>
                    <span className="text-amber-600">
                      → <RefName kind="people" id={r.addressee_id} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
