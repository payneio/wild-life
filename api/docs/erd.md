# The schema — an ERD

> **Status: description, not design.** Every table, column and foreign key below
> was read out of the live database on **2026-08-02**, not from the models and
> not from memory. If it disagrees with the code, the code is right and this file
> has rotted — regenerate it rather than patching it (the queries are at the
> bottom).
>
> The three documents in this folder answer different questions:
> `model.md` is **where the model is going** (axioms, phases, an explicit gap
> statement). `moments.md` is **why the moments model is shaped as it is**.
> This one is **what is actually in Postgres** — all 54 tables, nothing elided.

## How to read the diagrams

- **Solid lines** (`||--o{`) are real foreign keys. Every one below exists as a
  constraint in `wild_life`.
- **Dashed lines** (`||..o{`) are **soft polymorphic edges** — an
  `entity_type`/`entity_id` pair with no constraint behind it, because the target
  may be any of two dozen tables. They are drawn only to the types actually
  observed in the data; the permitted sets are tabulated in
  [Soft polymorphic edges](#soft-polymorphic-edges).
- **Row counts** are exact as of 2026-08-02 and appear as `(n)` in the section
  headings. `(0)` is called out wherever it appears, because an empty table is
  either unfinished work or a retirement in progress, and the difference matters.

---

## 0. The map

Nine clusters. `moments` is in the middle because everything dated hangs off it,
and the standing objects around the edge are what moments are *about*.

```mermaid
flowchart TB
    subgraph MOMENTS["Moments — what happened"]
        M[moments]
        ML[moment_links]
        CR[calendar_records]
    end

    subgraph RULES["Rules — what recurs"]
        R[routines]
    end

    subgraph ATT["Attention — scopes you allocate regard to"]
        A[areas] --> P[programs] --> PR[projects]
    end

    subgraph INT["Intention — what you have committed to"]
        T[tasks]
        O[outcomes]
        RQ[requests]
    end

    subgraph WHO["People & organizations"]
        PE[people]
        ORG[organizations]
    end

    subgraph MET["Metrics"]
        MT[metrics]
    end

    subgraph HLT["Health"]
        MED[medications]
        PRO[protocols]
    end

    subgraph PLC["Places"]
        LOC[locations]
    end

    subgraph INF["Infrastructure — not part of the model"]
        CL[change_log]
    end

    R -->|projects occurrences| M
    M --- ML
    M --- CR
    ML -. "subject / mention / participant / place" .-> ATT
    ML -.-> INT
    ML -.-> WHO
    ML -.-> MET
    ML -.-> HLT
    ML -.-> PLC
    T -. scope .-> ATT
    O -. scope .-> ATT
    MT -. scope .-> ATT
    T --> O
    M --> T
```

---

## 1. Moments — what happened (2,837 moments · 2,657 links)

A life is a series of moments; every other object is their *subject* rather than
their owner.

**A moment is what happened.** It carries no window and no intention — those live
on the intention (`tasks.not_before`/`due_date`, `outcomes.by_when`), where the
two ends close on each other as a plan sharpens. `moments.window_start`/
`window_end` did sit here once and all 485 ever written were zero-width, which is
what retired them along with the `work` kind (`c1d2e3f4a5b6`).

The apparent exception is not one. **6 rows have `started_at` in the future, all
`occasion`** — scheduled meetings, the furthest 2026-08-28. A meeting next week is
an occurrence whose time is already settled and has yet to arrive; that is not a
range still closing, which is the thing moments deliberately cannot express.
`started_at` is nullable but **null on none of the 2,837 rows**.

Payload hangs off the **link**, not the moment: a reading belongs to
*this moment concerning that metric*, so one measurement moment can carry a whole
panel. That is why `moment_readings` and `moment_doses` key on `link_id`.

```mermaid
erDiagram
    moments {
        uuid id PK
        text kind "MomentKind — 12 permitted, 10 in use"
        timestamptz started_at "nullable; null on 0 of 2,837 rows"
        timestamptz ended_at
        boolean all_day
        text title
        text body "prose; never null, may be empty"
        text source "authored | derived | imported"
        timestamptz withdrawn_at
        text withdrawal_reason
        text source_ref UK "task:uuid:completion — uq_moments_source_ref"
        uuid rule_id FK "set when projected from a rule"
        timestamptz occurrence_at UK "uq_moments_rule_occurrence (rule_id, occurrence_at)"
        timestamptz created_at
        timestamptz updated_at
    }
    moment_links {
        uuid id PK
        uuid moment_id FK
        text role UK "participant | place | subject | mention"
        text entity_type UK "soft link — no FK constraint"
        uuid entity_id UK "unique together with moment_id and role"
    }
    moment_readings {
        uuid link_id PK "FK to moment_links, not moments"
        float value
        text context
    }
    moment_doses {
        uuid link_id PK "FK to moment_links, not moments"
        float amount
        text unit
    }
    moment_images {
        uuid id PK
        uuid moment_id FK
        text filename
        text content_type
        integer sort_order
        timestamptz created_at
        timestamptz updated_at
    }
    calendar_records {
        uuid moment_id PK "1:1 — presence *is* shareability"
        text external_ref
        array attendees
        text organizer
        integer sequence "iCal SEQUENCE, told to other systems"
        text rsvp_status
        text rsvp_sent_status
        boolean invites_enabled
        text recurrence "raw RRULE when untranslatable"
        array recurrence_exdates
        uuid recurrence_parent_id FK
        timestamptz recurrence_id
        timestamptz cancelled_at
        text location
        text timezone "TZID captured at import"
        text invite_signature
    }
    sent_invites {
        uuid id PK
        uuid moment_id FK
        text attendee_email
        text method "REQUEST | CANCEL"
        integer sequence
        timestamptz created_at
        timestamptz updated_at
    }
    attendee_responses {
        uuid id PK
        uuid moment_id FK
        text attendee_email
        text partstat
        text comment
        integer sequence
        timestamptz responded_at
        timestamptz created_at
        timestamptz updated_at
    }
    sent_reminders {
        uuid id PK
        uuid moment_id FK
        timestamptz occurrence_start
        integer lead_minutes
        timestamptz created_at
        timestamptz updated_at
    }

    moments ||--o{ moment_links : "concerns"
    moments ||--o{ moment_images : "carries"
    moments ||--o| calendar_records : "is shareable as"
    moments ||--o{ sent_invites : "invited via"
    moments ||--o{ attendee_responses : "answered by"
    moments ||--o{ sent_reminders : "reminded of"
    moments ||--o{ calendar_records : "recurrence_parent_id"
    moment_links ||--o| moment_readings : "measured"
    moment_links ||--o| moment_doses : "dosed"
```

**Kinds in use** (`MomentKind` permits 12):

| kind | rows | | kind | rows |
|---|---:|---|---|---:|
| occasion | 1,316 | | activity | 60 |
| observation | 622 | | dose | 56 |
| completion | 424 | | decision | 8 |
| reflection | 257 | | visit | 7 |
| measurement | 86 | | capture | 1 |
| **exchange** | **0** | | **withdrawal** | **0** |

`work` was removed with its 402 rows (`c1d2e3f4a5b6`) — the window belonged to
the intention, so a shadow moment said the same thing twice. `exchange` and
`withdrawal` have never been written; `exchange` is the delegation half that has
not been built.

**Link roles**: `subject` 1,524 · `mention` 1,008 · `participant` 118 · `place` 7.

---

## 2. Rules — one cadence for everything that recurs (92)

`Routine` is a rule, not a habit. `kind` says what its occurrences *are*, exactly
as `Moment.kind` names an act. Occurrences are **computed, never materialised** —
a projection becomes a row in `moments` only when something happens to it.

```mermaid
erDiagram
    routines {
        uuid id PK
        text name "null for a dose — labelled by its medication"
        text kind "occasion 71 | dose 15 | activity 6"
        uuid area_id FK
        uuid program_id FK
        uuid protocol_id FK "nullable since 1ec77e09ce82"
        uuid medication_id FK
        uuid responsible_id FK
        text status "active | paused | archived"
        text frequency
        array preferred_days
        text preferred_time
        array timing "slots within the day"
        array days_of_week "striding selector"
        integer interval_days "stride; ignored when a selector is present"
        array months "calendar selector"
        integer day_of_month
        integer week_of_month
        text timezone "the zone the cadence is stated in"
        date start_date
        date end_date
        integer expected_minutes
        numeric amount
        text unit
        text tracking_method
        text rationale
        text source_ref
        integer sort_order
        timestamptz created_at
        timestamptz updated_at
    }
    rule_links {
        uuid id PK
        uuid rule_id FK
        text role
        text entity_type "soft link"
        uuid entity_id "soft link"
    }
    routine_instances {
        uuid id PK
        uuid routine_id FK
        uuid medication_id FK
        date scheduled_date
        text slot
        text status "pending | done | skipped"
        timestamptz completed_at
        numeric amount
        text unit
        boolean ad_hoc
        text context
        timestamptz created_at
        timestamptz updated_at
    }

    routines ||--o{ rule_links : "concerns"
    routines ||--o{ routine_instances : "logged as"
    routines ||--o{ moments : "projects (rule_id)"
```

`rule_links` holds 17 rows — 15 `subject/medication`, 2 `participant/person`.

---

## 3. Attention — the scopes (8 areas · 24 programs · 37 projects)

Scopes nest, one parent each. A cadence declared at a scope is meant to inherit;
`model.md` records that **inheritance is not implemented**, and that projects are
judged by `last_activity_date`, which is activity rather than examination.

```mermaid
erDiagram
    areas {
        uuid id PK
        text name
        text purpose
        text status
        text review_frequency
        uuid accountable_owner_id FK
        uuid responsible_lead_id FK
        timestamptz archived_at
        timestamptz created_at
        timestamptz updated_at
    }
    programs {
        uuid id PK
        text name
        text purpose
        uuid area_id FK
        text category
        text status
        date start_date
        date ended_date
        uuid accountable_owner_id FK
        uuid responsible_lead_id FK
        text review_frequency
        text reporting_cadence
        array involves
        timestamptz created_at
        timestamptz updated_at
    }
    projects {
        uuid id PK
        text name
        text purpose
        uuid program_id FK
        text status
        text priority
        date start_date
        date target_date
        uuid accountable_owner_id FK
        uuid responsible_lead_id FK
        text next_action
        date last_activity_date "activity, NOT examination"
        text review_frequency
        timestamptz created_at
        timestamptz updated_at
    }
    project_contributors {
        uuid project_id PK
        uuid person_id PK
    }
    reviews {
        uuid id PK
        text review_type
        date period_start
        date period_end
        array entities_reviewed
        text observations
        text decisions
        text risks
        text follow_up_actions
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
    }

    areas ||--o{ programs : "contains"
    programs ||--o{ projects : "contains"
    projects ||--o{ project_contributors : "staffed by"
    people ||--o{ areas : "owns / leads"
    people ||--o{ programs : "owns / leads"
    people ||--o{ projects : "owns / leads"
    people ||--o{ project_contributors : "contributes to"
```

`project_contributors` is **empty (0)**. `reviews` holds 3.

---

## 4. Intention — what has been committed to (470 tasks · 21 outcomes)

Two species today, and `model.md` phase 2 proposes giving them one shape. A task
names its scope by a **single polymorphic reference** (`scope_type`/`scope_id`) —
the three nullable rung FKs are gone, and so is the check constraint that
policed them.

```mermaid
erDiagram
    tasks {
        uuid id PK
        text title
        text description
        text status
        text priority
        text scope_type "soft — area | program | project"
        uuid scope_id "soft"
        uuid accountable_owner_id FK
        uuid responsible_id FK
        uuid assignee_id FK
        uuid claimed_by_id FK "cooperative lock"
        timestamptz claimed_at
        boolean acceptance_required
        date not_before "window opens"
        date due_date "window closes"
        date scheduled_date "when I mean to touch it"
        time scheduled_time
        integer estimated_minutes
        text recurrence
        uuid blocked_by_task_id FK
        text waiting_on
        text ending_cause "discharged | abandoned | voided"
        text ending_note
        timestamptz completed_at
        float position
        timestamptz created_at
        timestamptz updated_at
    }
    outcomes {
        uuid id PK
        text statement
        text kind "standard | target — this IS monotonicity"
        text description
        text entity_type "soft scope reference"
        uuid entity_id "soft"
        text status
        uuid metric_id FK
        float target_min
        float target_max
        float baseline
        date not_before
        date by_when
        timestamptz satisfied_at
        text ending_cause
        text ending_note
        timestamptz created_at
        timestamptz updated_at
    }
    outcome_evaluations {
        uuid id PK
        uuid outcome_id FK
        timestamptz evaluated_at
        boolean holds "the truth history of a standing claim"
        text note
        timestamptz created_at
        timestamptz updated_at
    }
    task_objectives {
        uuid id PK
        uuid task_id FK
        uuid outcome_id FK
        timestamptz created_at
        timestamptz updated_at
    }
    intention_moments {
        uuid id PK
        text intention_type "soft — task"
        uuid intention_id "soft"
        uuid moment_id FK
        text role "discharges | generates"
        timestamptz created_at
        timestamptz updated_at
    }
    requests {
        uuid id PK
        uuid requester_id FK
        uuid addressee_id FK
        text external_label
        text kind "question | decision | input | deliverable"
        text subject
        text body
        text entity_type "soft"
        uuid entity_id "soft"
        date needed_by
        date follow_up_date
        text status
        text resolution
        timestamptz resolved_at
        text last_communication
        text next_action
        timestamptz created_at
        timestamptz updated_at
    }
    commitments {
        uuid id PK
        text description
        uuid owner_id FK
        uuid beneficiary_id FK
        uuid responsible_id FK
        date date_made
        date due_date
        text status
        text evidence
        text acceptance_status
        text entity_type "soft"
        uuid entity_id "soft"
        timestamptz created_at
        timestamptz updated_at
    }
    delegations {
        uuid id PK
        uuid delegator_id FK
        uuid responsible_id FK
        uuid accountable_owner_id FK "accountability does not fan out"
        text requested_outcome
        text instructions
        text priority
        text status
        date date_delegated
        date expected_completion_date
        date follow_up_date
        date last_contact_date
        date delivered_date
        date accepted_date
        boolean acceptance_required
        text latest_update
        text completion_evidence
        integer escalation_level
        text entity_type "soft"
        uuid entity_id "soft"
        timestamptz created_at
        timestamptz updated_at
    }
    dependencies {
        uuid id PK
        text dependent_type
        uuid dependent_id
        text blocker_type
        uuid blocker_id
        timestamptz created_at
        timestamptz updated_at
    }

    tasks ||--o{ task_objectives : "serves"
    outcomes ||--o{ task_objectives : "served by"
    outcomes ||--o{ outcome_evaluations : "judged at review"
    tasks ||--o{ tasks : "blocked_by_task_id"
    outcomes }o--o| metrics : "measured by"
    moments ||--o{ intention_moments : "discharges / generates"
    people ||--o{ requests : "requester / addressee"
    people ||--o{ commitments : "owner / beneficiary / responsible"
    people ||--o{ delegations : "delegator / responsible / accountable"
    people ||--o{ tasks : "accountable / responsible / assignee / claimed_by"
```

Where the intention cluster actually stands:

| table | rows | reading |
|---|---:|---|
| `tasks` | 470 | live; 460 scoped to a project, 5 to a program, 4 to an area, 1 unscoped |
| `intention_moments` | 423 | **all `discharges`** — the `generates` edge has 0 rows |
| `outcomes` | 21 | 11 on areas, 10 on programs |
| `requests` | 3 | live but barely used |
| `outcome_evaluations` | **0** | the truth history is built and unwritten |
| `task_objectives` | **0** | means-end edges exist as a table only |
| `commitments` | **0** | pre-inversion; folds into `requests` |
| `delegations` | **0** | pre-inversion; folds into `requests` |
| `dependencies` | **0** | superseded by `tasks.blocked_by_task_id` |

Task assignment, by contrast, *is* in use: 447 tasks carry an `assignee_id`.
`claimed_by_id` and `acceptance_required` are 0 — the loop is half-built, not
abandoned.

---

## 5. People & organizations (315 people · 106 orgs)

```mermaid
erDiagram
    people {
        uuid id PK
        text name
        text nickname
        text relationship
        text role
        text job_title
        jsonb emails
        jsonb phones "stored E.164"
        jsonb addresses
        array websites
        text preferred_contact
        date birthday "the fact; a yearly rule is the recurrence"
        jsonb important_dates
        text photo_url
        text specialty "clinician facet"
        text patient_id
        text portal_url
        timestamptz created_at
        timestamptz updated_at
    }
    organizations {
        uuid id PK
        text name
        text org_type
        text industry
        text website
        text email
        text phone
        text street
        text unit
        text city
        text region
        text postcode
        text country
        text description
        text status
        timestamptz created_at
        timestamptz updated_at
    }
    affiliations {
        uuid id PK
        uuid person_id FK
        uuid organization_id FK
        text role
        boolean is_primary
        date start_date
        date end_date
        timestamptz created_at
        timestamptz updated_at
    }
    api_tokens {
        uuid id PK
        text label
        text token_hash
        uuid person_id FK
        text role "full | worker"
        timestamptz revoked_at
        timestamptz created_at
        timestamptz updated_at
    }

    people ||--o{ affiliations : "affiliated with"
    organizations ||--o{ affiliations : "employs"
    people ||--o{ api_tokens : "acts through"
```

`api_tokens` holds 3, all `role='worker'` — the agents.

---

## 6. Health (20 medications · 6 protocols)

A medication is an **identity**; protocols own all scheduling, and every schedule
is a rule (§2). There is no PRN flag and no `notes` column — `adjustments`,
`instructions` and `reason` are each named for the question they answer.

```mermaid
erDiagram
    medications {
        uuid id PK
        text name
        text brand
        text med_type
        text reason
        text instructions
        text adjustments
        uuid prescriber_id FK
        uuid pharmacy_id FK
        uuid program_id FK
        timestamptz created_at
        timestamptz updated_at
    }
    protocols {
        uuid id PK
        text name
        text category
        text purpose
        uuid program_id FK
        uuid provider_id FK
        date start_date
        date end_date
        text duration
        boolean paused
        text adjustments
        timestamptz created_at
        timestamptz updated_at
    }
    allergies {
        uuid id PK
        text substance
        text allergy_type
        text reaction
        text severity
        text status
        date noted_on
        timestamptz created_at
        timestamptz updated_at
    }
    insurance_plans {
        uuid id PK
        text name
        text plan_type
        uuid organization_id FK
        text network
        text member_id
        text group_number
        text rx_bin
        text rx_pcn
        text rx_group
        text phone
        text status
        timestamptz created_at
        timestamptz updated_at
    }

    people ||--o{ medications : "prescribes"
    organizations ||--o{ medications : "dispenses"
    programs ||--o{ medications : "part of"
    programs ||--o{ protocols : "part of"
    people ||--o{ protocols : "provides"
    organizations ||--o{ insurance_plans : "issues"
    medications ||--o{ routines : "dosed by"
```

`allergies` 1 · `insurance_plans` 3.

---

## 7. Metrics (80 metrics · 325 entries)

A metric names a scope polymorphically, the same way an outcome does. A *group*
is a panel taken together — a lipid panel is one draw with six numbers — which is
why `group_readings` exists between the group and its entries.

```mermaid
erDiagram
    metrics {
        uuid id PK
        text name
        text unit
        text entity_type "soft — area 66 | program 14"
        uuid entity_id "soft"
        text source "manual | derived"
        text derivation
        uuid numerator_metric_id FK
        uuid denominator_metric_id FK
        float reference_min
        float reference_max
        text measurement_frequency
        text data_source
        text scale
        timestamptz created_at
        timestamptz updated_at
    }
    metric_groups {
        uuid id PK
        text name
        text entity_type "soft"
        uuid entity_id "soft"
        text description
        timestamptz created_at
        timestamptz updated_at
    }
    group_members {
        uuid id PK
        uuid group_id FK
        uuid metric_id FK
        integer position
        timestamptz created_at
        timestamptz updated_at
    }
    group_readings {
        uuid id PK
        uuid group_id FK
        timestamptz recorded_at
        text context
        timestamptz created_at
        timestamptz updated_at
    }
    metric_entries {
        uuid id PK
        uuid metric_id FK
        uuid group_reading_id FK
        timestamptz recorded_at
        float value
        text context
        timestamptz created_at
        timestamptz updated_at
    }

    metric_groups ||--o{ group_members : "contains"
    metrics ||--o{ group_members : "member of"
    metric_groups ||--o{ group_readings : "read as a panel"
    group_readings ||--o{ metric_entries : "yields"
    metrics ||--o{ metric_entries : "recorded as"
    metrics ||--o{ metrics : "numerator / denominator"
```

**Measurement is stored on both sides, and the moment side is derived.**
`record_moments.py` writes the moment from the metric write, in one transaction:
`record_metric_entry` for a standalone entry (`source_ref=metric_entry:<id>`) and
`record_reading` for a whole panel (`source_ref=group_reading:<id>`), the latter
folding a panel's members into **one** measurement moment carrying many readings.

**It reconciles exactly**, on both counts:

| | |
|---|---:|
| panels · standalone entries | 58 · 28 |
| `measurement` moments (58 + 28) | **86** |
| `metric_entries` | 325 |
| `moment_readings` | **325** |

Nothing enforces that correspondence, though — there is no constraint and no
test. It holds because one writer produces both.

---

## 8. Places (69 locations · 62 pings)

The only cluster with a raw sensor feed. `location_visits` are *derived* — a
visit is a fold over pings — which is the property a rebuild must respect, and
the reason visit moments carry `source='derived'`.

```mermaid
erDiagram
    locations {
        uuid id PK
        text name
        text category
        text street
        text unit
        text city
        text region
        text postcode
        text country
        text description
        float latitude
        float longitude
        float radius_m "geofence"
        timestamptz geo_dirty_at
        timestamptz created_at
        timestamptz updated_at
    }
    location_pings {
        bigint id PK
        text device_id
        timestamptz recorded_at
        timestamptz received_at
        float latitude
        float longitude
        float accuracy_m
        float altitude_m
        float velocity_kmh
        float course_deg
        integer battery_pct
        integer battery_state
        text trigger
        text connection
        text message_type
        text transition_event
        jsonb raw
    }
    location_visits {
        uuid id PK
        uuid location_id FK
        timestamptz entered_at
        timestamptz exited_at
        timestamptz last_seen_inside_at
        integer pending_exit_count
        integer ping_count
        bigint first_ping_id
        bigint last_ping_id
        text close_reason
        text source
        timestamptz created_at
        timestamptz updated_at
    }
    place_candidates {
        uuid id PK
        float centroid_lat
        float centroid_lon
        float radius_m
        integer stop_count
        bigint total_seconds
        timestamptz first_seen_at
        timestamptz last_seen_at
        timestamptz dismissed_at
        uuid promoted_location_id FK
        text label_hint
        timestamptz created_at
        timestamptz updated_at
    }
    geocode_cache {
        uuid id PK
        text provider
        text coord_key
        text display_name
        text name
        text house_number
        text road
        text city
        text region
        text postcode
        text country
        jsonb raw
        timestamptz fetched_at
    }

    locations ||--o{ location_visits : "visited"
    locations ||--o{ place_candidates : "promoted from"
    location_visits }o..o{ location_pings : "folded from (no FK)"
```

`location_visits` 7 · `place_candidates` 2 · `geocode_cache` 2.

---

## 9. Infrastructure — deliberately outside the model

These are not domain objects. `change_log` is the write-ahead feed that drives
`LISTEN/NOTIFY` → SSE → a global React Query invalidation. The whiteboard is one
buffer, not a collection: `__audit__ = False`, absent from `EntityType` and from
`change_log`, because a scratch space has no subject, no date and no identity.

```mermaid
erDiagram
    change_log {
        uuid id PK
        text entity_type
        uuid entity_id
        text entity_label
        text action
        jsonb changes
        timestamptz created_at
    }
    entity_links {
        text source_type PK
        uuid source_id PK
        text target_type PK
        uuid target_id PK
        text relation "attendee 443 | diagnosed_by 4"
    }
    resources {
        uuid id PK
        text title
        text resource_type
        text url
        text description
        text entity_type "soft"
        uuid entity_id "soft"
        timestamptz created_at
        timestamptz updated_at
    }
    decisions {
        uuid id PK
        text question
        text options_considered
        text decision
        text rationale
        text assumptions
        uuid owner_id FK
        date decided_on
        date review_date
        text entity_type "soft"
        uuid entity_id "soft"
        timestamptz created_at
        timestamptz updated_at
    }
    whiteboard {
        integer id PK "single row"
        text content
        integer version
        timestamptz updated_at
    }
    whiteboard_revisions {
        uuid id PK
        text content
        integer version
        timestamptz replaced_at
    }
    push_subscriptions {
        uuid id PK
        text endpoint
        text p256dh
        text auth
        text label
        timestamptz created_at
        timestamptz updated_at
    }
    sent_nudges {
        uuid id PK
        text kind
        date nudge_date
        timestamptz created_at
        timestamptz updated_at
    }
    preferences {
        text key PK
        jsonb value
        timestamptz updated_at
    }
    alembic_version {
        varchar version_num PK
    }

    people ||--o{ decisions : "owns"
```

`change_log` 73,418 · `entity_links` 447 · `resources` 70 · `sent_nudges` 16 ·
`decisions` 8 · `whiteboard` 1 · `push_subscriptions` 2 · `preferences` **0**.

---

## Soft polymorphic edges

Fourteen places where a reference has no constraint behind it, because the target
may be any of the types in `EntityType`. This is the price of one moments table
rather than many, and it is paid knowingly — but it means **referential integrity here is
the application's job, not Postgres's**.

| table | columns | permitted | observed |
|---|---|---|---|
| `moment_links` | `entity_type` / `entity_id` | all of `EntityType` (22) | task 827 · person 787 · metric 325 · project 144 · location 123 · organization 113 · area 108 · program 66 · medication 61 · routine 54 · moment 40 · decision 8 · request 1 |
| `rule_links` | `entity_type` / `entity_id` | all | medication 15 · person 2 |
| `tasks` | `scope_type` / `scope_id` | area, program, project | project 460 · program 5 · area 4 · null 1 |
| `outcomes` | `entity_type` / `entity_id` | any scope | area 11 · program 10 |
| `metrics` | `entity_type` / `entity_id` | any scope | area 66 · program 14 |
| `metric_groups` | `entity_type` / `entity_id` | any scope | — |
| `intention_moments` | `intention_type` / `intention_id` | task, outcome | task 423 |
| `requests` | `entity_type` / `entity_id` | all | — |
| `commitments` | `entity_type` / `entity_id` | all | *(empty table)* |
| `delegations` | `entity_type` / `entity_id` | all | *(empty table)* |
| `dependencies` | `dependent_*` / `blocker_*` | all | *(empty table)* |
| `resources` | `entity_type` / `entity_id` | all | — |
| `decisions` | `entity_type` / `entity_id` | all | — |
| `entity_links` | `source_*` / `target_*` | all | attendee 443 · diagnosed_by 4 |
| `change_log` | `entity_type` / `entity_id` | all + non-entities | — |

`EntityType` deliberately **excludes `event`, `note` and `protocol_item`**: each
names a table that no longer exists, and a type that can be named but not
constructed is a constructor for something that cannot exist. `protocol_item`
outlived its table until this survey found it, having pointed at nothing in any
column above — which is exactly what kept it invisible.

---

## What the ERD makes visible

Two things are easier to see here than in the code, stated as observations
rather than proposals.

**1. The empty tables split into two kinds.** `commitments`, `delegations` and
`dependencies` are *pre-inversion* — superseded, awaiting retirement.
`outcome_evaluations`, `task_objectives`, `project_contributors` and
`preferences` are the opposite: structure built ahead of the surfaces that
would write to it. Reading either group as "unused, therefore droppable" would be
a mistake in one of the two directions.

**2. Attention has no representation.** Every moment has a duration
(`started_at`→`ended_at`) and nothing records whose attention it consumed, because
`moments` was built by inverting nine tables that were all one person's. It
has no actor column. As long as only one person writes moments this is a saving;
the first agent that writes one makes it a defect.

---

## Regenerating this

```bash
export PGPASSWORD="$(wildpc secret get POSTGRES_PASSWORD)"
PSQL="psql -h localhost -U castle -d castle -At -F|"

# tables + exact row counts
$PSQL -c "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='wild_life' AND relkind='r' ORDER BY 1;"

# every column, in order, with nullability
$PSQL -c "SELECT table_name, ordinal_position, column_name, data_type, is_nullable
          FROM information_schema.columns WHERE table_schema='wild_life'
          ORDER BY table_name, ordinal_position;"

# every foreign key
$PSQL -c "SELECT src.relname||'|'||ka.attname||'|'||tgt.relname
          FROM pg_constraint con
          JOIN pg_class src ON src.oid=con.conrelid
          JOIN pg_class tgt ON tgt.oid=con.confrelid
          JOIN pg_namespace n ON n.oid=src.relnamespace
          JOIN pg_attribute ka ON ka.attrelid=src.oid AND ka.attnum=con.conkey[1]
          WHERE con.contype='f' AND n.nspname='wild_life' ORDER BY 1;"
```
