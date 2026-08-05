import { useState, type ReactNode } from "react"
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react"
import { EntityRef } from "@/components/graph/EntityRef"
import { EntityRefField } from "@/components/graph/EntityRefField"
import { Button, EmptyState, Input } from "@/components/ui/primitives"
import { dayOf, instantToLocalInput, localInputToInstant, nowInstant } from "@/lib/date"
import { formatDate } from "@/lib/utils"
import {
  metrics as metricsCrud,
  useGroupMembers,
  useGroupReadings,
  useRecordReading,
  useSetGroupMembers,
} from "@/services/api/hooks"
import type { Metric, MetricGroup } from "@/services/api/types"

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

/** The group's metrics, in the order the lab reports them. */
function useMembers(group: MetricGroup) {
  const { data: members } = useGroupMembers(group.id)
  const { data: allMetrics } = metricsCrud.useList({ limit: "500" })
  const byId = new Map((allMetrics ?? []).map((m) => [m.id, m as Metric]))
  const ordered = (members ?? [])
    .map((m) => byId.get(m.metric_id))
    .filter((m): m is Metric => !!m)
  return { ordered, memberIds: (members ?? []).map((m) => m.metric_id) }
}

/**
 * A metric's name, linked to its own page — where its full series, reference
 * band and any outcome bound to it live.
 *
 * Deliberately *not* used in `GroupCapture`: a link inside a `<label>` sits on
 * top of the input's own click target, and following it mid-entry would discard
 * the numbers already typed. You navigate from the history, not from the form.
 */
function MetricName({ metric }: { metric: Metric }) {
  return (
    <EntityRef type="metric" id={metric.id}>
      {metric.name}
      {metric.unit && <span className="ml-1 text-xs text-slate-400">{metric.unit}</span>}
    </EntityRef>
  )
}

/** Is this reading outside the band the world calls normal? */
function outOfBand(metric: Metric, value: number): boolean {
  if (metric.reference_min != null && value < metric.reference_min) return true
  if (metric.reference_max != null && value > metric.reference_max) return true
  return false
}

/**
 * Record one act of measuring.
 *
 * One date and one context for the whole thing, then a box per metric. Entering
 * a panel used to be one trip through the entry box *per number*, which is how
 * five values ended up with five timestamps that ought to have been one moment.
 * Blank boxes are simply not recorded: a metabolic panel has come back with one
 * of fourteen, so requiring the full set would fight the data.
 */
export function GroupCapture({ group }: { group: MetricGroup }) {
  const { ordered } = useMembers(group)
  const record = useRecordReading()
  const [open, setOpen] = useState(false)
  // Capture already knows *when* — you are entering something you just measured
  // — so this is prefilled and only touched to back-date an old report.
  const [when, setWhen] = useState(() => instantToLocalInput(nowInstant()))
  const [context, setContext] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})

  const filled = ordered.filter((m) => values[m.id]?.trim())

  function submit() {
    if (filled.length === 0) return
    record.mutate(
      {
        groupId: group.id,
        recorded_at: localInputToInstant(when) ?? nowInstant(),
        context: context.trim() || null,
        values: filled.map((m) => ({ metric_id: m.id, value: Number(values[m.id]) })),
      },
      {
        onSuccess: () => {
          setValues({})
          setContext("")
          setWhen(instantToLocalInput(nowInstant()))
          setOpen(false)
        },
      },
    )
  }

  if (ordered.length === 0) return null

  return (
    <Section
      title="Record a reading"
      action={
        <button
          className="text-xs font-medium text-indigo-600 hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cancel" : "New reading"}
        </button>
      }
    >
      {!open ? (
        <p className="text-sm text-slate-400">
          {ordered.length} {ordered.length === 1 ? "metric" : "metrics"}, recorded as one act.
        </p>
      ) : (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap gap-2">
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-auto"
            />
            <Input
              className="min-w-40 flex-1"
              placeholder="context — fasting, home cuff…"
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ordered.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-600" title={m.name}>
                  {m.name}
                  {m.unit && <span className="ml-1 text-xs text-slate-400">{m.unit}</span>}
                </span>
                <Input
                  type="number"
                  className="w-24"
                  value={values[m.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {filled.length} of {ordered.length} filled — blanks are not recorded.
            </span>
            <Button variant="secondary" disabled={filled.length === 0} onClick={submit}>
              Record
            </Button>
          </div>
        </div>
      )}
    </Section>
  )
}

