import { Record, RecordSection } from "@/components/record/Record"
import { WhereWasI } from "@/components/record/WhereWasI"
import { EventDetail as EventWhenWho } from "@/components/detail/reference"
import { recordFields } from "@/components/record/typed"
import { EVENT_TYPE } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, EventItem } from "@/services/api/types"

const F = recordFields<EventItem>()


/**
 * Temporality earns Event its bespoke views (the when/where block, RSVP, the
 * guests panel), all of which stay. The fields underneath are the plain frame.
 *
 * A good deal of an event is machinery rather than content — iMIP sequence
 * numbers, the recurrence parent link, delivery state for an RSVP already sent.
 * Those are excused explicitly below rather than dumped into the grid, which is
 * what the generic renderer did.
 */
export function EventDetail({
  entity,
  onClose,
  onDelete,
}: {
  entity: Entity
  onClose: () => void
  onDelete?: () => void
}) {
  return (
    <Record
      def={REGISTRY.event}
      entity={entity}
      onClose={onClose}
      onDelete={onDelete}
      omit={[
        // Computed server-side: true when the organizer is someone else.
        "received_invite",
        // Answered through the RSVP control, which posts to /events/:id/rsvp
        // rather than PATCHing the column.
        "rsvp_status",
        // Delivery state for the reply we sent; not something you set.
        "rsvp_sent_status",
        "organizer",
        // Recurrence machinery — owned by the expansion and the scoped-delete
        // flow, not by hand.
        "recurrence_id",
        "recurrence_parent_id",
        "recurrence_exdates",
        // External calendar identity, written by sync.
        "external_ref",
        "sequence",
        // Set by the cancel flow.
        "cancelled_at",
      ]}
    >
      <RecordSection>
        <F.Title field="title" placeholder="Event title" />
      </RecordSection>

      <EventWhenWho entity={entity} />

      <RecordSection title="When">
        <F.DateTime field="start_at" label="Start" />
        <F.DateTime field="end_at" label="End" />
        <F.Checkbox field="all_day" label="All day" />
        <F.Recurrence field="recurrence" label="Repeats" />
      </RecordSection>

      <RecordSection title="What & where">
        <F.Select field="event_type" label="Type" options={EVENT_TYPE} />
        {/* A reference and a string, on purpose. `location_id` is the place as
            you mean it; `location` is what iCalendar carries, and inbound invites
            arrive with text we cannot always resolve — so neither replaces the
            other. Nothing auto-matches text to a place: a wrong link is worse
            than no link. */}
        <F.Ref field="location_id" label="Place" lookup="location" />
        <F.Text field="location" label="Location (as written)" />
        {/* And where you actually *were*, derived from readings — as against the
            two above, which say where it was planned. They differ, and the
            difference is often the interesting part. */}
        <WhereWasI field="start_at" />
        {/* Invite bodies arrive formatted — links, schedules — and the API
            stores them as markdown (see api/.../richtext.py). */}
        <F.Markdown field="description" label="Description" minRows={2} />
      </RecordSection>

      <RecordSection title="Guests">
        <F.Attendees field="attendees" label="Attendees" />
        <F.Checkbox field="invites_enabled" label="Send email invitations" />
      </RecordSection>

      <RecordSection title="Filing">
        <F.Root label="About" />
      </RecordSection>
    </Record>
  )
}
