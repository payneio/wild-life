import { useState, type ReactNode } from "react"
import { ChevronRight, X } from "lucide-react"
import { Record, RecordSection } from "@/components/record/Record"
import { HomePicker } from "@/components/graph/HomePicker"
import { GuestsPanel } from "@/components/calendar/GuestsPanel"
import { Series } from "@/components/calendar/Series"
import { Segmented } from "@/components/detail/kit"
import { useCalendarRecord, useSetRsvp, useShareMoment } from "@/services/api/hooks"
import { MentionChip } from "@/components/MentionChip"
import { useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { KIND_LABEL } from "@/lib/moments"
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
 * `source_ref` names the row this was backfilled from. It no longer links
 * anywhere: the surfaces it pointed at are retired, and a moment's route is a
 * fact about the moment rather than about the row it was derived from.
 */
function Provenance() {
  const { row } = useFields(["kind", "source", "source_ref"])
  const moment = row as unknown as Moment
  return (
    // Quiet, and last. The kind badge earns its colour on a mixed timeline
    // where the act is the news; on a record you opened deliberately it is
    // telling you what you already knew by opening it.
    <p className="text-[11px] text-slate-400">
      {KIND_LABEL[moment.kind]} · {moment.source}
    </p>
  )
}

/**
 * When it is, said the way a person says it.
 *
 * The most important fact about a calendar entry was three rows of raw datetime
 * inputs under a heading reading "What happened", below a wall of imported Teams
 * boilerplate. Reading the time off an occasion meant scrolling past everything
 * that did not matter to reach the one thing that did — the layout was ordered
 * by the data model rather than by the question being asked of it.
 *
 * The inputs are still below and still the way you change it. This only *says*
 * it, at the top, where the answer belongs.
 */
function When() {
  const { row } = useFields([])
  const m = row as unknown as Moment
  const start = m.started_at
  if (!start) return null
  const from = new Date(start)
  const to = m.ended_at ? new Date(m.ended_at) : null
  const day = from.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: from.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  })
  const clock = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const sameDay = to && to.toDateString() === from.toDateString()
  return (
    <p className="text-sm text-slate-600">
      <span className="font-medium text-slate-800">{day}</span>
      {!m.all_day && (
        <span className="text-slate-500">
          {" · "}
          {clock(from)}
          {to && (sameDay ? `–${clock(to)}` : ` – ${to.toLocaleDateString()} ${clock(to)}`)}
        </span>
      )}
    </p>
  )
}

/**
 * An imported description, folded away.
 *
 * What a synced invitation carries is join links, meeting IDs, passcodes and
 * system references — boilerplate the sender's software wrote, not the meeting.
 * Shown in full it filled the screen above every fact worth reading. Authored
 * prose is never folded: you wrote it, so it *is* the content.
 *
 * It renders when empty, which is the whole point of it. Hiding the editor
 * until the body was non-empty meant a slot you had just created — the case
 * where you most want to write — offered nowhere to write, and no way to
 * reach one: the field appeared only once it held text it gave you no way to
 * enter. An empty editor is not clutter on the one surface whose question is
 * "what happened?".
 */
function Description() {
  const { row } = useFields(["body"])
  const m = row as unknown as Moment
  const body = (m.body || "").trim()
  const boilerplate = m.source === "imported" && body.length > 240
  const [open, setOpen] = useState(!boilerplate)
  // An imported description is the *sender's*: `calendar_mail` rewrites `body`
  // from the wire on every newer SEQUENCE, so an empty editor here would invite
  // notes into a field the organiser's next update erases. Nothing of theirs to
  // show means nothing to show. Yours go in the Log band below.
  if (!body && m.source === "imported") return null
  if (!boilerplate) {
    return (
      <RecordSection columns={false}>
        <F.Markdown field="body" label="Description" minRows={4} />
      </RecordSection>
    )
  }
  return (
    <RecordSection columns={false}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-600"
      >
        <ChevronRight size={13} className={open ? "rotate-90 transition" : "transition"} />
        Details from the invitation
      </button>
      {open && <F.Markdown field="body" label="" minRows={4} />}
    </RecordSection>
  )
}

