import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { DateText, PriorityBadge, StatusBadge } from "@/components/cells"
import { ListToolbar } from "@/components/ListToolbar"
import { QuickCreate } from "@/components/QuickCreate"
import { Card, EmptyState } from "@/components/ui/primitives"
import { deriveListConfig, useListFilter } from "@/lib/listFilter"
import { cn } from "@/lib/utils"
import { PROJECT_FIELDS } from "@/services/api/fields"
import { areas, programs, projects } from "@/services/api/hooks"
import { isTerminal } from "@/services/api/lifecycle"
import type { Area, Program, Project } from "@/services/api/types"

/**
 * Projects, sectioned by the program they serve.
 *
 * Same shape as `ProgramsPage` one rung down, and for the same reason: a project
 * exists to move a program along, so the program is the heading you scan rather
 * than a column you re-read on every row — and capture inside a section already
 * says which program, leaving nothing to ask (ui-architecture §2b.4).
 *
 * Here the rule is also the schema's: `program_id` is non-null, so a one-line
 * capture at the top of an undivided list had no honest answer for it. Sections
 * turn the required field into the thing you were already pointing at.
 *
 * Programs are grouped under their area in turn, so the page reads as the whole
 * hierarchy at once without a project ever storing an area of its own.
 */
export function ProjectsPage() {
  const navigate = useNavigate()
  const { data: areaData } = areas.useList()
  const { data: programData } = programs.useList()
  const { data, isLoading } = projects.useList()
  const create = projects.useCreate()
  const rows = useMemo(() => data ?? [], [data])
  const areaList = useMemo(() => areaData ?? [], [areaData])
  const programList = useMemo(() => programData ?? [], [programData])

  // No Program filter: the headings already lay every program out, so a dropdown
  // that hides all but one is a worse version of scrolling to it.
  const { filtered, toolbarProps, closedCount } = useListFilter(
    rows as unknown as Record<string, unknown>[],
    useMemo(() => deriveListConfig(PROJECT_FIELDS, "name"), []),
    "list:projects",
    "project",
  )
  const list = filtered as unknown as Project[]

  const sections = useMemo(() => {
    const byProgram = new Map<string, Project[]>()
    for (const p of list) {
      const bucket = byProgram.get(p.program_id)
      if (bucket) bucket.push(p)
      else byProgram.set(p.program_id, [p])
    }
    const areaName = new Map(areaList.map((a: Area) => [a.id, a.name]))
    // A finished program with nothing in it is noise; one still holding projects
    // has to stay, or the list would under-report itself.
    return [...programList]
      .filter((p: Program) => !isTerminal("program", p.status) || byProgram.has(p.id))
      .map((p: Program) => ({
        key: p.id,
        label: p.name,
        area: (p.area_id && areaName.get(p.area_id)) || "No area",
        items: byProgram.get(p.id) ?? [],
      }))
      .sort(
        (a, b) => a.area.localeCompare(b.area) || a.label.localeCompare(b.label),
      )
  }, [list, programList, areaList])

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-slate-900">Projects</h1>
        <p className="truncate text-sm text-slate-500">Finite efforts with a defined outcome</p>
      </div>

      <ListToolbar {...toolbarProps} />

      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : programList.length === 0 ? (
        <EmptyState>
          No programs yet — a project serves a program, so start one there first.
        </EmptyState>
      ) : sections.every((s) => s.items.length === 0) && closedCount > 0 ? (
        <EmptyState>No matches — {closedCount} closed hidden.</EmptyState>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.key}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                  {section.area} · {section.label}
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
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate(p.id)}
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
                            <PriorityBadge priority={p.priority} />
                            <DateText value={p.target_date} />
                            {!p.next_action && (
                              <span className="text-amber-600">— set a next action</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <QuickCreate
                  className={cn(
                    "px-2 py-2",
                    section.items.length > 0 && "border-t border-slate-50",
                  )}
                  placeholder={`New project in ${section.label}…`}
                  onCreate={(name) => create.mutate({ name, program_id: section.key })}
                />
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
