import { WEEKDAYS } from "@/lib/slots"
import { NO_REPEAT, type Repeat, type RepeatMode } from "@/lib/repeat"

/**
 * How often, in our own vocabulary.
 *
 * Deliberately not an RRULE editor. Rules are ours and iCal lives at the edge
 * (decision 8): this asks the question a person asks — how often, which days,
 * until when — and the wire form is generated from it when the occasion is
 * shared. Authoring RRULE here would put the edge in the middle.
 *
 * Everything it can express round-trips through `to_rrule`/`translate`, which is
 * what lets a guest's calendar agree with ours about what was scheduled.
 */
const MODES: { value: RepeatMode; label: string }[] = [
  { value: "none", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
]

const NTH: { value: number | null; label: string }[] = [
  { value: 1, label: "first" },
  { value: 2, label: "second" },
  { value: 3, label: "third" },
  { value: 4, label: "fourth" },
  { value: -1, label: "last" },
  { value: null, label: "on the date" },
]

export function RepeatPicker({
  value,
  onChange,
  start,
}: {
  value: Repeat
  onChange: (r: Repeat) => void
  /** The day dragged onto — a monthly or yearly cadence takes its position
   *  from it, the way a bare FREQ=YEARLY takes month and day from DTSTART. */
  start: Date
}) {
  const set = (patch: Partial<Repeat>) => onChange({ ...value, ...patch })
  const weekdayName = start.toLocaleDateString(undefined, { weekday: "long" })
  const monthDay = start.toLocaleDateString(undefined, { day: "numeric", month: "long" })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {MODES.map((m) => {
          const on = value.mode === m.value
          return (
            <button
              key={m.value}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(m.value === "none" ? NO_REPEAT : { ...value, mode: m.value })
              }
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                on
                  ? "bg-indigo-600 text-on-accent"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {value.mode !== "none" && (
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2 text-xs text-slate-500">
          {value.mode === "daily" && (
            <label className="flex items-center gap-2">
              every
              <input
                type="number"
                min={1}
                max={365}
                value={value.every}
                onChange={(e) => set({ every: Number(e.target.value) || 1 })}
                className="w-16 rounded-lg border border-slate-300 bg-surface px-2 py-1"
              />
              days
            </label>
          )}

          {value.mode === "weekly" && (
            <>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d) => {
                  const picked = value.days.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={picked}
                      onClick={() =>
                        set({
                          days: picked
                            ? value.days.filter((x) => x !== d)
                            : [...value.days, d],
                        })
                      }
                      className={`w-9 rounded px-1 py-1 text-[11px] capitalize transition ${
                        picked
                          ? "bg-indigo-600 text-on-accent"
                          : "bg-surface text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {d.slice(0, 2)}
                    </button>
                  )
                })}
              </div>
              <label className="flex items-center gap-2">
                every
                <select
                  value={value.every}
                  onChange={(e) => set({ every: Number(e.target.value) })}
                  className="rounded-lg border border-slate-300 bg-surface px-2 py-1"
                >
                  <option value={1}>week</option>
                  <option value={2}>other week</option>
                  <option value={3}>3 weeks</option>
                  <option value={4}>4 weeks</option>
                </select>
              </label>
            </>
          )}

          {value.mode === "monthly" && (
            <label className="flex flex-wrap items-center gap-2">
              the
              <select
                value={value.weekOfMonth === null ? "date" : String(value.weekOfMonth)}
                onChange={(e) =>
                  set({
                    weekOfMonth: e.target.value === "date" ? null : Number(e.target.value),
                  })
                }
                className="rounded-lg border border-slate-300 bg-surface px-2 py-1"
              >
                {NTH.map((n) => (
                  <option key={String(n.value)} value={n.value === null ? "date" : n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
              {value.weekOfMonth === null ? `${start.getDate()} of each month` : weekdayName}
            </label>
          )}

          {value.mode === "yearly" && (
            <p>
              Every {monthDay}. Good for a birthday or a holiday that keeps its date.
            </p>
          )}

          <label className="flex items-center gap-2">
            until
            <input
              type="date"
              value={value.until}
              onChange={(e) => set({ until: e.target.value })}
              className="rounded-lg border border-slate-300 bg-surface px-2 py-1"
            />
            {/* An end you cannot see is an end that surprises you, so it is
                asked for rather than left implicit. Blank means open-ended. */}
            <span className="text-slate-300">optional</span>
          </label>
        </div>
      )}
    </div>
  )
}
