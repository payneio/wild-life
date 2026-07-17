import { useMemo, useState } from "react"
import { Outlet, useNavigate, useParams } from "react-router-dom"
import { Plus } from "lucide-react"
import { EntityForm } from "@/components/EntityForm"
import { DELEGATION_FIELDS } from "@/services/api/registry"
import { ListToolbar } from "@/components/ListToolbar"
import { DateText, PriorityBadge, RefName, StatusBadge } from "@/components/cells"
import { Button, EmptyState, Modal } from "@/components/ui/primitives"
import { useListFilter, type ListConfig } from "@/lib/listFilter"
import { isOverdue } from "@/lib/format"
import { cn } from "@/lib/utils"
import { delegations } from "@/services/api/hooks"
import type { Body } from "@/services/api/crud"
import type { Delegation, DelegationStatus } from "@/services/api/types"

const DELEGATION_STATUS: DelegationStatus[] = [
  "draft",
  "requested",
  "accepted",
  "in_progress",
  "waiting_for_update",
  "blocked",
  "delivered",
  "revision_requested",
  "accepted_as_complete",
  "declined",
  "reassigned",
  "cancelled",
]
const PRIORITIES = ["low", "medium", "high", "urgent"] as const

const FIELDS = DELEGATION_FIELDS

const CONFIG: ListConfig = {
  searchKeys: ["requested_outcome", "instructions", "latest_update", "notes"],
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
    <button
      onClick={onOpen}
      className={cn(
        "w-full rounded-lg border border-slate-100 p-2.5 text-left hover:bg-slate-50",
        selected && "border-indigo-200 bg-indigo-50 hover:bg-indigo-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium text-slate-800">
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
    </button>
  )
}

export function DelegationsPage() {
  const navigate = useNavigate()
  const { id: selectedId } = useParams()
  const { data } = delegations.useList()
  const create = delegations.useCreate()
  const [creating, setCreating] = useState(false)
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

  function submit(body: Body) {
    create.mutate(body)
    setCreating(false)
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="space-y-3 lg:w-[28rem] lg:shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900">Delegations</h1>
            <p className="truncate text-sm text-slate-500">Work you've handed off</p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            New
          </Button>
        </div>

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

      {!selectedId && (
        <div className="hidden flex-1 lg:block">
          <EmptyState>Select a delegation to see its details.</EmptyState>
        </div>
      )}
      <Outlet />

      {creating && (
        <Modal title="New delegation" onClose={() => setCreating(false)}>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <EntityForm fields={FIELDS} onSubmit={submit} onCancel={() => setCreating(false)} />
          </div>
        </Modal>
      )}
    </div>
  )
}
