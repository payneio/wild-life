import { useState } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Minus, X } from "lucide-react"
import { Card } from "@/components/ui/primitives"
import { apiClient } from "@/services/api/client"
import { routeFor } from "@/services/api/routes"
import { cn } from "@/lib/utils"
import type { DashRow, EntityType } from "@/services/api/types"

/**
 * The standing claims this review should judge.
 *
 * A *target* is discharged once and a date says so. A *standard* — "no important
 * relationship neglected" — is true or false today and can become false again,
 * so it is never completed and a deadline is the wrong prompt for it. What it
 * needs is to be *asked*, and a review is when asking happens: looking at a
 * scope is the same act as giving its standing claims a truth value.
 *
 * Three answers, not two. "Couldn't tell" is a real judgement and a different
 * one from "no" — it is the answer that most often means the claim is badly
 * worded or unmeasurable, and collapsing it into "no" hides exactly that.
 *
 * Answering is one click because a review with six claims and a form per claim
 * is a review that stops getting done.
 */
export function ClaimsToJudge({ rows }: { rows: DashRow[] }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [judged, setJudged] = useState<Record<string, boolean | null>>({})

  if (rows.length === 0) return null

  const judge = async (id: string, holds: boolean | null) => {
    setBusy(id)
    try {
      await apiClient.post(`/outcomes/${id}/evaluations`, { holds })
      setJudged((j) => ({ ...j, [id]: holds }))
      void qc.invalidateQueries()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Claims to judge
        </h3>
        <span className="text-[11px] text-slate-400">
          standing claims, not targets — they are never done
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((r) => {
          const id = String(r.id)
          const answered = id in judged
          return (
            <li
              key={id}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 transition",
                answered ? "opacity-40" : "hover:bg-slate-50",
              )}
            >
              <Link
                to={routeFor("outcome" as EntityType, id) ?? "/outcomes"}
                className="min-w-0 flex-1 truncate text-sm text-slate-700 hover:text-slate-900"
              >
                {String(r.name ?? "")}
              </Link>
              <span className="shrink-0 text-[11px] text-slate-400">
                {r.last_evaluated ? `last ${r.last_evaluated}` : "never judged"}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {(
                  [
                    ["Holds", true, Check, "text-emerald-600 hover:bg-emerald-50"],
                    ["Doesn't", false, X, "text-red-600 hover:bg-red-50"],
                    ["Unclear", null, Minus, "text-slate-400 hover:bg-slate-100"],
                  ] as const
                ).map(([title, value, Icon, tone]) => (
                  <button
                    key={title}
                    type="button"
                    title={title}
                    disabled={busy === id || answered}
                    onClick={() => judge(id, value)}
                    className={cn("rounded p-1 transition disabled:opacity-30", tone)}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
