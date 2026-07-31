# Moments — the spine

The kind vocabulary and the shape it produced. The migration onto it is done —
see *The migration is finished* — and the mapping tables below are kept as the
record of what became what, which the CSVs in `migrations/legacy/` are the data
half of. Read this before touching `models/moments.py`.

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
the user.** A hand-set facet does not get set, and `kind` carries the inbox
predicate, the Journal and the default reading filter — so none of them can
depend on someone having remembered. The one surface that cannot know is quick
capture, and its unresolved kind *is* the inbox.

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

## The shape, after the inversion

```
                       ┌────────────────────┐
                       │      routines      │   THE RULE — one cadence for
                       │     (the rule)     │   everything that recurs
                       └─────┬────────┬─────┘
                     rule_id │        │ rule_id
             ┌───────────────┘        └────────────┐
             ▼                                     ▼
     ┌───────────────────┐                  ┌──────────────┐
     │      moments      │                  │  rule_links  │
     │    (the spine)    │                  └──────────────┘
     └──┬────┬────┬───┬──┘
        │    │    │   └──────────────────────────┐
        │    │    └───────────────┐              │
        ▼    ▼                    ▼              ▼
 ┌─────────────┐ ┌──────────────────┐ ┌────────────────┐ ┌──────────────────┐
 │ moment_links│ │ calendar_records │ │ moment_images  │ │  sent_invites    │
 │             │ │ (the projection) │ │                │ │ attendee_responses│
 └──────┬──────┘ └──────────────────┘ └────────────────┘ └──────────────────┘
   link_id │
     ┌─────┴──────┐
     ▼            ▼
┌──────────────┐ ┌─────────────┐
│moment_readings│ │moment_doses │
└──────────────┘ └─────────────┘
```

Five things the diagram is making a point about:

- **`moments.rule_id` means two things, told apart by `occurrence_at`.** Null →
  the *anchor*, the series' representative row that a projection hangs off. Set →
  a *materialised occurrence*, one slot something happened to. Untouched
  occurrences are not rows at all.
- **Payload keys on the link, not the moment.** A lipid panel is one act with
  five metrics at five values, so `value` belongs to the *pairing*.
- **`moment_links` has no foreign key on its target.** Four closed roles
  (participant · place · subject · mention) over a soft `entity_type`/`entity_id`,
  because a moment may concern anything.
- **`calendar_records` is 1:1 with a moment and optional**, which is the whole of
  the privacy model: no record, nothing to export.
- **The two iMIP ledgers hang off the moment**, because they record what has
  already left the building.

## Migration mapping

### Becomes moments

| source | kind | occurrence | links | payload |
| --- | --- | --- | --- | --- |
| `notes` rooted at self | `reflection` | `entry_date`, all-day | mentions → `mention` | — |
| `notes` rooted elsewhere | `observation` | `entry_date`, all-day | root → `subject`, mentions → `mention` | — |
| `notes` unrooted | `capture` | `entry_date`, all-day | — | — |
| `events` | `occasion`; `event_type` in (`note`, `symptom`, `injury`) → `observation` | `start_at`/`end_at`, `all_day` | `location_id` → `place`; `entity_*` → `subject`; resolved attendees → `participant` | — |
| `routine_instances` with a medication | `dose` | `completed_at`; `scheduled_date` → window | medication → `subject` | dose |
| `routine_instances` without | `activity` | as above | rule → `subject` | — |
| `metric_entries` | `measurement` | `recorded_at` | metric → `subject` | reading (`value`, `context`) |
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
| `notes.entity_type`/`entity_id`, `note_mentions`, `events.location_id`, `entity_links` (`attendee`) | `moment_links` with roles `subject` / `mention` / `place` / `participant`, plus a surrogate `id` |
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
| `notes.mood` | dropped — a free-text vocabulary nobody chose and nothing read. A Metric if it is ever wanted |

Note: `insurance_plans` has no effective dates today, only `status`. If validity
dates are added later they follow the `affiliations` rule, with status derived
from the interval rather than stored beside it.

## The migration is finished

