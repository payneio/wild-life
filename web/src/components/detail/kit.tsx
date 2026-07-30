import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"
import { daysFromToday, shiftDays } from "@/components/detail/dates"
import { localDay } from "@/lib/format"
import { compareInstants, dayRange } from "@/lib/date"
import type { CalendarDay, Instant } from "@/lib/date"

/** Shared building blocks for the bespoke entity detail views. All colors go
 *  through the token layer (slate/indigo remap), so everything is theme-aware. */

// --- section ----------------------------------------------------------------
export function Section({
  title,
  action,
  children,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && (
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// --- stat tile --------------------------------------------------------------
export function StatTile({
  value,
  label,
  tone = "default",
}: {
  value: ReactNode
  label: string
  tone?: "default" | "danger" | "good" | "muted"
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-surface px-3 py-2.5">
      <div
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "danger" && "text-red-600",
          tone === "good" && "text-emerald-600",
          tone === "muted" && "text-slate-400",
          tone === "default" && "text-slate-900",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </div>
  )
}

/** A stat tile showing whole days until a future date (or "over" if past). */
export function DeltaTile({
  date,
  futureLabel = "days left",
  pastLabel = "days over",
}: {
  date: CalendarDay | Instant | null | undefined
  futureLabel?: string
  pastLabel?: string
}) {
  const d = daysFromToday(date)
  if (d === null) return null
  return (
    <StatTile
      value={Math.abs(d)}
      label={d < 0 ? pastLabel : futureLabel}
      tone={d < 0 ? "danger" : "default"}
    />
  )
}

/** A stat tile showing how many days have elapsed since a past date. */
export function AgeTile({
  date,
  label = "days",
}: {
  date: CalendarDay | Instant | null | undefined
  label?: string
}) {
  const d = daysFromToday(date)
  if (d === null) return null
  return <StatTile value={Math.abs(d)} label={label} />
}

// --- progress ring ----------------------------------------------------------
export function ProgressRing({
  value,
  size = 76,
  stroke = 7,
  children,
}: {
  value: number
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(100, Math.max(0, value))
  const offset = c * (1 - pct / 100)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-slate-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="text-indigo-600 transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  )
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-indigo-500 transition-[width] duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// --- segmented control ------------------------------------------------------
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T | null | undefined
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition",
            value === o.value
              ? "bg-indigo-600 text-on-accent"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// --- quick schedule chips ---------------------------------------------------
export function ScheduleChips({
  value,
  onSet,
}: {
  value: CalendarDay | Instant | null | undefined
  onSet: (iso: CalendarDay | null) => void
}) {
  const presets: [string, number][] = [
    ["Today", 0],
    ["Tomorrow", 1],
    ["+1 wk", 7],
  ]
  // `asDay`, not a slice: both callers happen to pass a bare day today, so the
  // slice was a no-op — but nothing in the old `string` type stopped an instant
  // arriving, and then it would have chipped off the UTC day.
  const cur = value ? localDay(value) : null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map(([label, n]) => {
        const iso = shiftDays(n)
        const active = cur === iso
        return (
          <button
            key={label}
            onClick={() => onSet(iso)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition",
              active
                ? "bg-indigo-600 text-on-accent"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {label}
          </button>
        )
      })}
      <input
        type="date"
        value={cur ?? ""}
        onChange={(e) => onSet(e.target.value ? localDay(e.target.value) : null)}
        className="rounded-lg border border-slate-200 bg-surface px-2 py-1 text-xs text-slate-600"
      />
      {cur && (
        <button
          onClick={() => onSet(null)}
          className="text-xs text-slate-400 hover:text-red-600"
        >
          clear
        </button>
      )}
    </div>
  )
}

// --- days-remaining badge ---------------------------------------------------
export function DaysBadge({
  date,
  label,
}: {
  date: CalendarDay | Instant | null | undefined
  label?: string
}) {
  const d = daysFromToday(date)
  if (d === null) return null
  const text =
    d === 0 ? "today" : d > 0 ? `in ${d}d` : `${Math.abs(d)}d overdue`
  const tone = d < 0 ? "danger" : d <= 2 ? "warn" : "default"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "danger" && "bg-red-100 text-red-700",
        tone === "warn" && "bg-amber-100 text-amber-700",
        tone === "default" && "bg-slate-100 text-slate-600",
      )}
    >
      {label && <span className="font-normal opacity-70">{label}</span>}
      {text}
    </span>
  )
}

// --- related row ------------------------------------------------------------
export function RelatedRow({
  to,
  title,
  badge,
  meta,
}: {
  to?: string
  title: ReactNode
  badge?: ReactNode
  meta?: ReactNode
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 break-words text-sm text-slate-700">{title}</span>
      <span className="flex shrink-0 items-center gap-2">
        {badge}
        {meta && <span className="text-xs text-slate-400">{meta}</span>}
      </span>
    </>
  )
  const cls =
    "flex items-center gap-2 rounded-lg border border-slate-100 bg-surface px-3 py-2 transition hover:border-slate-200 hover:bg-slate-50"
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

// --- vertical timeline ------------------------------------------------------
export type TimelineItem = {
  key: string
  date: CalendarDay | Instant | null
  title: ReactNode
  meta?: ReactNode
  to?: string
  tone?: "default" | "accent" | "good" | "danger"
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-4">
      {items.map((it) => {
        const dot =
          it.tone === "good"
            ? "bg-emerald-500"
            : it.tone === "danger"
              ? "bg-red-500"
              : it.tone === "accent"
                ? "bg-indigo-500"
                : "bg-slate-300"
        const body = (
          <>
            <span
              className={cn(
                "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface",
                dot,
              )}
            />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">{it.title}</span>
              {it.date && (
                <span className="shrink-0 text-xs text-slate-400">
                  {new Date(`${localDay(it.date)}T00:00:00`).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                </span>
              )}
            </div>
            {it.meta && <div className="text-xs text-slate-500">{it.meta}</div>}
          </>
        )
        return (
          <li key={it.key} className="relative">
            {it.to ? (
              <Link to={it.to} className="block rounded-md hover:bg-slate-50">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        )
      })}
    </ol>
  )
}

// --- consistency heatmap ----------------------------------------------------
/** GitHub-style grid of the last `weeks` weeks. `levels` maps local day → 0-3. */
export function Heatmap({
  levels,
  weeks = 13,
}: {
  levels: Map<CalendarDay, number>
  weeks?: number
}) {
  // End on today; walk back to fill full weeks, aligned so last column is this
  // week. Calendar arithmetic rather than ±86,400,000ms: the two days a year
  // that aren't 24 hours long would otherwise slide a column.
  const total = weeks * 7
  const cells = dayRange(shiftDays(-(total - 1)), total).map((date) => ({
    date,
    level: levels.get(date) ?? 0,
  }))
  const cols: { date: CalendarDay; level: number }[][] = []
  for (let w = 0; w < weeks; w++) cols.push(cells.slice(w * 7, w * 7 + 7))
  const tint = ["bg-slate-100", "bg-indigo-200", "bg-indigo-400", "bg-indigo-600"]
  return (
    <div className="flex gap-1 overflow-x-auto">
      {cols.map((col, i) => (
        <div key={i} className="flex flex-col gap-1">
          {col.map((c) => (
            <span
              key={c.date}
              title={`${c.date}${c.level ? " · logged" : ""}`}
              className={cn("h-2.5 w-2.5 rounded-[3px]", tint[Math.min(3, c.level)])}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// --- metric sparkline -------------------------------------------------------
/** Value-over-time polyline for a metric's entries. One implementation, because
 *  two of these had already drifted apart in size and padding — and would have
 *  drifted again the next time the entry's time field was renamed. Points are
 *  evenly spaced by rank, not by elapsed time: this is a shape, not a chart. */
export function Sparkline({
  entries,
  width = 240,
  height = 40,
  pad = 0,
}: {
  entries: { value: number; recorded_at: Instant }[]
  width?: number
  height?: number
  pad?: number
}) {
  if (entries.length < 2) return null
  const sorted = [...entries].sort((a, b) => compareInstants(a.recorded_at, b.recorded_at))
  const vals = sorted.map((e) => e.value)
  const min = Math.min(...vals)
  const span = Math.max(...vals) - min || 1
  const points = sorted
    .map((e, i) => {
      const x = (i / (sorted.length - 1)) * width
      const y = height - ((e.value - min) / span) * (height - pad * 2) - pad
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      className="text-indigo-500"
      preserveAspectRatio="none"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}