/**
 * The history, as a lab report reads it: metrics down, readings across.
 *
 * Not readings-down: a hepatic panel is fifteen metrics against five draws, and
 * fifteen columns is unreadable. This is also the orientation the source
 * spreadsheet and every lab PDF already use.
 */
export function GroupReadings({ group }: { group: MetricGroup }) {
  const { ordered } = useMembers(group)
  const { data: readings } = useGroupReadings(group.id)
  const list = readings ?? []

  if (list.length === 0) {
    return (
      <Section title="Readings">
        <EmptyState>No readings yet.</EmptyState>
      </Section>
    )
  }

  const valueAt = (readingIdx: number, metricId: string) =>
    list[readingIdx].entries.find((e) => e.metric_id === metricId)?.value

  return (
    <Section title={`Readings · ${list.length}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-400">
              <th className="py-1 pr-3 text-left font-medium">Metric</th>
              {list.map((r) => (
                <th key={r.id} className="px-2 py-1 text-right font-medium whitespace-nowrap">
                  {formatDate(dayOf(r.recorded_at))}
                  {r.context && (
                    <div className="font-normal text-slate-300">{r.context}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((m) => (
              <tr key={m.id} className="border-b border-slate-50">
                <td className="py-1 pr-3 text-slate-600">
                  <MetricName metric={m} />
                </td>
                {list.map((_, i) => {
                  const v = valueAt(i, m.id)
                  return (
                    <td
                      key={i}
                      className={
                        "px-2 py-1 text-right tabular-nums " +
                        (v == null
                          ? "text-slate-300"
                          : outOfBand(m, v)
                            ? "font-medium text-amber-600"
                            : "text-slate-800")
                      }
                      title={v != null && outOfBand(m, v) ? "Outside the reference band" : undefined}
                    >
                      {v ?? "—"}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

/**
 * What the group contains, and in what order.
 *
 * Modeless like the protocol step list: picking a metric adds it immediately
 * rather than collecting a draft behind a Save button. Reorder is up/down rather
 * than drag — ten rows do not need a drag surface, and the whole list is
 * rewritten either way.
 */
export function GroupMembers({ group }: { group: MetricGroup }) {
  const { ordered, memberIds } = useMembers(group)
  const setMembers = useSetGroupMembers()
  const [adding, setAdding] = useState(false)

  const write = (ids: string[]) => setMembers.mutate({ groupId: group.id, metricIds: ids })

  const move = (from: number, to: number) => {
    if (to < 0 || to >= memberIds.length) return
    const next = [...memberIds]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    write(next)
  }

  return (
    <Section
      title={`Metrics · ${ordered.length}`}
      action={
        <button
          className="flex items-center gap-0.5 text-xs font-medium text-indigo-600 hover:underline"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus size={12} /> Add metric
        </button>
      }
    >
      <div className="space-y-2">
        {ordered.length === 0 ? (
          <EmptyState>Nothing in this group yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-50 text-sm">
            {ordered.map((m, i) => (
              <li key={m.id} className="group/row flex items-center gap-2 py-1">
                <span className="w-6 text-right text-xs text-slate-300">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  <MetricName metric={m} />
                </span>
                <div className="flex opacity-0 transition group-hover/row:opacity-100">
                  <button
                    className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    title="Move down"
                    disabled={i === ordered.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    className="rounded p-1 text-slate-400 hover:text-red-600"
                    title={`Remove ${m.name}`}
                    onClick={() => write(memberIds.filter((id) => id !== m.id))}
                  >
                    <X size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {adding && (
          <EntityRefField
            lookup="metric"
            value={null}
            intent="assign"
            // A metric named while filling a group is measured for whatever the
            // group is about, so it's filed there.
            createDefaults={{ entity_type: group.entity_type, entity_id: group.entity_id }}
            onChange={(id) => {
              if (id && !memberIds.includes(id)) write([...memberIds, id])
              setAdding(false)
            }}
          />
        )}
      </div>
    </Section>
  )
}
