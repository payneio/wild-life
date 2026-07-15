import { useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { Plus } from "lucide-react"
import { EntityForm, type FieldSpec } from "@/components/EntityForm"
import { DateText, PriorityBadge, RefName, StatusBadge } from "@/components/cells"
import { Button, Card, EmptyState, Modal } from "@/components/ui/primitives"
import { isOverdue } from "@/lib/format"
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

const FIELDS: FieldSpec[] = [
  { name: "requested_outcome", label: "Requested outcome", type: "textarea", full: true },
  { name: "responsible_id", label: "Responsible", type: "entity", lookup: "people" },
  { name: "accountable_owner_id", label: "Accountable", type: "entity", lookup: "people" },
  { name: "status", label: "Status", type: "select", options: DELEGATION_STATUS },
  { name: "priority", label: "Priority", type: "select", options: ["low", "medium", "high", "urgent"] },
  { name: "date_delegated", label: "Delegated on", type: "date" },
  { name: "expected_completion_date", label: "Expected", type: "date" },
  { name: "follow_up_date", label: "Follow up", type: "date" },
  { name: "acceptance_required", label: "Requires acceptance", type: "checkbox" },
  { name: "escalation_level", label: "Escalation", type: "number" },
  { name: "instructions", label: "Instructions", type: "textarea", full: true },
  { name: "latest_update", label: "Latest update", type: "textarea", full: true },
  { name: "last_contact_date", label: "Last contact", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

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

function Item({ d, onEdit }: { d: Delegation; onEdit: (d: Delegation) => void }) {
  const late = isOverdue(d.expected_completion_date) && d.status !== "accepted_as_complete"
  return (
    <button
      onClick={() => onEdit(d)}
      className="w-full rounded-lg border border-slate-100 p-3 text-left hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">{d.requested_outcome}</span>
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
        {d.follow_up_date && (
          <span>
            follow-up <DateText value={d.follow_up_date} overdue />
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
  const { data } = delegations.useList()
  const create = delegations.useCreate()
  const [creating, setCreating] = useState(false)
  const rows = data ?? []

  const groups = OPEN_ORDER.map((s) => ({
    status: s,
    items: rows.filter((d) => d.status === s),
  })).filter((g) => g.items.length > 0)
  const closed = rows.filter(
    (d) => !OPEN_ORDER.includes(d.status) && d.status !== "accepted_as_complete",
  )
  const complete = rows.filter((d) => d.status === "accepted_as_complete")

  function submit(body: Body) {
    create.mutate(body)
    setCreating(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Delegations</h1>
          <p className="text-sm text-slate-500">Work you've handed off — oversight without doing it yourself</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} />
          New delegation
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No delegations yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.status}>
              <div className="mb-1.5 flex items-center gap-2">
                <StatusBadge status={g.status} />
                <span className="text-xs text-slate-400">{g.items.length}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.items.map((d) => (
                  <Item key={d.id} d={d} onEdit={(x) => navigate(x.id)} />
                ))}
              </div>
            </div>
          ))}
          {(closed.length > 0 || complete.length > 0) && (
            <Card className="p-3 text-sm text-slate-500">
              {complete.length} completed · {closed.length} closed
            </Card>
          )}
        </div>
      )}

      {creating && (
        <Modal title="New delegation" onClose={() => setCreating(false)}>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <EntityForm
              fields={FIELDS}
              onSubmit={submit}
              onCancel={() => setCreating(false)}
            />
          </div>
        </Modal>
      )}

      <Outlet />
    </div>
  )
}
