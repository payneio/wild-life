import { useMemo } from "react"
import { RRule } from "rrule"
import { Input } from "@/components/ui/primitives"
import { Segmented } from "@/components/detail/kit"
import { cn } from "@/lib/utils"

// A compact RRULE builder over the plain `recurrence` string stored on Event
// (e.g. "FREQ=WEEKLY;BYDAY=MO,WE"). Builds/parses the string by hand for
// predictability; uses rrule only for the human summary.

const FREQS = [
  { value: "none", label: "No repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
] as const

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]
const UNIT: Record<string, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
}

type EndMode = "never" | "on" | "after"
interface State {
  freq: string
  interval: number
  byday: string[]
  endMode: EndMode
  until: string // yyyy-mm-dd
  count: string
}

function parse(rrule: string): State {
  const map: Record<string, string> = {}
  for (const part of (rrule || "").split(";")) {
    const [k, v] = part.split("=")
    if (k) map[k.toUpperCase()] = v
  }
  const freq = map.FREQ && UNIT[map.FREQ] ? map.FREQ : "none"
  return {
    freq,
    interval: Math.max(1, Number(map.INTERVAL || 1)),
    byday: map.BYDAY ? map.BYDAY.split(",") : [],
    endMode: map.UNTIL ? "on" : map.COUNT ? "after" : "never",
    until: map.UNTIL ? `${map.UNTIL.slice(0, 4)}-${map.UNTIL.slice(4, 6)}-${map.UNTIL.slice(6, 8)}` : "",
    count: map.COUNT || "",
  }
}

function build(s: State): string | null {
  if (s.freq === "none") return null
  const parts = [`FREQ=${s.freq}`]
  if (s.interval > 1) parts.push(`INTERVAL=${s.interval}`)
  if (s.freq === "WEEKLY" && s.byday.length) parts.push(`BYDAY=${s.byday.join(",")}`)
  if (s.endMode === "on" && s.until) parts.push(`UNTIL=${s.until.replace(/-/g, "")}T235959Z`)
  if (s.endMode === "after" && Number(s.count) > 0) parts.push(`COUNT=${Number(s.count)}`)
  return parts.join(";")
}

export function summarizeRecurrence(rrule: string | null | undefined): string {
  if (!rrule) return "Does not repeat"
  try {
    const text = RRule.fromString(`RRULE:${rrule}`).toText()
    return text.charAt(0).toUpperCase() + text.slice(1)
  } catch {
    return "Repeats"
  }
}

export function RecurrenceEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (rrule: string) => void
}) {
  const s = useMemo(() => parse(value), [value])
  const update = (patch: Partial<State>) => onChange(build({ ...s, ...patch }) ?? "")

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-surface-2 p-3">
      <Segmented
        options={FREQS.map((f) => ({ value: f.value, label: f.label }))}
        value={s.freq}
        onChange={(v) => update({ freq: v })}
      />

      {s.freq !== "none" && (
        <>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Every</span>
            <Input
              type="number"
              className="w-16"
              value={String(s.interval)}
              onChange={(e) => update({ interval: Math.max(1, Number(e.target.value)) })}
            />
            <span>{UNIT[s.freq]}{s.interval > 1 ? "s" : ""}</span>
          </div>

          {s.freq === "WEEKLY" && (
            <div className="flex gap-1">
              {WEEKDAYS.map((wd, i) => {
                const on = s.byday.includes(wd)
                return (
                  <button
                    key={wd}
                    type="button"
                    onClick={() =>
                      update({
                        byday: on ? s.byday.filter((d) => d !== wd) : [...s.byday, wd],
                      })
                    }
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition",
                      on
                        ? "bg-indigo-600 text-on-accent"
                        : "bg-surface text-slate-500 hover:bg-slate-100",
                    )}
                  >
                    {WEEKDAY_LABELS[i]}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>Ends</span>
            <Segmented
              options={[
                { value: "never", label: "Never" },
                { value: "on", label: "On date" },
                { value: "after", label: "After" },
              ]}
              value={s.endMode}
              onChange={(v) => update({ endMode: v as EndMode })}
            />
            {s.endMode === "on" && (
              <Input
                type="date"
                className="w-40"
                value={s.until}
                onChange={(e) => update({ until: e.target.value })}
              />
            )}
            {s.endMode === "after" && (
              <span className="flex items-center gap-1">
                <Input
                  type="number"
                  className="w-16"
                  value={s.count}
                  onChange={(e) => update({ count: e.target.value })}
                />
                <span>times</span>
              </span>
            )}
          </div>

          <div className="text-xs text-slate-400">{summarizeRecurrence(build(s))}</div>
        </>
      )}
    </div>
  )
}
