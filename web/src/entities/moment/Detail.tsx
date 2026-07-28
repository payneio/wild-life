import { Link } from "react-router-dom"
import { X } from "lucide-react"
import { Record, RecordSection } from "@/components/record/Record"
import { HomePicker } from "@/components/graph/HomePicker"
import { MentionChip } from "@/components/MentionChip"
import { useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { KIND_CLASS, KIND_LABEL, sourceRoute } from "@/lib/moments"
import { REGISTRY } from "@/services/api/registry"
import { useEntityResolver } from "@/services/api/mentions"
import type { Entity, EntityType, Moment, MomentLink, MomentRole } from "@/services/api/types"

const F = recordFields<Moment>()

/** Roles in the order a reader wants them: what it's about, then who and where,
 *  then what it merely touched. */
const ROLE_ORDER: { role: MomentRole; label: string }[] = [
  { role: "subject", label: "About" },
  { role: "participant", label: "With" },
  { role: "place", label: "At" },
  { role: "mention", label: "Mentions" },
]

/**
 * What the moment involves — the whole of its filing, in one control.
 *
 * Involvement replaces rootedness: there is no privileged owner column, so an
 * appointment can concern the program *and* the medication without choosing.
 * Adding here writes a `subject`, because that is the involvement a reader can
 * assert about a row in front of them; `participant` and `place` are written by
 * the surfaces that know them (an invitation's attendees, a visit's fence) and
 * are shown and removable but not invented here.
 */
function Involvement() {
  const { row, save } = useFields(["links"])
  const resolve = useEntityResolver()
  const links = (row.links as MomentLink[] | null) ?? []

  const set = (next: MomentLink[]) => save({ links: next })
  const add = (type: EntityType, id: string) => {
    if (links.some((l) => l.role === "subject" && l.entity_type === type && l.entity_id === id))
      return
    set([...links, { role: "subject", entity_type: type, entity_id: id }])
  }
  const drop = (l: MomentLink) =>
    set(links.filter((x) => !(x.role === l.role && x.entity_type === l.entity_type && x.entity_id === l.entity_id)))

  return (
    <div className="space-y-2">
      {ROLE_ORDER.map(({ role, label }) => {
        const rows = links.filter((l) => l.role === role)
        if (rows.length === 0) return null
        return (
          <div key={role} className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 shrink-0 text-xs text-slate-400">{label}</span>
            {rows.map((l) => (
              <span key={`${l.entity_type}:${l.entity_id}`} className="flex items-center gap-1">
                <MentionChip
                  type={l.entity_type}
                  id={l.entity_id}
                  label={resolve(l.entity_type, l.entity_id) ?? "…"}
                />
                <button
                  type="button"
                  className="text-slate-300 transition hover:text-red-600"
                  title="Remove"
                  onClick={() => drop(l)}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )
      })}
      <HomePicker
        label="About…"
        placeholder="What else does this concern? (any area, project, person…)"
        onPick={add}
      />
    </div>
  )
}

/**
 * The act, and where it came from.
 *
 * Both are read-only on purpose. `kind` is written by the surface that created
 * the moment and never asked of the user — a hand-set facet does not get set,
 * which is what left `Event.event_type` null on 1,283 of 1,332 rows, and this
 * one carries the inbox predicate and the Journal. The one kind a reader may
 * legitimately resolve is `capture`, and the Inbox is the surface for it.
 * `source_ref` names the row this is still mirrored from while that surface
 * writes its own table; it is a fact about the migration, not a field.
 */
function Provenance() {
  const { row } = useFields(["kind", "source", "source_ref"])
  const moment = row as unknown as Moment
  const to = sourceRoute(moment)
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
      <span className={`rounded px-1.5 py-0.5 font-medium uppercase tracking-wide ${KIND_CLASS[moment.kind]}`}>
        {KIND_LABEL[moment.kind]}
      </span>
      <span>{moment.source}</span>
      {to && (
        <>
          <span>·</span>
          <Link to={to} className="text-indigo-600 hover:underline">
            mirrored from its source
          </Link>
        </>
      )}
    </div>
  )
}

/**
 * A moment: something that happened, or that you intend to happen.
 *
 * The two time bands are separate columns rather than two record types, because
 * **tense is not a type** — a planned lunch and a lunch you ate differ by which
 * is filled, and both may be set at once (the delta between "planned two hours"
 * and "took four" is the only way estimation ever improves). Precision is window
 * width: "sometime in June" is a month-wide window, and scheduling is that
 * window contracting until it equals the expected duration.
 */
export function MomentDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record
      def={REGISTRY.moment}
      entity={entity}
      onClose={onClose}
      omit={[
        // A moment's place in a series: which rule, and which projected slot it
        // stands in for. Written by a scoped edit on the calendar, never by
        // hand — re-pointing an occurrence at another series would be editing an
        // identity rather than a fact, and `occurrence_at` must stay the
        // *original* instant or the slot loses its name.
        "rule_id",
        "occurrence_at",
      ]}
    >
      <RecordSection>
        <F.Title field="title" placeholder="Untitled" />
      </RecordSection>

      <Provenance />

      <RecordSection columns={false}>
        {/* Renders the same way the Log does — one field, one appearance. */}
        <F.Markdown field="body" label="Body" minRows={8} />
      </RecordSection>

      <RecordSection title="Involves">
        <Involvement />
      </RecordSection>

      <RecordSection title="What happened">
        <F.DateTime field="started_at" label="Started" />
        <F.DateTime field="ended_at" label="Ended" />
        <F.Checkbox field="all_day" label="All day" />
      </RecordSection>

      <RecordSection title="What was intended">
        <F.DateTime field="window_start" label="No earlier than" />
        <F.DateTime field="window_end" label="No later than" />
        <F.Number field="expected_minutes" label="Expected minutes" />
      </RecordSection>

      {/* Deciding not to do something is an act and is recorded. Letting a date
          pass is a silence, and *that* is derived — there is nothing to store
          and so nothing that can go stale. */}
      <RecordSection title="Withdrawn">
        <F.DateTime field="withdrawn_at" label="Withdrawn at" />
        <F.Text field="withdrawal_reason" label="Because" />
      </RecordSection>
    </Record>
  )
}
