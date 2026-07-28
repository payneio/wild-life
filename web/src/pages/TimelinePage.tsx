import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronDown } from "lucide-react"
import { EmptyState } from "@/components/ui/primitives"
import { MentionText } from "@/components/MentionText"
import { apiClient } from "@/services/api/client"
import { useQueries, useQuery } from "@tanstack/react-query"
import {
  FAMILIES,
  FAMILY_OF,
  KIND_LABEL,
  routeForMoment,
  subjectOf,
  WEIGHT_OF,
  whenOf,
  type KindFamily,
} from "@/lib/moments"
import { useEntityResolver } from "@/services/api/mentions"
import { routeFor } from "@/services/api/routes"
import type { EntityType, Moment, MomentKind } from "@/services/api/types"

interface DensityRow {
  year: number
  month: number
  kind: MomentKind
  count: number
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"]

/** The standing things a life is organised around — what a year can be *about*. */
const THEME_TYPES = new Set<EntityType>(["area", "program", "project", "person"])

type Totals = Record<KindFamily, number>
const zero = (): Totals => ({ writing: 0, places: 0, body: 0, work: 0 })
const sum = (t: Totals) => t.writing + t.places + t.body + t.work
const colorOf = (k: MomentKind) => FAMILIES.find((f) => f.key === FAMILY_OF[k])!.color

// --- data -------------------------------------------------------------------

function useDensity() {
  return useQuery({
    queryKey: ["moments", "density"],
    queryFn: () => apiClient.get<DensityRow[]>("/moments/density"),
    staleTime: 60_000,
  })
}

/** Years load as they come into view. Thirty at once is 3,148 moments and a
 *  scrollbar that lies about how much is left. */
function useYears(years: number[]) {
  return useQueries({
    queries: years.map((year) => ({
      queryKey: ["moments", "year-stream", year],
      queryFn: () =>
        apiClient.get<Moment[]>("/moments", {
          since: `${year}-01-01T00:00:00Z`,
          until: `${year}-12-31T23:59:59Z`,
          limit: "500",
        }),
      staleTime: 60_000,
    })),
  })
}

// --- the three sizes of thing that can happen -------------------------------

/** A day's small moments, as one line you can open.
 *
 *  Six supplements and two readings are a *pattern*, not eight events, and eight
 *  rows of them buries the conversation you had that afternoon. The count is the
 *  honest summary; the detail is one tap away for the day you actually want it. */
function SmallCluster({ moments }: { moments: Moment[] }) {
  const [open, setOpen] = useState(false)
  const byKind = useMemo(() => {
    const m = new Map<MomentKind, number>()
    for (const x of moments) m.set(x.kind, (m.get(x.kind) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [moments])

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 rounded-lg py-1 text-left transition hover:bg-slate-100/60"
      >
        <span className="flex shrink-0 items-center gap-0.5">
          {moments.slice(0, 10).map((m) => (
            <span
              key={m.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: colorOf(m.kind) }}
            />
          ))}
          {moments.length > 10 && (
            <span className="ml-0.5 text-[10px] text-slate-400">+{moments.length - 10}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
          {byKind
            .map(([k, n]) => `${n} ${KIND_LABEL[k].toLowerCase()}${n === 1 ? "" : "s"}`)
            .join(" · ")}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-slate-300 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 pl-3">
          {moments.map((m) => (
            <li key={m.id}>
              <Link
                to={routeForMoment(m)}
                className="flex items-baseline gap-2 py-0.5 text-xs text-slate-500 hover:text-slate-800"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 translate-y-1 rounded-full"
                  style={{ background: colorOf(m.kind) }}
                />
                <span className="truncate">{m.title || KIND_LABEL[m.kind]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Something that closed. A line — it has an outcome, not content. */
function MediumRow({ moment }: { moment: Moment }) {
  return (
    <Link
      to={routeForMoment(moment)}
      className="group flex items-baseline gap-2.5 rounded-lg py-1 transition hover:bg-slate-100/60"
    >
      <span
        className="h-2 w-2 shrink-0 translate-y-1 rounded-[2px]"
        style={{ background: colorOf(moment.kind) }}
      />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-600 group-hover:text-slate-900">
        {moment.title || KIND_LABEL[moment.kind]}
      </span>
    </Link>
  )
}

/** Time you spent somewhere, or words you wrote. The only things with a body
 *  worth reading in place, so the only things that get room. */
function LargeBlock({ moment }: { moment: Moment }) {
  const resolve = useEntityResolver()
  const subject = subjectOf(moment)
  const when = whenOf(moment)
  const clock =
    when && !moment.all_day
      ? new Date(when).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : null
  const body = (moment.body || "").trim()

  return (
    <div
      className="my-1 rounded-lg border-l-2 bg-surface/60 py-1.5 pl-3 transition hover:bg-surface"
      style={{ borderColor: colorOf(moment.kind) }}
    >
      <Link to={routeForMoment(moment)} className="block">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">
            {moment.title || KIND_LABEL[moment.kind]}
          </span>
          {clock && <span className="shrink-0 text-[11px] text-slate-400">{clock}</span>}
        </div>
      </Link>
      {body && (
        <div className="mt-0.5 line-clamp-3 text-sm text-slate-500 [&_p]:my-0">
          <MentionText>{body.slice(0, 400)}</MentionText>
        </div>
      )}
      {subject && (
        <SubjectChip type={subject.entity_type} id={subject.entity_id} resolve={resolve} />
      )}
    </div>
  )
}

function SubjectChip({
  type,
  id,
  resolve,
}: {
  type: EntityType
  id: string
  resolve: (t: EntityType, i: string) => string | undefined
}) {
  const label = resolve(type, id)
  if (!label) return null
  const to = routeFor(type, id)
  const chip = (
    <span className="mt-1 inline-block max-w-full truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
      {label}
    </span>
  )
  return to ? <Link to={to}>{chip}</Link> : chip
}

// --- a day ------------------------------------------------------------------

function DayGroup({ day, moments }: { day: string; moments: Moment[] }) {
  const date = new Date(`${day}T12:00:00Z`)
  const small = moments.filter((m) => WEIGHT_OF[m.kind] === "small")
  const rest = moments.filter((m) => WEIGHT_OF[m.kind] !== "small")

  return (
    <div className="grid grid-cols-[2.75rem_1fr] gap-x-3 py-1">
      <div className="pt-1 text-right">
        <div className="font-display text-base leading-none tabular-nums text-slate-500">
          {date.getUTCDate()}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-slate-300">
          {DAYS[date.getUTCDay()]}
        </div>
      </div>
      <div className="min-w-0 border-l border-slate-100 pl-3">
        {rest.map((m) =>
          WEIGHT_OF[m.kind] === "large" ? (
            <LargeBlock key={m.id} moment={m} />
          ) : (
            <MediumRow key={m.id} moment={m} />
          ),
        )}
        {small.length > 0 && <SmallCluster moments={small} />}
      </div>
    </div>
  )
}

// --- a year -----------------------------------------------------------------

function YearHeading({
  year,
  totals,
  max,
  subjects,
}: {
  year: number
  totals: Totals
  max: number
  subjects: { label: string; n: number }[]
}) {
  const total = sum(totals)
  return (
    <div className="sticky top-0 z-10 -mx-1 mb-2 bg-slate-50/95 px-1 pb-2 pt-4 backdrop-blur">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-3xl leading-none tabular-nums text-slate-900">{year}</h2>
        <span className="text-xs tabular-nums text-slate-400">
          {total.toLocaleString()} recorded
        </span>
      </div>
      {total > 0 && (
        <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-[1px]">
          {FAMILIES.map(({ key, color }) =>
            totals[key] > 0 ? (
              <span
                key={key}
                style={{ background: color, flexGrow: totals[key], flexBasis: 0 }}
              />
            ) : null,
          )}
          <span style={{ flexGrow: Math.max(0, max - total), flexBasis: 0 }} />
        </div>
      )}
      {subjects.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {subjects.map((s) => (
            <span
              key={s.label}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
            >
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function groupDays(moments: Moment[]): { day: string; moments: Moment[] }[] {
  const out: { day: string; moments: Moment[] }[] = []
  const byDay = new Map<string, { day: string; moments: Moment[] }>()
  for (const m of moments) {
    const stamp = whenOf(m) ?? m.created_at
    const day = stamp.slice(0, 10)
    let g = byDay.get(day)
    if (!g) {
      g = { day, moments: [] }
      byDay.set(day, g)
      out.push(g)
    }
    g.moments.push(m)
  }
  return out
}

/**
 * A life, read the way you remember one: downward from now, at whatever
 * resolution the year deserves.
 *
 * Three decisions carry it.
 *
 * **Not everything is the same size.** A dose and a conversation were identical
 * rows before, which made a day of six supplements look busier than a day with
 * one long afternoon in it. Weight is a property of the act, so small things
 * cluster into a count you can open, things that merely closed get a line, and
 * things with content get room to show it.
 *
 * **You scroll, you don't navigate.** No accordion: the stream is continuous
 * from this week back to 1997, and the rail on the right says where you are and
 * takes you anywhere. Years load as they arrive.
 *
 * **What a year was *about* is a different question from how much happened in
 * it**, and both are answered at the top of each year — the composition bar for
 * volume, and the things it concerned for substance.
 */
export function TimelinePage() {
  const { data, isLoading } = useDensity()
  const resolve = useEntityResolver()
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

  const { years, byYear, max, total } = useMemo(() => {
    const rows = data ?? []
    const byYear = new Map<number, Totals>()
    for (const r of rows) {
      const family = FAMILY_OF[r.kind]
      if (!shown.has(family)) continue
      const y = byYear.get(r.year) ?? zero()
      y[family] += r.count
      byYear.set(r.year, y)
    }
    const present = [...byYear.keys()]
    if (present.length === 0) return { years: [], byYear, max: 1, total: 0 }
    const first = Math.min(...present)
    const last = Math.max(...present)
    const years = Array.from({ length: last - first + 1 }, (_, i) => last - i)
    const max = Math.max(...[...byYear.values()].map(sum))
    const total = [...byYear.values()].reduce((n, t) => n + sum(t), 0)
    return { years, byYear, max, total }
  }, [data, shown])

  // Load the first few years immediately; the rest as they scroll into view.
  const [loaded, setLoaded] = useState(3)
  const streams = useYears(years.slice(0, loaded))
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || loaded >= years.length) return
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setLoaded((n) => Math.min(years.length, n + 3)),
      { rootMargin: "600px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loaded, years.length])

  // Which year the reader is in, for the rail. Read off the headings rather
  // than computed from scroll maths, so it cannot disagree with what is on screen.
  const [here, setHere] = useState<number | null>(null)
  const marks = useRef<Map<number, HTMLDivElement>>(new Map())
  const registerMark = useCallback((year: number, el: HTMLDivElement | null) => {
    if (el) marks.current.set(year, el)
    else marks.current.delete(year)
  }, [])
  useEffect(() => {
    const onScroll = () => {
      let best: number | null = null
      let bestTop = -Infinity
      for (const [year, el] of marks.current) {
        const top = el.getBoundingClientRect().top
        if (top <= 120 && top > bestTop) {
          bestTop = top
          best = year
        }
      }
      setHere(best ?? years[0] ?? null)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [years])

  if (isLoading) return <EmptyState>Reading the record…</EmptyState>
  if (years.length === 0)
    return <EmptyState>Nothing recorded yet. Write something and it starts here.</EmptyState>

  return (
    <div className="relative mx-auto max-w-3xl pr-10">
      <header className="pb-2">
        <h1 className="font-display text-4xl tracking-tight text-slate-900 tabular-nums">
          {years[years.length - 1]}
          <span className="mx-2 text-slate-300">—</span>
          {years[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {total.toLocaleString()} moments recorded across {years.length} years
        </p>
        <div className="-mx-2 mt-3 flex flex-wrap gap-x-1">
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
                />
                {label}
              </button>
            )
          })}
        </div>
      </header>

      {/* The rail: every year at once, height by volume. Where you are, and the
          way to anywhere — the scroll is continuous, so this is the only
          navigation the page needs. */}
      <nav
        aria-label="Jump to a year"
        className="fixed right-2 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-px"
      >
        {years.map((y) => {
          const n = sum(byYear.get(y) ?? zero())
          const current = here === y
          return (
            <button
              key={y}
              type="button"
              title={`${y} · ${n}`}
              onClick={() =>
                marks.current.get(y)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="group flex items-center justify-end gap-1"
            >
              <span
                className={`font-display text-[9px] tabular-nums transition ${
                  current
                    ? "text-slate-700"
                    : y % 10 === 0
                      ? "text-slate-300"
                      : "text-transparent group-hover:text-slate-400"
                }`}
              >
                {y}
              </span>
              <span
                className="rounded-full transition"
                style={{
                  width: current ? 14 : 4 + Math.round((n / max) * 10),
                  height: 3,
                  background: current ? "var(--indigo-600)" : "var(--slate-300)",
                }}
              />
            </button>
          )
        })}
      </nav>

      {years.slice(0, loaded).map((year, i) => {
        const stream = streams[i]
        const rows = ((stream?.data ?? []) as Moment[]).filter((m) =>
          shown.has(FAMILY_OF[m.kind]),
        )
        // What the year was *about*. Deliberately only the standing things a
        // life is organised around — the subject of a dose is a medication and
        // of a reading a metric, which are the instruments of the daily
        // machinery rather than themes of a year. Listing those gave 2026 a
        // summary reading "prucalopride · Drink water 3x/day · Blood Pressure",
        // which is true and tells you nothing.
        const subjects = (() => {
          const counts = new Map<string, number>()
          for (const m of rows) {
            const s = subjectOf(m)
            if (!s || !THEME_TYPES.has(s.entity_type)) continue
            const label = resolve(s.entity_type, s.entity_id)
            if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
          }
          return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([label, n]) => ({ label, n }))
        })()

        return (
          <section key={year}>
            <div ref={(el) => registerMark(year, el)}>
              <YearHeading
                year={year}
                totals={byYear.get(year) ?? zero()}
                max={max}
                subjects={subjects}
              />
            </div>
            {stream?.isLoading ? (
              <p className="py-3 pl-14 text-sm text-slate-400">Reading {year}…</p>
            ) : rows.length === 0 ? (
              <p className="py-2 pl-14 text-sm text-slate-300">Nothing recorded.</p>
            ) : (
              <>
                {groupDays(rows).map((g, gi, all) => {
                  // The day column carries a number; without the month, "31"
                  // followed by "1" reads as going forwards.
                  const month = g.day.slice(0, 7)
                  const newMonth = gi === 0 || all[gi - 1].day.slice(0, 7) !== month
                  return (
                    <div key={g.day}>
                      {newMonth && (
                        <div className="mt-3 mb-1 pl-[3.6rem] text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                          {MONTHS[Number(g.day.slice(5, 7)) - 1]}
                        </div>
                      )}
                      <DayGroup day={g.day} moments={g.moments} />
                    </div>
                  )
                })}
                {rows.length >= 500 && (
                  <p className="py-2 pl-14 text-xs text-slate-400">
                    Showing the first 500 of this year.
                  </p>
                )}
              </>
            )}
          </section>
        )
      })}
      <div ref={sentinel} className="h-20" />
    </div>
  )
}
