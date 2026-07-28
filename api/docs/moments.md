# Moments — the kind vocabulary and the migration mapping

Phase 1 of the moment inversion: the two things that must be fixed before any
schema work. The decisions this rests on are in the plan; this file records only
what they imply, concretely, table by table.

## What a kind is, and is not

A kind names **the act a moment is**. It never names its subject, its target
type, or its tense.

- Not the subject — `note_type` was retired for restating the root (journal
  meant "about me", meeting meant "about an event").
- Not the target type — that is what the links say. A reading of a metric is a
  `measurement` because of the act, not because a metric is on the other end.
- Not the tense — a planned lunch and a lunch you ate are both `occasion`; the
  difference is that one has a window and no occurrence. Kind is orthogonal to
  when.

**Every kind is written by the surface that creates the moment. No surface asks
the user.** This is the load-bearing rule: `Event.event_type` is null on 1,283 of
1,332 rows because a hand-set facet does not get set, and `kind` carries the
inbox predicate, the journal, and the default reading filter. The one surface
that cannot know is quick capture, and its unresolved kind *is* the inbox.

## The vocabulary

| kind | the act | written by | usual links | payload |
| --- | --- | --- | --- | --- |
| `capture` | you wrote something and have not said what it is | quick capture | — | — |
| `reflection` | writing turned inward | journal composer | usually none | — |
| `observation` | writing about something | the Log composer on any record | subject | — |
| `occasion` | time you had somewhere to be | calendar import, calendar capture | participant, place, subject | — |
| `exchange` | a communication with someone about something | ask surfaces, mail ingest | participant, subject (ask) | — |
| `visit` | a stretch of time inside a place | location visit builder | place | — |
| `measurement` | recording a value | metric form, panel form | subject (metric) | reading |
| `dose` | taking a medication | dose logger, protocol step completion | subject (medication) | dose |
| `activity` | doing a non-dose protocol step | protocol step completion | subject (rule) | — |
| `work` | a session spent on a piece of work | task timer, manual entry | subject (task) | — |
| `completion` | finishing something | the six finish paths | subject | — |
| `withdrawal` | deciding not to do something | withdraw action | subject | — |
| `decision` | settling a question | decision record | subject | — |

Deliberately absent:

- **`appointment`** and **`meeting`** — the same act. A work meeting, a lab draw
  and a dinner differ by who is present and where they happen, and both of those
  are links. `occasion` is the generic, and neither earns a kind.
- **`milestone`** — a judgment about importance, not an act. A shipped release is
  an `observation` about the project.
- **`intention`** — not a kind. An intention is any kind with a window and no
  occurrence.
- **`lapsed`** — derived, never written (`window_end < now AND started_at IS NULL
  AND withdrawn_at IS NULL`).

## Migration mapping

### Becomes moments

| source | kind | occurrence | links | payload |
| --- | --- | --- | --- | --- |
| `notes` rooted at self (253) | `reflection` | `entry_date`, all-day | mentions → `mention` | — |
| `notes` rooted elsewhere (593) | `observation` | `entry_date`, all-day | root → `subject`, mentions → `mention` | — |
| `notes` unrooted (1) | `capture` | `entry_date`, all-day | — | — |
| `events` (1,332) | `occasion`; `event_type` in (`note`, `symptom`, `injury`) → `observation` | `start_at`/`end_at`, `all_day` | `location_id` → `place`; `entity_*` → `subject`; resolved attendees → `participant` (325 self-edges dropped) | — |
| `routine_instances` with a medication | `dose` | `completed_at`; `scheduled_date` → window | medication → `subject` | dose |
| `routine_instances` without | `activity` | as above | rule → `subject` | — |
| `metric_entries` (325) | `measurement` | `recorded_at` | metric → `subject` | reading (`value`, `context`) |
| `group_readings` | `measurement` (one moment per act) | `recorded_at` | one `subject` link per member metric | one reading per link |
| `location_visits` | `visit`, `source: derived` | `entered_at`/`exited_at` | location → `place` | — |
| `tasks.completed_at` | `completion` | the timestamp | task → `subject` | — |
| `tasks.scheduled_date` + `scheduled_time` + `estimated_minutes` | `work` | none; window + expected duration | task → `subject` | — |
| `delegations.date_delegated`, `accepted_date`, `delivered_date`, `last_contact_date` | `exchange` | the date, all-day | ask → `subject`, counterparty → `participant` | — |
| `requests.resolved_at`, `commitments.date_made`, `outcomes.satisfied_at`, `reviews.completed_at`, `decisions.decided_on` | `completion` / `decision` | the timestamp | the row → `subject` | — |
| `allergies.noted_on` | `observation` | the date, all-day | allergy → `subject` | — |

### Becomes something other than a moment

