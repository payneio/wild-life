import { useMemo } from "react"
import { Card, EmptyState, Select } from "@/components/ui/primitives"
import { EntityRef } from "@/components/graph/EntityRef"
import { humanize } from "@/lib/format"
import { usePersistentState } from "@/lib/persistentState"
import { cn } from "@/lib/utils"
import { useHistory, type ChangeAction, type ChangeLog } from "@/services/api/history"
import type { EntityType } from "@/services/api/types"

// change_log.entity_type is the DB __tablename__ (plural). Map the tables that
// have a detail route to their EntityType; child/link tables (interactions,
// affiliations, metric_entries, …) are absent, so their labels stay plain text.
const TABLE_TO_TYPE: Record<string, EntityType> = {
  tasks: "task",
  projects: "project",
  areas: "area",
  programs: "program",
  goals: "goal",
  metrics: "metric",
  routines: "routine",
  events: "event",
  notes: "note",
  people: "person",
  organizations: "organization",
  locations: "location",
  commitments: "commitment",
  waiting_items: "waiting_item",
  delegations: "delegation",
  resources: "resource",
  decisions: "decision",
  conditions: "condition",
  medications: "medication",
  protocols: "protocol",
  health_events: "health_event",
  insurance_plans: "insurance_plan",
  allergies: "allergy",
}

const ACTION_META: Record<ChangeAction, { label: string; className: string }> = {
  insert: { label: "Created", className: "bg-emerald-100 text-emerald-700" },
  update: { label: "Updated", className: "bg-indigo-100 text-indigo-700" },
  delete: { label: "Deleted", className: "bg-red-100 text-red-700" },
}

// Fields that carry no signal in a change feed.
const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at"])

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  if (Array.isArray(v)) return v.length ? v.map(formatValue).join(", ") : "—"
  if (typeof v === "object") return JSON.stringify(v)
  if (typeof v === "boolean") return v ? "yes" : "no"
  const s = String(v)
  return s.length > 100 ? `${s.slice(0, 100)}…` : s
}

type FieldDiff = { field: string; old: unknown; next: unknown }

function isDiff(v: unknown): v is { old: unknown; new: unknown } {
  return typeof v === "object" && v !== null && "old" in v && "new" in v
}

function diffFields(changes: ChangeLog["changes"]): FieldDiff[] {
  const out: FieldDiff[] = []
  for (const [field, v] of Object.entries(changes)) {
    if (HIDDEN_FIELDS.has(field)) continue
    if (isDiff(v)) out.push({ field, old: v.old, next: v.new })
  }
  return out
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function ChangeRow({ change }: { change: ChangeLog }) {
  const meta = ACTION_META[change.action]
  const diffs = change.action === "update" ? diffFields(change.changes) : []
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-slate-400">
        {timeLabel(change.created_at)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              meta.className,
            )}
          >
            {meta.label}
          </span>
          <span className="text-slate-400">{humanize(change.entity_type)}</span>
          {(() => {
            const label = change.entity_label || "(untitled)"
            const type = TABLE_TO_TYPE[change.entity_type]
            // Deleted rows point at a now-gone entity → keep them plain.
            if (type && change.entity_id && change.action !== "delete") {
              return (
                <EntityRef
                  type={type}
                  id={change.entity_id}
                  className="font-medium text-slate-800"
                >
                  {label}
                </EntityRef>
              )
            }
            return <span className="font-medium text-slate-800">{label}</span>
          })()}
        </div>
        {diffs.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {diffs.map((d) => (
              <li key={d.field} className="text-xs text-slate-500">
                <span className="text-slate-400">{humanize(d.field)}:</span>{" "}
                <span className="text-slate-400 line-through">{formatValue(d.old)}</span>{" "}
                <span className="text-slate-400">→</span>{" "}
                <span className="text-slate-700">{formatValue(d.next)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function HistoryPage() {
  const { data, isLoading, isError } = useHistory(200)
  const [action, setAction] = usePersistentState<ChangeAction | "all">("history:action", "all")
  const [entityType, setEntityType] = usePersistentState<string>("history:entityType", "all")

  const entityTypes = useMemo(() => {
    const set = new Set((data ?? []).map((c) => c.entity_type))
    return [...set].sort()
  }, [data])

  const filtered = useMemo(() => {
    return (data ?? []).filter(
      (c) =>
        (action === "all" || c.action === action) &&
        (entityType === "all" || c.entity_type === entityType),
    )
  }, [data, action, entityType])

  const groups = useMemo(() => {
    const map = new Map<string, ChangeLog[]>()
    for (const c of filtered) {
      const day = dayLabel(c.created_at)
      const bucket = map.get(day)
      if (bucket) bucket.push(c)
      else map.set(day, [c])
    }
    return [...map.entries()]
  }, [filtered])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">History</h1>
          <p className="text-sm text-slate-500">Every change across your data, newest first</p>
        </div>
        <div className="flex gap-2">
          <Select
            value={action}
            onChange={(e) => setAction(e.target.value as ChangeAction | "all")}
            className="w-36"
          >
            <option value="all">All actions</option>
            <option value="insert">Created</option>
            <option value="update">Updated</option>
            <option value="delete">Deleted</option>
          </Select>
          <Select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="w-40"
          >
            <option value="all">All types</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading && <EmptyState>Loading…</EmptyState>}
      {isError && <EmptyState>Couldn’t load history.</EmptyState>}
      {!isLoading && !isError && groups.length === 0 && (
        <EmptyState>No changes recorded yet.</EmptyState>
      )}

      {groups.map(([day, changes]) => (
        <div key={day} className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {day}
          </div>
          <Card className="divide-y divide-slate-100">
            {changes.map((c) => (
              <ChangeRow key={c.id} change={c} />
            ))}
          </Card>
        </div>
      ))}
    </div>
  )
}
