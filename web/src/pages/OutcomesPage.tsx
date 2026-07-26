import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { StatusBadge } from "@/components/cells"
import { ListToolbar } from "@/components/ListToolbar"
import { Card, EmptyState } from "@/components/ui/primitives"
import { deriveListConfig, useListFilter } from "@/lib/listFilter"
import { formatBand, humanize } from "@/lib/format"
import { OUTCOME_FIELDS } from "@/services/api/fields"
import { outcomes, useOutcomeEvaluation } from "@/services/api/hooks"
import { useEntityResolver } from "@/services/api/mentions"
import type { Outcome } from "@/services/api/types"

const GOOD = new Set(["met", "achieved", "on_pace", "satisfied"])
const BAD = new Set(["breached", "behind", "overdue"])

/** Where the claim stands, in a row's worth of space.
 *
 *  Deliberately not a progress bar: a bar implies a fraction, and most outcomes
 *  don't have one — a standard is in its band or out of it, and a metric nobody
 *  has read has no position at all. The verdict is the word; the number appears
 *  only when there genuinely is one.
 */
function Verdict({ outcome }: { outcome: Outcome }) {
  const { data } = useOutcomeEvaluation(outcome.id)
  if (!data) return <span className="text-slate-300">—</span>
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={
          GOOD.has(data.state)
            ? "text-emerald-600"
            : BAD.has(data.state)
              ? "text-red-600"
              : "text-slate-400"
        }
      >
        {humanize(data.state)}
      </span>
      {data.progress !== null ? (
        <span className="tabular-nums text-slate-500">{Math.round(data.progress)}%</span>
      ) : data.latest_value !== null ? (
        <span className="tabular-nums text-slate-500">{data.latest_value}</span>
      ) : null}
      {data.is_stale && <span className="text-amber-600">· stale</span>}
    </span>
  )
}

/**
 * Every outcome, browsable.
 *
 * No capture line here, and that's the design rather than an omission: an
 * outcome is meaningless without something to belong to, and its kind follows
 * from what that something is. Both are known at the point you create it from
 * an Area, Program or Project panel, and neither is known here — so this is a
 * place to read and open, not to create.
 */
export function OutcomesPage() {
  const navigate = useNavigate()
  // Roots are soft-poly, so the name comes from the same resolver notes use
  // rather than a per-type lookup that would only cover some of them.
  const resolve = useEntityResolver()
  const { data, isLoading } = outcomes.useList()
  const rows = useMemo(() => data ?? [], [data])
  const { filtered, toolbarProps, closedCount } = useListFilter(
    rows as unknown as Record<string, unknown>[],
    useMemo(() => deriveListConfig(OUTCOME_FIELDS, "statement"), []),
    "list:outcomes",
    "outcome",
  )
  const list = filtered as unknown as Outcome[]

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-slate-900">Outcomes</h1>
        <p className="truncate text-sm text-slate-500">What must be true, and whether it is</p>
      </div>

      <ListToolbar {...toolbarProps} />

      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>
          Nothing claimed yet. Outcomes are created on the thing they belong to —
          an area&rsquo;s standards, a program&rsquo;s targets, a project&rsquo;s done-when.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState>
          {closedCount > 0 ? `No matches — ${closedCount} closed hidden.` : "No matches."}
        </EmptyState>
      ) : (
        <Card className="max-h-[75vh] overflow-y-auto">
          <ul>
            {list.map((o) => (
              <li key={o.id} className="border-b border-slate-50 last:border-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(o.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate(o.id)}
                  className="cursor-pointer px-3 py-2 hover:bg-slate-50/70 focus:bg-slate-50 focus:outline-none"
                >
                  <div className="break-words text-sm font-medium text-slate-800">
                    {o.statement}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <Verdict outcome={o} />
                    <span>{humanize(o.kind)}</span>
                    <StatusBadge status={o.status} />
                    <span>{resolve(o.entity_type, o.entity_id) ?? "…"}</span>
                    {formatBand(o.target_min, o.target_max) && (
                      <span>target {formatBand(o.target_min, o.target_max)}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