| source | becomes |
| --- | --- |
| `notes.entity_type`/`entity_id`, `note_mentions`, `events.location_id`, `entity_links` (443 `attendee`) | `moment_links` with roles `subject` / `mention` / `place` / `participant`, plus a surrogate `id` |
| `events.recurrence`, `recurrence_exdates`, `recurrence_parent_id`, `recurrence_id`, `attendees`, `organizer`, `sequence`, `rsvp_*`, `invites_enabled`, `external_ref` | `calendar_records` — the projection, storing the wire form verbatim |
| `routines.days_of_week`, `interval_days`, `timing`, `start_date`, `end_date`; `protocols.start_date`/`end_date`; `tasks.recurrence` | `rules` — our own cadence expression, slots first-class, freed from `protocol_id` |
| `tasks.due_date`, `requests.needed_by`, `outcomes.by_when`, `projects.target_date` | constraint columns on the work (`due_at`) |
| `tasks.blocked_by_task_id`, `tasks.waiting_on` | `dependencies` edges |
| `delegations.*` (whole table) | folded into `requests` as one ask with direction derived |
| `programs.start_date`/`ended_date`, `projects.start_date`, `areas.archived_at` | dropped; status already says active vs archived, and the span is derived from the object's moments |
| `projects.last_activity_date` | dropped; it is a fold over moments |
| `affiliations.start_date`/`end_date` | unchanged — an externally determined validity interval, not a lifespan of mine |
| `tasks.claimed_by_id`/`claimed_at` | unchanged — a cooperative lock, infrastructure, not an ask |
| `change_log`, `created_at`/`updated_at`, `geocode_cache.fetched_at`, `api_tokens.revoked_at` | unchanged — the system spine and infrastructure timestamps are not life |
| `whiteboard` | unchanged — no date, no subject, one buffer |

Note: `insurance_plans` has no effective dates today, only `status`. If validity
dates are added later they follow the `affiliations` rule, with status derived
from the interval rather than stored beside it.

## What the backfill produced

Run 2026-07-28 (`wild-life-backfill-moments`), against live data:

| source | rows | became |
| --- | --- | --- |
| `notes` | 848 | 253 `reflection` · 593 `observation` · 2 `capture` |
| `note_mentions` | 1,015 | 1,000 `mention` links — 15 self-mentions dropped |
| `events` | 1,332 | 1,315 `occasion` · 17 `observation` · 1,282 calendar records |
| `entity_links` `attendee` | 443 | 118 `participant` links — 325 self-edges dropped |
| `entity_links` `diagnosed_by` | 4 | unchanged — a standing-thing edge, not involvement |
| `tasks.completed_at` | 411 | 411 `completion` |
| `tasks.scheduled_date` | 402 | 402 `work` intentions |
| `metric_entries` | 325 | 325 reading payloads across 86 `measurement` moments |
| `group_readings` | 58 | 58 of those moments; the rest are 28 standalone readings |
| `routine_instances` | 59 | 38 `dose` · 21 `activity` |
| `decisions.decided_on` | 8 | 8 `decision` |
| `requests.resolved_at` | 1 | 1 `completion` |
| `location_visits` | 0 | `visit` (ingestion began 2026-07-27) |

**3,147 moments · 2,969 links · 325 readings · 38 doses · 1,282 calendar records.**
`change_log` was 27,894 before and after: every write is a Core statement, which
the audit listener never sees, so the backfill neither logged 8,000 rows nor
notified every open SSE stream once per row.

Three things the run corrected in this document:

- **`delegations` has no rows.** The `exchange` mapping is written and exercises
  nothing; folding `Delegation` into `Request` migrates no data.
- **Doses are 38, not 37.** A routine instance takes its medication from the
  instance *or* its routine, and only the second was counted here before.
- **Self-mentions go too.** 15 journal entries mention their own author. The
  frame rule was stated for participants and roots; it applies to every role, and
  the mention reconciler needs the same rule in Phase 4 or they return on save.

## Where the migration stands

| piece | state |
| --- | --- |
| Schema (`moments`, links, payloads, `calendar_records`, `dependencies`, `moment_images`) | applied |
| Backfill — `wild-life-backfill-moments` | 3,147 moments; idempotent, incremental (`--since-hours`), silent |
| Reverse — `wild-life-reverse-moments` | tested; names by kind what it cannot bring back |
| `/moments` — CRUD, timeline-by-any-end, `unfulfilled`, rail, images | live |
| `POST /moments/sync` + wildpc job | every 5 minutes, 2-hour window |
| **Prose surfaces** — Journal, Inbox, every record's Log, both composers | **on moments** |
| **Calendar** — layers, drag, recurrence scope, RSVP | **still on `events`** (see below) |

