import { WEEKDAYS } from "@/lib/slots"
import { NO_REPEAT, type Repeat } from "@/lib/repeat"

/**
 * How often, in our own vocabulary.
 *
 * Deliberately not an RRULE editor. Rules are ours and iCal lives at the edge
 * (decision 8): this asks the question a person asks — which days, how often,
 * until when — and the wire form is generated from it when the occasion is
 * shared. Authoring RRULE here would put the edge in the middle.
 *
 * Everything it can express round-trips through `to_rrule`/`translate`, which is
 * what lets a guest's calendar agree with ours about what was scheduled.
 */
export function RepeatPicker({
  value,
  onChange,
}: {
  value: Repeat
  onChange: (r: Repeat) => void
}) {
  const on = value.everyWeeks > 0
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onChange(on ? NO_REPEAT : { ...value, everyWeeks: 1 })}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
          on ? "bg-indigo-600 text-on-accent" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
      >
        {on ? "Repeats" : "Does not repeat"}
      </button>

      {on && (
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2">
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((d) => {
              const picked = value.days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={picked}
                  onClick={() =>
                    onChange({
                      ...value,
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
          <label className="flex items-center gap-2 text-xs text-slate-500">
            every
            <select
              value={value.everyWeeks}
              onChange={(e) => onChange({ ...value, everyWeeks: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 bg-surface px-2 py-1 text-xs"
            >
              <option value={1}>week</option>
              <option value={2}>other week</option>
              <option value={3}>3 weeks</option>
              <option value={4}>4 weeks</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            until
            <input
              type="date"
              value={value.until}
              onChange={(e) => onChange({ ...value, until: e.target.value })}
              className="rounded-lg border border-slate-300 bg-surface px-2 py-1 text-xs"
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