| piece | state |
| --- | --- |
| Schema (`moments`, links, payloads, `calendar_records`, `dependencies`, `moment_images`) | applied |
| `/moments` — CRUD, timeline-by-any-end, `unfiled`, `unfulfilled`, rail, images | live |
| **Every act writes a moment inline**, in its own transaction (`spine.py`) | live |
| **Prose surfaces** — Journal, Inbox, every record's Log, both composers | on moments |
| **A moment's own Log** — a moment is a legal `subject`, so an occasion has notes | live; no exception by kind |
| **Rules** — one cadence expression, freed from `protocol_id` | generalised `Routine` + `rule_links` |
| **Recurrence** — wire ⇄ our cadence, proved against all 74 real rules | 58 translate · 16 materialised |
| **Calendar** — `/occurrences`, scoped edits, server-side expansion, projected slots | on moments + rules |
| **iMIP** — invitations, RSVP, guests | on moments + calendar records |
| The mirror (`POST /moments/sync`, the 5-minute job, the backfill) | **deleted** |
| `events`, `notes`, `note_mentions`, `note_images` + six scaffolding tables | **dropped** (`c4d5e6f7a8b9`) |
| The `event_id` columns those tables left behind | **dropped** (`e7f8a9b0c1d2`) |
| `event` and `note` as `EntityType` values | **retired** |

**Nothing lags any more, and nothing is written twice.** `spine.py` records the
moment for an act in the same transaction as the row the act wrote, so the
timeline and every record's Log are as current as the database. Each derived
moment is named after its source row (`task:<id>:completion`) and
`uq_moments_source_ref` allows one per name, which is what made the cut-over
incremental — the mirror and the inline write could both run, agreeing, until
the last surface moved and the mirror could go.

The inline writers also *retract*, which the mirror never could: reopening a
task deletes its completion, unscheduling deletes its intention, un-checking a
routine deletes its dose, and deleting a row takes its moments with it. A
timeline that keeps asserting something you undid is worse than one that lags.

The pre-inversion rows are in `migrations/legacy/*.csv`, verified row-for-row
against the database before the tables were dropped. That is the way back, and
it is an artifact rather than live schema on purpose: **a frozen table is worse
than no table, because it answers.**

### How the calendar works now

`GET /occurrences?since&until` answers the whole question, from three sources in
one shape:

1. a plain moment — itself;
2. a moment carrying a wire rule we could not translate — expanded verbatim from
   its calendar record;
3. a rule of ours — projected as wall times in its own zone, and **never stored**
   (decision 10).

A translated series has both a rule *and* the wire form it came from. Only the
rule expands: the anchor moment names its rule (`rule_id`, `occurrence_at IS
NULL`) and defers to it. Expanding both put the same therapy appointment on the
calendar twice a week, which is what the corpus test now forbids.

**`moments.rule_id` + `occurrence_at` replaces the override VEVENT.**
`RECURRENCE-ID`/`EXDATE` exist because an iCal series cannot record an exception;
ours can. Untouched occurrences are not rows; a moved one is a moment naming the
slot it stands for; a cancelled one is that plus `withdrawn_at`. `occurrence_at`
is always the *original* instant — the identity of the slot, not the new time.

Scoped edits (`PATCH /occurrences`) follow from that and are most of a page
rather than most of a file: `all` edits the rule, `following` splits it in two
and re-points later exceptions, `this` writes one moment.

**A slot with no row is still addressable**, and has to be: a projection has no
id, so the grid once sent a click on a repeating meeting to the *series*, and one
Thursday's notes were filed on the rule that generates every Thursday. The web
app addresses it by the pair instead — `/calendar/slot/:ruleId?occ=` — and opening
one still creates nothing, because a row per meeting glanced at would make every
glance an exception immune to a later `all` edit. Writing is the case that earns a
row: the first note materialises the slot via scope `this` (idempotent on the
pair, so this is the same door the drag handlers use), roots itself at the moment
that comes back, and hands over to the ordinary record.

### iMIP, and where privacy became structural