**The sync job is why the mirrored kinds stay current.** Doses, readings,
completions and occasions are still authored through their own surfaces into
`routine_instances`, `metric_entries`, `tasks` and `events`; the tick mirrors
them, so a record's Log shows them within five minutes of the act. It goes away
one kind at a time as those surfaces move.

### Why the calendar did not move with the rest

`CalendarRecord` is a model with no schema and no router: nothing serves
recurrence, `external_ref`, `organizer`, `sequence` or the RSVP pair. The
calendar reads all five — RRULE expansion, the this/following/all scope dialog,
invite sending — so pointing it at `/moments` would mean losing them, not
porting them. It keeps writing `events`, and the tick mirrors each one into an
`occasion` so the timelines stay whole.

**What that costs, concretely:** an occasion's filing is owned by the event row,
so the Inbox triages occasions through `/events` and a subject set on the *moment*
would be reverted by the next tick that re-read its source. Same for editing an
occasion's title or body — which is why the Log renders non-prose kinds read-only
and links through to the surface that owns them.

Moving it needs, in order: `CalendarRecordRead`/`Update` schemas, a read path
that returns the record alongside its moment, and the scoped-edit routes in
`routers/calendar.py` re-expressed against `(moment, calendar_record)` pairs.

### The one column the mapping never decided: `notes.mood`

235 of 848 notes carry a `mood`, and it appears in neither table above — not as
something that becomes a moment, and not as something that becomes anything
else. It was not dropped on purpose; it was missed.

The data is safe (nothing writes `notes` any more, and nothing has dropped it),
but after the cut-over it is invisible and unwritable, because `moments` has no
column for it and the composer offers no control. **Phase 5 must not drop
`notes` until this is settled.** The question is whether mood is a field on a
moment at all: it is meaningless on a `dose` or a `completion`, which is an
argument that it belongs to `reflection` specifically, and a facet that only one
kind carries is the shape `note_type` had.

## What the frontend cut-over did

All of it landed together, because a record's Log and the Journal are the same
component over the same store: the surfaces that share data had to move in one
commit or writing in one place would have gone missing from the other.

| surface | before | after |
| --- | --- | --- |
| `components/Log.tsx` | notes rooted at one entity | `/moments?linked_type&linked_id` — every kind involving the thing, prose editable and mirrors read-only |
| `pages/JournalRoute.tsx` | the self Person's log | `kind=reflection`, no subject, no identity needed |
| `pages/InboxPage.tsx` | `entity_type IS NULL` | `kind=capture`; filing writes the subject *and* resolves the kind in one PATCH |
| `components/MomentComposer.tsx` | `NoteComposer` | takes `kind` as a prop; About writes a `subject` link, mentions write `mention` |
| `detail/planning.tsx` | `ProgramTimeline` | deleted — it is the Log band now |
| `components/Backlinks.tsx` | every linked note, minus the root, client-side | `role=mention`, server-side |
| `services/calendar/sources.ts` | notes by `entry_date` | reflections by `started_at` |
| `services/api/registry.ts` | `note` | `moment`, with `entities/moment/Detail.tsx` and a fixture |

`event` stays in the registry, and `entities/event/Capture.tsx` with it, for the
reason in *Why the calendar did not move* above.

Things learned the hard way, worth not rediscovering:

- **The self-link rule belongs in the reconciler**, and it is already there
  (`routers/moments.py`). The composer may legitimately send a mention of the
  writer; it is dropped on the way in, not rejected.
- **`kind` is written by the surface, never asked.** Quick capture (⌘⇧N with no
  owner) is the only surface that writes `capture`; the same window opened *from*
  a record writes `observation`. That is what makes the inbox a state rather than
  a lack. `web/src/components/Log.test.tsx` pins it.
- **`PATCH /moments` reconciles links wholesale.** Any writer that sends `links`
  must send back the ones it does not own, or it deletes them. The composer
  carries `participant` and `place` through untouched; the Inbox carries mentions
  through when it files a capture.
- **Images changed reference form**: bodies say `![alt](moment-image:<id>)` and
  are served from `/moment-images/<id>`.
- **A moment with no occurrence and no window sorts `nullslast`**, so past 200
  rows it is off the end of the page. Every composer writes `started_at`
  (all-day, noon-anchored) for exactly this reason.
- **Run the backfill immediately before the cut**, so anything written that day
  has a moment. After the cut, `wild-life-reverse-moments` is the way back.
- The scripts need `WILD_LIFE_DATABASE_URL`, `WILD_LIFE_SELF_PERSON_ID` (now
  guarded — it refuses rather than misfiling 253 reflections) and
  `WILD_LIFE_DATA_DIR=/data/castle/wild-life-api`. The data dir is *not* guarded:
  without it the image pass wrote 13 rows with no bytes behind them.
