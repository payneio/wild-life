import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"
import { daysFromToday, shiftDays, todayISO } from "@/components/detail/dates"

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
  value: string | null | undefined
  onSet: (iso: string | null) => void
}) {
  const presets: [string, number][] = [
    ["Today", 0],
    ["Tomorrow", 1],
    ["+1 wk", 7],
  ]
  const cur = value?.slice(0, 10) ?? null
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
        onChange={(e) => onSet(e.target.value || null)}
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
  date: string | null | undefined
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
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{title}</span>
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
  date: string | null
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
                  {new Date(`${it.date.slice(0, 10)}T00:00:00`).toLocaleDateString(
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
/** GitHub-style grid of the last `weeks` weeks. `levels` maps ISO date → 0-3. */
export function Heatmap({
  levels,
  weeks = 13,
}: {
  levels: Map<string, number>
  weeks?: number
}) {
  const cells: { date: string; level: number }[] = []
  // End on today; walk back to fill full weeks, aligned so last column is this week.
  const today = new Date(`${todayISO()}T00:00:00`)
  const total = weeks * 7
  for (let i = total - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const iso = d.toISOString().slice(0, 10)
    cells.push({ date: iso, level: levels.get(iso) ?? 0 })
  }
  const cols: { date: string; level: number }[][] = []
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