The send path runs on `(Moment, CalendarRecord)` — `wild_life/occasions.py` pairs
them. Reads are convenient there; **writes are not**, deliberately:
`occ.record.sequence = n` says out loud that a sequence number is something we
tell other systems, and `occ.moment.title = t` that a title is ours. Collapsing
the two into one mutable surface is how they got confused in the first place.

The payoff is that **privacy stopped being a filter**. A moment with no calendar
record has nothing to export, `Occasion` cannot be constructed for one, and every
send path takes an `Occasion`. So the question is never "did the export query say
WHERE correctly" but "which moments were given a record" — and there are exactly
two places that happens: `PATCH /moments/{id}/calendar` (adding a guest list *is*
the sharing) and an inbound invitation arriving. `tests/test_export_privacy.py`
pins the default; `tests/test_calendar_mail_tick.py` exercises the lifecycle.

Both iMIP ledgers re-key onto the moment. They record what has already left the
building, so they have to hang off the thing that can leave it.

### What is left of `events` and `notes`

Nothing. Both tables are dropped, along with `note_mentions`, `note_images`, the
six `_`-prefixed scaffolding tables, and the `event_id` columns four models were
still carrying. `event` and `note` are no longer `EntityType` values either — a
type that cannot be constructed should not be nameable, or every consumer keeps
a branch for a case that can only 404.

Their rows are in `migrations/legacy/*.csv`. Keeping them as an artifact rather
than as live schema is the point: **a frozen table is worse than no table,
because it answers.** Three readers survived the cut-over still pointing at
`events` and were silently wrong until someone found them.

**One expander, not four.** `Routine`'s cadence, `Event`'s RRULE, FullCalendar's
and `reminders.py`'s each used to answer "when does this happen" separately, with
no way to tell which was right. `routers/occurrences.collect` is the one answer
and is callable in-process; everything that needs to know asks it. That is the
migration's point stated in a single function, and it is the rule most worth
keeping: if you find yourself expanding a recurrence, you are writing the fifth.


### Birthdays: two mechanisms, and how they should become one

Measured 2026-07-29: **2 people carry `people.birthday`; 9 birthdays exist as
yearly occasion rules** imported from the calendar. The two sets barely overlap,
and the calendar layer in `services/calendar/sources.ts` computes its own from
the first while knowing nothing of the second.

The unification is not a name match. `Casey's birthday` matches two Caseys,
`Melissa Birthday?` matches two Melissas, and `Mom's birthday`, `My Love's
Birthday`, `Dylan`, `Hayley` and `Darry` match nobody. Guessing here would file a
birthday onto the wrong person silently, which is worse than leaving it unfiled.

So:

1. **One mechanism: the rule.** The `birthday` layer in `sources.ts` goes.
   Birthdays arrive through `/occurrences` like everything else, and therefore
   appear on the timeline, in Coming Up, in reminders and on the person's page
   without any of those being taught about birthdays.
2. **`people.birthday` stays as the fact.** It is a date of birth — it carries a
   *year*, which is what gives an age, and a yearly rule has no year. It is not a
   schedule and should not be replaced by one.
3. **A derived rule is generated from it**, `source_ref = person:<uuid>:birthday`,
   `kind=occasion`, `months=[m]`, `day_of_month=d`, with a `subject` link to the
   person. The same device, and the same idempotence, as every other mirror.
4. **The nine imported series are filed by hand**, using the occasion triage the
   Inbox already has — a `subject` link to a person is exactly what it writes.

**Filing a birthday series onto a person must not set `people.birthday`.** Not a
judgement call — it follows from what the app is for. The thesis is agency in
resolving *potential* moments into *definite* ones, and the failure mode that
threatens is manufactured definiteness: a fact asserted that nobody actually
supplied. A yearly rule carries a month and a day and **no year**, so deriving a
date of birth from one would invent the very component that makes it useful — an
age. That is the `note_type`, `event_type` and imported-`mood` failure again,
where a plausible value nobody chose becomes indistinguishable from one somebody
did.

The two are different objects and stay so: `people.birthday` is a fact about a
person, the rule is a recurrence, and filing links them without merging them. A
person with no birth date is a person whose birth date we do not know, which is a
true and useful thing for the app to say.
