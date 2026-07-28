import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { QuickCreate } from "@/components/QuickCreate"
import { EntityRefField } from "@/components/graph/EntityRefField"
import { ListToolbar } from "@/components/ListToolbar"
import { DateText, PriorityBadge, RefName, StatusBadge } from "@/components/cells"
import { EmptyState } from "@/components/ui/primitives"
import { DELEGATION_STATUS, PRIORITIES } from "@/services/api/enums"
import { useListFilter, type ListConfig } from "@/lib/listFilter"
import { isOverdue } from "@/lib/format"
import { cn } from "@/lib/utils"
import { delegations } from "@/services/api/hooks"
import type { Delegation, DelegationStatus } from "@/services/api/types"


const CONFIG: ListConfig = {
  searchKeys: ["requested_outcome", "instructions", "latest_update"],
  filters: [
    { field: "status", label: "Status", options: DELEGATION_STATUS },
    { field: "priority", label: "Priority", options: PRIORITIES },
  ],
  sorts: [],
}

// Open statuses in the order they should surface; everything else is "closed".
const OPEN_ORDER: DelegationStatus[] = [
  "blocked",
  "waiting_for_update",
  "revision_requested",
  "in_progress",
  "accepted",
  "requested",
  "delivered",
  "draft",
]
const CLOSED = new Set<DelegationStatus>([
  "accepted_as_complete",
  "declined",
  "reassigned",
  "cancelled",
])

function Item({
  d,
  selected,
  onOpen,
}: {
  d: Delegation
  selected: boolean
  onOpen: () => void
}) {
  const late = isOverdue(d.expected_completion_date) && d.status !== "accepted_as_complete"
  return (
    // role=button (not <button>) so the nested responsible-person link is valid.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className={cn(
        "w-full cursor-pointer rounded-lg border border-slate-100 p-2.5 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none",
        selected && "border-indigo-200 bg-indigo-50 hover:bg-indigo-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="break-words text-sm font-medium text-slate-800">
          {d.requested_outcome}
        </span>
        <PriorityBadge priority={d.priority} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>
          → <RefName kind="people" id={d.responsible_id} />
        </span>
        {d.expected_completion_date && (
          <span className={late ? "font-medium text-red-600" : ""}>
            due <DateText value={d.expected_completion_date} />
          </span>
        )}
        {d.escalation_level > 0 && <span className="text-amber-600">esc {d.escalation_level}</span>}
        {d.acceptance_required && d.status === "delivered" && (
          <span className="font-medium text-amber-600">needs acceptance</span>
        )}
      </div>
    </div>
  )
}

export function DelegationsPage() {
  const navigate = useNavigate()
  const { id: selectedId } = useParams()
  const { data } = delegations.useList()
  const create = delegations.useCreate()
  const [responsible, setResponsible] = useState<string | null>(null)
  const rows = useMemo(() => data ?? [], [data])
  const { filtered, toolbarProps } = useListFilter(
    rows as unknown as Record<string, unknown>[],
    CONFIG,
    "delegations",
  )
  const list = filtered as unknown as Delegation[]

  const groups = OPEN_ORDER.map((s) => ({
    status: s,
    items: list.filter((d) => d.status === s),
  })).filter((g) => g.items.length > 0)
  const closed = list.filter((d) => CLOSED.has(d.status))


  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="space-y-3 lg:w-[28rem] lg:shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900">Delegations</h1>
            <p className="truncate text-sm text-slate-500">Work you've handed off</p>
          </div>
        </div>

        {/* Two fields, because a delegation without a person isn't one — the
            review dashboard already flags `delegated_without_owner`. Better not
            to create the defect than to detect it. Opens the new row, since the
            dates and instructions come next. */}
        <QuickCreate
          placeholder="Delegate an outcome…"
          disabled={!responsible}
          onCreate={(requested_outcome) => {
            if (!responsible) return false
            create.mutate(
              { requested_outcome, responsible_id: responsible, status: "requested" },
              {
                onSuccess: (d: Delegation) => {
                  setResponsible(null)
                  navigate(d.id)
                },
              },
            )
          }}
          extra={
            <div className="w-44 shrink-0">
              <EntityRefField lookup="people" value={responsible} onChange={setResponsible} />
            </div>
          }
        />

        <ListToolbar {...toolbarProps} />

        {rows.length === 0 ? (
          <EmptyState>No delegations yet.</EmptyState>
        ) : list.length === 0 ? (
          <EmptyState>No matches.</EmptyState>
        ) : (
          <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
            {groups.map((g) => (
              <div key={g.status}>
                <div className="mb-1.5 flex items-center gap-2">
                  <StatusBadge status={g.status} />
                  <span className="text-xs text-slate-400">{g.items.length}</span>
                </div>
                <div className="space-y-2">
                  {g.items.map((d) => (
                    <Item
                      key={d.id}
                      d={d}
                      selected={d.id === selectedId}
                      onOpen={() => navigate(d.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {closed.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium tracking-wide text-slate-400 uppercase">
                  Closed
                </div>
                <div className="space-y-2">
                  {closed.map((d) => (
                    <Item
                      key={d.id}
                      d={d}
                      selected={d.id === selectedId}
                      onOpen={() => navigate(d.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
