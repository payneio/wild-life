# The domain — what the concepts mean

> **This file holds definitions, not status.** What a concept *is*, where the
> definition comes from, and what it deliberately excludes. Nothing here says
> what is built, how many rows anything has, or what comes next — those claims
> rot at a different rate and their last home rotted the whole document with
> them. For what Postgres actually holds, read `erd.md`. For what a specific
> column means, read the docstring beside it in `models/`.
>
> A definition here can be *unmet* by the code. It cannot be *out of date*. If
> one is wrong, the domain changed or we were wrong about it — either way, argue
> with it rather than patching it to match the schema.

## Three kinds of thing

A life-management system holds three, and most of the difficulty in this
codebase came from having names for one and a half of them.

| | what it is | how it fails |
|---|---|---|
| **Occurrence** | something that happened | — it is a fact; it cannot fail |
| **Intention** | a commitment to bring something about | not discharged |
| **Attention** | a scope you allocate finite regard to | not examined |

They are **facets, not disjoint types**. A task carries an intention (it is due)
*and* an attention allocation (it is scheduled), and those fail independently: a
task never looked at did not fail as a commitment; it never got regard.

**Why three, and why not more.** The AI planning tradition supplies intention and
occurrence and has no concept of attention, because a planner's attention is
unbounded. Personal-productivity methodology supplies attention — GTD's
[Horizons of Focus](https://gettingthingsdone.com/2011/01/the-6-horizons-of-focus/)
is altitudes of *perspective*, and "Areas of Focus **& Responsibility**" is why
accountability attaches to a scope. Neither literature has all three. This model
looks bespoke because it is a join across two fields, not an invention.

---

## The concepts

Each definition is the test to apply when you are unsure whether something is one
of these.

### Attention

**Area** — *a standard you maintain indefinitely, not a goal you complete*
(GTD's Areas of Focus). If it can be finished, it is not an area. Areas never
end, which is why they attract claims that are never done rather than objectives
that get satisfied.

**Program** — a sustained effort inside an area, with a beginning and an
expected end. Where an area is a standard, a program is a campaign to move one.

**Project** — a bounded piece of work inside a program, finishable, with a next
action. The rung where most tasks hang.

Scopes **nest, one parent each**. Each carries a review cadence. **A cadence
declared at a scope is meant to apply to its descendants**; examination is not
inherited — reviewing a program covers its projects only if it says so. A scope
unexamined past its cadence is a failure of attention, at every altitude, and
that is a different failure from anything being overdue.

Accountability and responsibility are distinct and both attach to a scope
([RACI](https://en.wikipedia.org/wiki/Responsibility_assignment_matrix)):
Accountable does not move, Responsible does.

### Intention

**An intention names exactly one scope**, at any altitude, by one polymorphic
reference — not by a nullable foreign key per rung.

**It carries a window: two bounds that close on each other as the plan
sharpens.** `not_before` and `due_date`/`by_when`. A deadline alone cannot say
"not until the K-1 arrives", and it reports overdue the day after a soft season
in which nothing bad happened. **The window belongs to the intention. An
occurrence has none** — a thing that happened happened at a time.

**Task** — an intention to act, with a window and optionally a scheduled day.
Scheduling is an attention claim, not a commitment one; the two are separate
columns because they fail separately.

**Outcome** — an intention that a *claim become true*, rather than that an act be
performed. Satisfaction follows **monotonicity, not altitude**: a monotonic claim
("the paper is published") is satisfied at a moment and stays satisfied; a
non-monotonic one ("no important relationship neglected", "LDL under 100") has a
truth history, is evaluated by metric or at review, and is never completed.
Altitude does not decide which — areas attract non-monotonic claims only because
areas never end.

**An outcome must be evaluable to be live.** One with neither a metric nor a
review cadence is *inert*: nothing can ever change its truth value. Inert claims
are permitted — a claim you cannot yet measure is worth capturing — but they are
reported as inert rather than carried silently among claims that mean something.

**Contribution is not satisfaction.** A task may serve one or more outcomes, M:N
and optional; not everything you do serves a declared end. Drafting, editing and
submitting do not publish the paper.

**Endings have causes**: *discharged*, *abandoned*, *voided*. Not *revised* — a
revised commitment continues, so recording a revision as an ending closes
something still owed. Not *lapsed* — a lapse is a silence, derived from absence,
and telling a silence apart from a decision is the entire point of writing the
other three down.

**No cause carries a sign.** Revising because you should never have committed is
good judgement; revising because you keep deferring is not; revising because the
object ceased to exist is neither. Valence is a judgement recorded *as a moment
about the intention*, later and revisable.

### Occurrence

**Moment** — something that happened. It carries no window and no intention.
Its `started_at` may be in the future when the time is already settled: a meeting
next week is an occurrence awaiting arrival, not a range still closing.

**`kind` names the act**, never its subject, never its target type, never its
tense. A planned lunch and a lunch you ate are both `occasion`. Every kind is
written by the surface that creates the moment; no surface asks the user. The one
exception is `capture` — you typed something and have not said what it is — and
that *is* the inbox.

**A moment's relation to a thing is one of four roles**, closed and about the
*manner* of involvement rather than what is on the other end: `subject` puts the
moment on that thing's timeline, `mention` puts it in that thing's backlinks,
`participant` and `place` say who and where. A per-type vocabulary (`doses`,
`measures`) would restate kind plus target type.

**Moments and intentions relate two ways**, M:N in both directions: a moment may
**generate** intentions and may **discharge** them. One errand discharges three
commitments; one meeting generates two.

**Rule** — a statement of what recurs. Its occurrences are *computed, never
materialised*; a projection becomes a moment only when something happens to it.
`kind` says what its occurrences are, exactly as a moment's `kind` names an act.

---

## What this is not

- **Not BDI, though it borrows its line.** Commitment is what distinguishes
  intention from desire ([Bratman; Rao & Georgeff](https://cdn.aaai.org/ICMAS/1995/ICMAS95-042.pdf)),
  which is why endings record causes. But no beliefs, no desires, no plan
  library. **Deliberation is not represented** — competing routes live in prose,
  and the system's entry point is *commitment*. The journal is therefore
  architectural, not a feature: it holds the part of thinking the model declines
  to hold.
- **Not joint-intention theory.** RACI plus a staleness detector carries the
  usable content of collaborative commitment without mutual-belief logic.
- **Not event sourcing of the whole model.** Standing things are not folds over
  moments. Only intention and attention *state* is, because endings and appraisal
  need the history.
- **Not a planner.** Nothing propagates. If B must follow A, moving A does not
  move B. Adding that means Simple Temporal Networks, and it is a separate
  decision.

Prior art this rhymes with, for a reader who wants to check it:
[PROV-O](https://www.w3.org/TR/prov-o/) makes `Plan` an Entity and `Activity` an
occurrence, for the same reason satisfaction is separated from contribution.
[Lifestreams](https://www.cs.yale.edu/homes/freeman/lifestreams.html) put past and
future in one stream — that unification belongs in the *view*, and this model
keeps it there. [Dyreson & Snodgrass](https://dl.acm.org/doi/10.1145/288086.288087)
formalised the closing window as valid-time indeterminacy, and went further than
we do: theirs carries a distribution, ours only bounds. Cadence follows the
[HL7 FHIR Timing](https://www.hl7.org/fhir/datatypes.html#Timing) subset;
calendar interchange follows [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545);
addresses follow the intersection of vCard ([RFC 6350](https://datatracker.ietf.org/doc/html/rfc6350))
and schema.org `PostalAddress`.

---

## Core and external

**Core** is what would still mean something if every other system disappeared.
**External** is what exists only because another system exists. The test is that
question, applied to the concept rather than the table.

| | core | external |
|---|---|---|
| calendar | a moment, and who was in it | how it was shared: the iCalendar record, invites sent, RSVPs received, reminders fired |
| places | a location; a visit | the raw sensor feed, unpromoted candidates, the geocoder's cache |
| people | a person, an organization | — |
| notification | — | push subscriptions, nudges already sent |
| operations | — | the change feed, tokens, preferences, migration state |

Two rules follow, and both are worth keeping:

1. **Dependencies point one way: external may reference core; core may not
   reference external.** The calendar record keys on the moment, not the reverse;
   a visit references a location, not the reverse. This is currently true of
   every foreign key in the schema, and it is what makes an integration
   removable.
2. **A derived external record must be rebuildable and must not clobber authored
   data.** A visit is a fold over pings and can be recomputed; a moment you wrote
   cannot. That is why derived moments carry `source='derived'` — a rebuild has
   to be able to tell them apart.

---

## The scenarios

Specifications, not history. **A change to this model is legitimate only if every
one of these still has an answer.** Adding a scenario is how the model grows; it
is a claim about the domain, so it goes here where the next change is tested
against it.

These are competency questions: what the model must be able to *represent*. What
a person must be able to *do* is a different test and lives in `docs/scenarios.md`
(U1–U42) — the data model answered correctly in both interaction defects of
2026-07-30, so a change can satisfy every S and still be a regression.

**S1 · Deliberation becoming commitment.** Weeks of writing about being tired, no
commitment. Then a decision: sort the gut problem. It becomes a program with
measured objectives, a protocol, a project, tasks. At week six the doses stop.
Two weeks later you notice and restart.

**S2 · One act, several commitments.** A library book to return, a prescription
to collect, a parcel to post — three commitments in different scopes. One
Saturday trip discharges all three.

**S3 · An objective changing altitude.** "Get lipids under control" starts as a
standing concern under Health, becomes a program with numeric targets, and one
target later becomes the acceptance criterion of a twelve-week intervention. It
must remain the same objective throughout, or the audit loses the case most worth
auditing.

**S4 · Delegation that stalls, then declines.** You commit that a paper will be
published and delegate the draft. Three weeks of nothing. Then they decline. You
still owe it.

**S5 · A meeting that generates commitments.** At a recurring meeting three
decisions are made; you leave with two commitments, one yours and one on the
team's behalf.

**S6 · A vague intention sharpening.** "Sometime this summer, redo the deck" →
July → the 14th with a contractor booked. It rains; it happens on the 21st. A
revision may be a success, a failure, or neither — the commitment may have been
wrong to make, or its object may have ceased to exist.

**S7 · Two kinds of failure.** Forty open tasks: six overdue that you knew about,
twelve never looked at since capture. And a whole area unreviewed for months.

**S8 · The unplanned.** A friend calls in crisis and you spend the evening with
them. Nothing planned it, and it still belongs to your life.

**S9 · The claim that is never done.** "No important relationship neglected." It
is true or false today and can become false again.

---

## What the domain has not decided

Open questions about *what a concept is* — not about what is built. Each is a
question this file cannot currently answer, which is the only reason it is here.

**What is a request, and is it one concept or several?** Six overlapping answers
exist — `tasks`, `requests`, `commitments`, `delegations`, the
`POST /tasks/{id}/assignment` endpoint, and the `delegated`/`delivered` values
inside `TaskStatus` (see `erd.md` §4). The domain has a well-developed formal model for this — the
*conversation for action*: request, promise, performance, declaration of
satisfaction, with counter-offer and decline as first-class moves
([Winograd & Flores, 1986](https://en.wikipedia.org/wiki/Understanding_Computers_and_Cognition);
built as The Coordinator, later Action Workflow). What is undecided is whether
assigning a task, asking someone a question, and delegating an outcome are one
loop with different payloads or genuinely different concepts. Until that is
settled, S4 has four possible homes and no answer.

Two constraints already hold and any answer must keep them: **delegation moves
Responsible, never Accountable**; and **assignment and intention must not share a
state machine**, or "they said no" reads as "it is over". The second is currently
violated in one place — `TaskStatus` contains `delegated` and `delivered` — and
no row uses either value, so it is cheaper to fix now than it will ever be.

**Is a person assigned, or responsible, or both?** `tasks` carries
`assignee_id` and `responsible_id` and they name the same person on every row.
Either they are one concept with two names, or they are the RACI *R* and a
narrower "who is holding this right now" — in which case nothing has ever
written them apart. Until it is settled, any read that routes work must accept
both, because a writer that moves only one is otherwise invisible.

**Is a recurring task the same thing as a rule?** A rule states what recurs and
its occurrences are computed, never materialised. `tasks.recurrence` is a
separate mechanism with its own vocabulary and its own parser, which
materialises the next occurrence as a row when the current one completes.
Chained succession is a legitimate pattern and may be the right answer for
commitments specifically — a rule projects occasions, whereas only completing a
task tells you when the next one is due. But two cadence vocabularies is one
more than the model claims to have, and nothing has decided whether that is a
distinction or a duplication.

**Whose attention did a moment consume?** A moment has a duration and no actor.
That is a saving while one person writes every moment, and a defect the first
time an agent writes one.
