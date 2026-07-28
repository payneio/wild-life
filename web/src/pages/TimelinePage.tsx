import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { EmptyState } from "@/components/ui/primitives"
import { apiClient } from "@/services/api/client"
import { useQuery } from "@tanstack/react-query"
import { FAMILIES, FAMILY_OF, KIND_LABEL, sourceRoute, whenOf } from "@/lib/moments"
import type { KindFamily } from "@/lib/moments"
import type { Moment, MomentKind } from "@/services/api/types"

interface DensityRow {
  year: number
  month: number
  kind: MomentKind
  count: number
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Presence, at the smallest size that can still be seen.
 *
 *  The bars are drawn at true relative scale, which is the point — 1997's five
 *  entries against 2026's fifteen hundred is the honest shape of a record that
 *  begins as a whisper. At true scale, though, five of fifteen hundred is a third
 *  of a pixel, and "a little" would render as "nothing". That is the one
 *  distinction on this page worth protecting, so length carries volume and this
 *  floor carries presence. */
const FLOOR_PCT = 0.7

type Totals = Record<KindFamily, number>

const zero = (): Totals => ({ writing: 0, places: 0, body: 0, work: 0 })
const sum = (t: Totals) => t.writing + t.places + t.body + t.work

/** The stratum: one span of time, and what it was made of. */
function Band({ totals, max, height }: { totals: Totals; max: number; height: number }) {
  const total = sum(totals)
  if (total === 0) return null
  const width = Math.max(FLOOR_PCT, (total / max) * 100)
  return (
    <span
      className="flex overflow-hidden rounded-[1px]"
      style={{ width: `${width}%`, height }}
      aria-hidden
    >
      {FAMILIES.map(({ key, color }) =>
        totals[key] > 0 ? (
          <span
            key={key}
            style={{ background: color, flexGrow: totals[key], flexBasis: 0 }}
          />
        ) : null,
      )}
    </span>
  )
}

/**
 * A year's twelve months, scaled against **that year's busiest month**.
 *
 * Not against the thirty-year maximum: 2026 holds ten times what 2025 does, so a
 * shared scale flattened every month of every other year into an identical
 * hairline and the strip said nothing at all. Each year is asked its own
 * question — when *in this year* did things happen — and the bars above already
 * carry the comparison between years.
 */
function MonthStrip({ year, byMonth }: { year: number; byMonth: Map<string, Totals> }) {
  const months = MONTHS.map((label, i) => ({
    label,
    totals: byMonth.get(`${year}-${i + 1}`) ?? zero(),
  }))
  const peak = Math.max(1, ...months.map((m) => sum(m.totals)))
  return (
    <div className="flex items-end gap-1">
      {months.map(({ label, totals }) => {
        const n = sum(totals)
        return (
          <div key={label} className="flex flex-1 flex-col items-stretch gap-1">
            <div className="flex h-10 items-end" title={`${label} · ${n}`}>
              {n > 0 ? (
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-[1px]"
                  style={{ height: `${Math.max(6, (n / peak) * 100)}%` }}
                >
                  {FAMILIES.map(({ key, color }) =>
                    totals[key] > 0 ? (
                      <div
                        key={key}
                        style={{ background: color, flexGrow: totals[key], flexBasis: 0 }}
                      />
                    ) : null,
                  )}
                </div>
              ) : (
                <div className="h-px w-full bg-slate-200" />
              )}
            </div>
            <span
              className={`text-center text-[9px] uppercase ${n > 0 ? "text-slate-400" : "text-slate-300"}`}
            >
              {label[0]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function useDensity() {
  return useQuery({
    queryKey: ["moments", "density"],
    queryFn: () => apiClient.get<DensityRow[]>("/moments/density"),
    staleTime: 60_000,
  })
}

/** One year's moments, fetched only once its stratum is opened. */
function useYear(year: number | null) {
  return useQuery({
    queryKey: ["moments", "year-stream", year],
    queryFn: () =>
      apiClient.get<Moment[]>("/moments", {
        since: `${year}-01-01T00:00:00Z`,
        until: `${year}-12-31T23:59:59Z`,
        limit: "500",
      }),
    enabled: year !== null,
  })
}

function Entry({ moment }: { moment: Moment }) {
  const when = whenOf(moment)
  const to = sourceRoute(moment) ?? `/moments/${moment.id}`
  const day = when ? new Date(when) : null
  return (
    <Link
      to={to}
      className="group grid grid-cols-[3.25rem_0.4rem_1fr] items-baseline gap-x-3 py-1.5 text-sm"
    >
      <span className="font-display text-right text-xs tabular-nums text-slate-400">
        {day ? `${day.getDate()} ${MONTHS[day.getMonth()]}` : "—"}
      </span>
      <span
        className="mt-1.5 h-1.5 w-1.5 rounded-full"
        style={{ background: FAMILIES.find((f) => f.key === FAMILY_OF[moment.kind])!.color }}
        aria-hidden
      />
      <span className="min-w-0 truncate text-slate-700 group-hover:text-slate-900">
        {moment.title || moment.body?.slice(0, 90) || KIND_LABEL[moment.kind]}
      </span>
    </Link>
  )
}

/**
 * The recorded life, read downward like a core sample.
 *
 * Every year between the first entry and the last gets a line, **including the
 * eleven that hold nothing**. Those voids are the most informative thing on the
 * page: a timeline that listed only the years with data would quietly close the
 * gaps and imply a continuous record, when the truth is a thin thread of journal
 * entries reaching back to 1997 and thickening abruptly once there was software
 * to catch it.
 *
 * So the bars are true to scale and the empty years are drawn as empty. What the
 * page says is *what was written down*, not what was lived — which is why the
 * count is labelled "recorded".
 */
export function TimelinePage() {
  const { data, isLoading } = useDensity()
  const [open, setOpen] = useState<number | null>(null)
  // The legend is the filter. Everything is on by default, because deciding for
  // someone which parts of their life count is not a default to ship — but a
  // year of task completions can bury a year of writing, and "show me the
  // writing" is the question this page most wants to answer.
  const [shown, setShown] = useState<Set<KindFamily>>(
    () => new Set(FAMILIES.map((f) => f.key)),
  )
  const toggle = (key: KindFamily) =>
    setShown((prev) => {
      const next = new Set(prev)
      if (next.has(key) && next.size > 1) next.delete(key)
      else next.add(key)
      return next
    })
  const stream = useYear(open)

  const { years, byYear, byMonth, max, total } = useMemo(() => {
    const rows = data ?? []
    const byYear = new Map<number, Totals>()
    const byMonth = new Map<string, Totals>()
    for (const r of rows) {
      const family = FAMILY_OF[r.kind]
      if (!shown.has(family)) continue
      const y = byYear.get(r.year) ?? zero()
      y[family] += r.count
      byYear.set(r.year, y)
      const key = `${r.year}-${r.month}`
      const m = byMonth.get(key) ?? zero()
      m[family] += r.count
      byMonth.set(key, m)
    }
    const present = [...byYear.keys()]
    if (present.length === 0)
      return { years: [], byYear, byMonth, max: 1, total: 0 }
    const first = Math.min(...present)
    const last = Math.max(...present)
    // Every year in the span, not every year with data.
    const years = Array.from({ length: last - first + 1 }, (_, i) => last - i)
    const max = Math.max(...[...byYear.values()].map(sum))
    const total = [...byYear.values()].reduce((n, t) => n + sum(t), 0)
    return { years, byYear, byMonth, max, total }
  }, [data, shown])

  if (isLoading) return <EmptyState>Reading the record…</EmptyState>
  if (years.length === 0)
    return <EmptyState>Nothing recorded yet. Write something and it starts here.</EmptyState>

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-normal tracking-tight text-slate-900 tabular-nums">
          {years[years.length - 1]}
          <span className="mx-2 text-slate-300">—</span>
          {years[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {total.toLocaleString()} moments recorded across {years.length} years
        </p>
        <div className="-mx-2 mt-4 flex flex-wrap gap-x-1 gap-y-1">
          {FAMILIES.map(({ key, label, color }) => {
            const on = shown.has(key)
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(key)}
                className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition hover:bg-slate-100 ${
                  on ? "text-slate-600" : "text-slate-400"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-[1px]"
                  style={{
                    background: on ? color : "transparent",
                    boxShadow: `inset 0 0 0 1px ${color}`,
                  }}
                  aria-hidden
                />
                {label}
              </button>
            )
          })}
        </div>
      </header>

      <ol>
        {years.map((year, i) => {
          const totals = byYear.get(year) ?? zero()
          const count = sum(totals)
          const empty = count === 0
          const isOpen = open === year
          // A decade boundary is real structure in a thirty-year span: it is
          // where "when was that" stops being a year and starts being an era.
          const decade = year % 10 === 9 || i === 0
          return (
            <li key={year} className={decade && i !== 0 ? "mt-6 border-t border-slate-200 pt-6" : ""}>
              <button
                type="button"
                disabled={empty}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : year)}
                className={`grid w-full grid-cols-[3.5rem_1fr_3rem] items-center gap-3 rounded-lg py-1.5 text-left transition ${
                  empty ? "cursor-default" : "hover:bg-slate-100/60"
                }`}
              >
                <span
                  className={`font-display text-2xl tabular-nums ${
                    empty ? "text-slate-300" : isOpen ? "text-slate-900" : "text-slate-600"
                  }`}
                >
                  {year}
                </span>
                {empty ? (
                  <span className="h-px w-full bg-slate-200" aria-hidden />
                ) : (
                  <Band totals={totals} max={max} height={isOpen ? 14 : 10} />
                )}
                <span
                  className={`text-right text-xs tabular-nums ${empty ? "text-slate-300" : "text-slate-400"}`}
                >
                  {empty ? "—" : count.toLocaleString()}
                </span>
              </button>

              {isOpen && (
                <div className="mb-4 ml-[3.5rem] mt-2 space-y-4 border-l border-slate-200 pl-4">
                  <MonthStrip year={year} byMonth={byMonth} />

                  {stream.isLoading ? (
                    <p className="py-2 text-sm text-slate-400">Reading {year}…</p>
                  ) : (
                    <div>
                      {(stream.data ?? []).map((m) => (
                        <Entry key={m.id} moment={m} />
                      ))}
                      {(stream.data?.length ?? 0) >= 500 && (
                        <p className="pt-2 text-xs text-slate-400">
                          Showing the first 500 of {count.toLocaleString()}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