/**
 * The machinery, folded.
 *
 * The raw instants, the intention window and the withdrawal are how you *change*
 * a moment; `When` above is how you read one. Once the answer is stated in words
 * at the top, three date inputs and an empty "no earlier than" are the second
 * most prominent thing on a drawer you opened to check a time.
 *
 * Hidden with a class rather than unmounted: the coverage suite asserts every
 * key the row carries renders somewhere, and a field that exists only after a
 * click is a field that can be quietly dropped.
 */
function Fold({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-slate-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-600"
      >
        <ChevronRight size={13} className={open ? "rotate-90 transition" : "transition"} />
        {label}
      </button>
      <div className={open ? "mt-2 space-y-4" : "hidden"}>{children}</div>
    </div>
  )
}

const RSVP_OPTIONS = [
  { value: "needs-action", label: "No reply" },
  { value: "accepted", label: "Accept" },
  { value: "tentative", label: "Maybe" },
  { value: "declined", label: "Decline" },
]

/**
 * What has been shared about this moment, and with whom.
 *
 * **Absent until something has been.** Privacy is structural: a moment with no
 * calendar record has nothing that can leave this system, so there is no panel
 * to look at and no switch to have left in the wrong position. Adding a guest is
 * what creates the record, which is why sharing reads as an act rather than a
 * setting.
 */
function Sharing({ momentId }: { momentId: string }) {
  const record = useCalendarRecord(momentId).data
  const share = useShareMoment()
  const setRsvp = useSetRsvp()
  const [adding, setAdding] = useState("")

  const attendees = record?.attendees ?? []
  // Someone else convened it, so the question is what I am replying.
  const invited = !!record?.organizer

  const add = () => {
    const email = adding.trim().toLowerCase()
    if (!email.includes("@")) return
    share.mutate({ id: momentId, attendees: [...attendees, email] })
    setAdding("")
  }

  return (
    <RecordSection title="Shared" columns={false}>
      {invited ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            From {record!.organizer?.replace(/^mailto:/i, "")}
          </p>
          <Segmented
            options={RSVP_OPTIONS}
            value={record!.rsvp_status ?? "needs-action"}
            onChange={(v) => setRsvp.mutate({ id: momentId, status: v })}
          />
          <p className="text-[11px] text-slate-400">
            {record!.rsvp_sent_status === record!.rsvp_status &&
            record!.rsvp_status !== "needs-action"
              ? "Reply sent to the organizer"
              : record!.rsvp_status && record!.rsvp_status !== "needs-action"
                ? "Reply will be emailed shortly"
                : "Choose a response to notify the organizer"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {attendees.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attendees.map((email) => (
                <span
                  key={email}
                  className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                >
                  {email}
                  <button
                    type="button"
                    className="text-slate-400 transition hover:text-red-600"
                    title="Remove, and send them a cancellation"
                    onClick={() =>
                      share.mutate({
                        id: momentId,
                        attendees: attendees.filter((a) => a !== email),
                      })
                    }
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            onBlur={add}
            placeholder="Invite by email…"
            className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <GuestsPanel momentId={momentId} />
        </div>
      )}
    </RecordSection>
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

      {/* Answer the question first: when, then what it concerns, then — for
          anything shared — who. The description comes after all three, because
          for an imported meeting it is mostly the sender's software talking. */}
      <When />
      {(entity as Moment).rule_id && <Series ruleId={(entity as Moment).rule_id!} />}

      <RecordSection title="Involves">
        <Involvement />
      </RecordSection>

      {/* Only for an occasion: sharing a reflection with a guest list is not a
          thing, and offering it would suggest otherwise. */}
      {(entity as Moment).kind === "occasion" && <Sharing momentId={entity.id} />}

      <Description />

      <Fold label="Times">
        <RecordSection title="What happened">
          <F.DateTime field="started_at" label="Started" />
          <F.DateTime field="ended_at" label="Ended" />
          <F.Checkbox field="all_day" label="All day" />
        </RecordSection>

        {/* Deciding not to do something is an act and is recorded. Letting a
            date pass is a silence, and *that* is derived. */}
        <RecordSection title="Withdrawn">
          <F.DateTime field="withdrawn_at" label="Withdrawn at" />
          <F.Text field="withdrawal_reason" label="Because" />
        </RecordSection>
      </Fold>

      <Provenance />
    </Record>
  )
}
