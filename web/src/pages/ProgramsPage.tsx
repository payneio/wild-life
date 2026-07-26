import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { DateText, StatusBadge } from "@/components/cells"
import { ListToolbar } from "@/components/ListToolbar"
import { QuickCreate } from "@/components/QuickCreate"
import { Card, EmptyState } from "@/components/ui/primitives"
import { deriveListConfig, useListFilter } from "@/lib/listFilter"
import { cn } from "@/lib/utils"
import { PROGRAM_FIELDS } from "@/services/api/fields"
import { areas, programs } from "@/services/api/hooks"
import { isTerminal } from "@/services/api/lifecycle"
import type { Area, Program } from "@/services/api/types"

/** Programs with no area, which the model allows and capture here doesn't create. */
const UNASSIGNED = "__unassigned__"

/**
 * Programs, sectioned by the area they serve.
 *
 * A program is an effort to improve *an area* — the area is the first thing you
 * think in, so it's the heading you scan rather than a column you re-read on
 * every row. That's also why capture lives inside each section instead of once
 * at the top: the gesture already says which area, so there's nothing to ask
 * (ui-architecture §2b — "if the object is meaningless without a relationship,
 * capture that one too"). `area_id` is nullable in the API, so the rule is held
 * at the point of creation; anything already orphaned still shows, last.
 *
 * Hand-composed rather than a `SimpleEntityPage` because the sectioning and the
 * per-section capture *are* the design here, and it keeps the shared list rig —
 * `useListFilter`'s search/sort and hide-closed default — exactly as every other
 * list has it.
 */
export function ProgramsPage() {
  const navigate = useNavigate()
  const { data: areaData } = areas.useList()
  const { data, isLoading } = programs.useList()
  const create = programs.useCreate()
  const rows = useMemo(() => data ?? [], [data])
  const areaList = useMemo(() => areaData ?? [], [areaData])

  // No Area filter: the headings already lay every area out, so a dropdown that
  // hides all but one is a worse version of scrolling to it.
  const { filtered, toolbarProps, closedCount } = useListFilter(
    rows as unknown as Record<string, unknown>[],
    useMemo(() => deriveListConfig(PROGRAM_FIELDS, "name"), []),
    "list:programs",
    "program",
  )
  const list = filtered as unknown as Program[]

  const sections = useMemo(() => {
    const byArea = new Map<string, Program[]>()
    for (const p of list) {
      const key = p.area_id ?? UNASSIGNED
      const bucket = byArea.get(key)
      if (bucket) bucket.push(p)
      else byArea.set(key, [p])
    }
    // An archived area with nothing in it is just noise; one still holding
    // programs has to stay, or the list would under-report itself.
    const named = [...areaList]
      .sort((a: Area, b: Area) => a.name.localeCompare(b.name))
      .filter((a) => !isTerminal("area", a.status) || byArea.has(a.id))
      .map((a) => ({ key: a.id, label: a.name, items: byArea.get(a.id) ?? [], canCreate: true }))
    const orphaned = list.filter((p) => !p.area_id || !areaList.some((a) => a.id === p.area_id))
    return orphaned.length > 0
      ? [...named, { key: UNASSIGNED, label: "No area", items: orphaned, canCreate: false }]
      : named
  }, [list, areaList])

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-slate-900">Programs</h1>
        <p className="truncate text-sm text-slate-500">Long-running efforts to improve an area</p>
      </div>

      <ListToolbar {...toolbarProps} />

      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : areaList.length === 0 ? (
        <EmptyState>
          No areas yet — a program serves an area, so start one there first.
        </EmptyState>
      ) : sections.every((s) => s.items.length === 0) && closedCount > 0 ? (
        <EmptyState>No matches — {closedCount} closed hidden.</EmptyState>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.key}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                  {section.label}
                </span>
                {section.items.length > 0 && (
                  <span className="text-xs text-slate-400">{section.items.length}</span>
                )}
              </div>
              <Card>
                <ul>
                  {section.items.map((p) => (
                    <li key={p.id} className="border-b border-slate-50 last:border-0">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(p.id)}
                        onKeyDown={(e) =>
                          (e.key === "Enter" || e.key === " ") && navigate(p.id)
                        }
                        className={cn(
                          "flex cursor-pointer items-start gap-2 px-3 py-2",
                          "hover:bg-slate-50/70 focus:bg-slate-50 focus:outline-none",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-medium text-slate-800">
                            {p.name}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            <StatusBadge status={p.status} />
                            <DateText value={p.target_date} />
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {section.canCreate && (
                  <QuickCreate
                    className={cn("px-2 py-2", section.items.length > 0 && "border-t border-slate-50")}
                    placeholder={`New program in ${section.label}…`}
                    onCreate={(name) => create.mutate({ name, area_id: section.key })}
                  />
                )}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
