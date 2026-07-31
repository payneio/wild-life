# The model — attention, intention, occurrence

> **Status: design record, not description.** The code does not implement this.
> It is the target the model is being moved toward, and the gap is stated at the
> bottom. If you read a claim here as a fact about the current schema you will be
> wrong. Everything in `moments.md` *is* description; this is the thing it is
> becoming.

A life-management system has to hold three different kinds of thing, and most of
the difficulty in this codebase has come from having names for one and a half of
them.

| | what it is | how it fails |
|---|---|---|
| **Occurrence** | something that happened | — it is a fact; it cannot fail |
| **Intention** | a commitment to bring something about | not discharged |
| **Attention** | a scope you allocate finite regard to | not examined |

They are **facets, not disjoint types**: a task carries an intention (it is due)
*and* an attention allocation (it is scheduled), and those fail independently. A
task never looked at did not fail as a commitment; it never got regard.

## Why three, and why not more

The AI planning tradition supplies intention and occurrence and has no concept of
attention, because a planner's attention is unbounded. Personal-productivity
methodology supplies attention — GTD's [Horizons of Focus](https://gettingthingsdone.com/2011/01/the-6-horizons-of-focus/)
is altitudes of *perspective*, and "Areas of Focus **& Responsibility**" is why
accountability attaches to a scope. Neither literature has all three. That is the
reason this model looks bespoke: it is a join across two fields, not an invention.

The commitments deliberately **not** taken, each of which some neighbouring model
would take: beliefs, desires, a plan library, joint mental states. See *What this
is not*.

---

## The axioms

Each names the scenario that forces it. Scenarios are in the next section and are
**specifications, not history** — a change to this model is legitimate only if
every scenario still has an answer.

**A1 · Attention.** Scopes nest, one parent each. Each has a review cadence
(declared or inherited — A10).
Examination is a recorded act; a scope unexamined past its cadence is a failure
of attention, at every altitude. *(S7)*

**A2 · Intention.** An intention names exactly one scope, at any altitude, by one
polymorphic reference — not by a nullable foreign key per rung. It carries RACI
and a window. *(S2, S8)*

**A3 · Satisfaction follows monotonicity, not altitude.** A *monotonic* claim
("the paper is published") is satisfied at a moment and stays satisfied. A
*non-monotonic* one ("no important relationship neglected", "LDL under 100") has
a truth history, is evaluated by a metric or at review, and is never completed.
Altitude does not determine which; an area attracts non-monotonic claims only
because areas never end. *(S3, S9)*

**A4 · Moments and intentions relate two ways.** A moment may **generate**
intentions and may **discharge** them, M:N in both directions. One errand
discharges three commitments; one meeting generates two. *(S2, S5)*

**A5 · Endings have causes.** *Discharged · abandoned · voided* are recorded
acts. **Not *revised***, which this axiom listed until building it showed the
error: a revised commitment continues — the deck moving from the 14th to the
21st is still owed on the 21st — so recording a revision as an ending closes
something still open. Revisions are acts written about the intention, where A6
puts appraisal. *Lapsed* stays derived from absence and never written: a lapse
is a silence, and telling it apart from a decision is the point. *(S1, S4, S6)*

**A6 · Valence is not structural.** No cause carries a sign. Revising because you
should never have committed is good judgment; revising because you keep deferring
is not; revising because the object ceased to exist is neither. Valence is a
judgment recorded *as a moment about the intention*, later and revisable — which
is possible only because a moment may be about a first-class thing. *(S6)*

**A7 · Assignment is its own lifecycle.** Delegation moves Responsible, never
Accountable. A decline ends the assignment and returns responsibility; it does
not end the intention. These two lifecycles must not share a state machine, or
"they said no" reads as "it is over". *(S4)*

**A8 · Deliberation is not represented.** Competing routes live in prose. The
system's entry point is *commitment* — which is the line Bratman draws between
desire and intention, and taking it is what makes a plan library unnecessary.
The Journal is therefore architectural, not a feature: it holds the part of
thinking the model declines to hold. *(S1)*

**A9 · Means and ends.** A task may serve one or more objectives, M:N and
optional — not everything you do serves a declared end. **Contribution is not
satisfaction**: an objective is satisfied when its claim holds, never by its
contributing tasks completing. Drafting, editing and submitting do not publish
the paper. *(S4)*

**A10 · Cadence inherits, examination does not.** A review cadence declared at a
scope applies to its descendants unless overridden, so a hierarchy does not
require a declaration per node. Examination remains an explicit act naming the
scopes it covered — reviewing a program may cover its projects, but only if it
says so. *(S7)*

**A11 · An objective must be evaluable to be live.** One with neither a metric
nor a review cadence is *inert*: nothing can ever change its truth value. It is
permitted — a claim you cannot yet measure is still worth capturing — but it is
reported as inert rather than silently carried among claims that mean something.
*(S9)*

### One consequence worth stating separately

A3 says a non-monotonic claim is evaluated at review. A1 says a scope is examined
at review. **These are the same act.** Looking at a scope is when its standing
claims get their truth value. That makes review load-bearing rather than
reporting, and it makes precise what is wrong with a claim that has neither a
metric nor a review: nothing can ever change its truth value, so it is inert.

---

## The scenarios

**S1 · Deliberation becoming commitment.** Weeks of writing about being tired, no
commitment. Then a decision: sort the gut problem. It becomes a program with
measured objectives, a protocol, a project, tasks. At week six the doses stop. Two
weeks later you notice and restart.

**S2 · One act, several commitments.** A library book to return, a prescription to
collect, a parcel to post — three commitments in different scopes. One Saturday
trip discharges all three.

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
July → the 14th with a contractor booked. It rains; it happens on the 21st.

**S7 · Two kinds of failure.** Forty open tasks: six overdue that you knew about,
twelve never looked at since capture. And a whole area unreviewed for months.

**S8 · The unplanned.** A friend calls in crisis and you spend the evening with
them. Nothing planned it, and it still belongs to your life.

**S9 · The claim that is never done.** "No important relationship neglected." It
is true or false today and can become false again.

---

## What this is not

- **Not BDI, though it borrows its line.** Commitment distinguishes intention from
  desire ([Bratman; Rao & Georgeff](https://cdn.aaai.org/ICMAS/1995/ICMAS95-042.pdf)),
  and reconsideration is why A5 records causes. But no beliefs, no desires, no
  plan library — A8 puts deliberation in prose instead.
- **Not joint-intention theory.** RACI plus a staleness detector carries the
  usable content of collaborative commitment without mutual-belief logic.
- **Not event sourcing of the whole model.** Standing things are not folds over
  moments. Only intention and attention *state* is, because A5 and A6 need the
  history.
- **Not a planner.** Nothing propagates. If B must follow A, moving A does not
  move B. Adding that means Simple Temporal Networks, and it is a separate
  decision.

Prior art the model rhymes with, for a reader who wants to check it:
[PROV-O](https://www.w3.org/TR/prov-o/) makes `Plan` an Entity and `Activity` an
occurrence, for A3's reason. [Lifestreams](https://www.cs.yale.edu/homes/freeman/lifestreams.html)
put past and future in one stream — that unification is in the *view*, and this
model keeps it there. [Dyreson & Snodgrass](https://dl.acm.org/doi/10.1145/288086.288087)
formalised the window as valid-time indeterminacy, and went further than we do:
theirs carries a distribution, ours only bounds.

---

## Where the implementation stands, and in what order

Honest gap, because a design record read as description is how docs start lying.
Every row was checked against the schema rather than asserted. The **phase**
column is the plan: phases are ordered by dependency, and each one leaves the app
working — nothing here is a flag day.

| # | axiom | state | phase |
|---|---|---|---|
| 1 | windows | ✗ every window is zero-width and `expected_minutes` never set. **Subsumed by phase 2**, which deletes these columns — fixing writers for a column already scheduled for removal is motion, not progress | ~~0~~ → 2 |
| 2 | A11 inert objectives | ✓ done — reported on the review dashboard | ~~0~~ |
| 3 | A1/A10 cadence + examination | ~ cadence on areas and programs, **not** projects; no inheritance; projects judged by `last_activity_date`, which is activity, **not** examination | **0** |
| 4 | A2 one scope reference | ✓ done — `tasks.scope_type`/`scope_id`; the `ck_tasks_single_parent` check is gone because the shape it enforced is now unrepresentable | ~~1~~ |
| 5 | A2 intention as a type | ✗ intention is spread over 14 tables with no common shape | **2** |
| 6 | A3 monotonicity | ~ `standard`/`target` *is* monotonicity, correctly defined — kept rather than renamed. `outcome_evaluations` built with `POST /outcomes/{id}/evaluations`; the review surface does not yet prompt for one | 2 |
| 7 | A4 generate / discharge · A9 means-end | ~ `discharges` written and retracted; `generates` written via `generated_by_moment_id` on task create; 419 edges backfilled. `task_objectives` has no writer — no surface asks what a task is *for* yet | 3 |
| 8 | A5 causes · A6 valence | ✓ `ending_cause` on both species (`discharged`/`abandoned`/`voided`); lapse still derived. Valence works by writing about the intention | ~~4~~ |
| 9 | A7 assignment lifecycle | ✓ `POST /tasks/{id}/assignment` — offer/accept/decline/withdraw moves Responsible only, recorded as a moment. RACI still lives on the row rather than on a separate intention type | ~~5~~ |
| — | A8 deliberation in prose | ✓ the Journal — though nothing marks where prose becomes commitment | — |

**Phase 0 — needs no new structure.** Stop collapsing windows; report inert
objectives; give projects a cadence and derive examination from review events
rather than from activity. Independently useful even if the rest never happens.

**Phase 1 — one scope reference.** Replace the three nullable FKs on `tasks`
with the polymorphic reference `outcomes` already uses. Contained, and it makes
the attention hierarchy a strict tree, so delegation becomes a subtree operation.

**Phase 2 — intention as a type.** The load-bearing phase. Two species —
task and objective — sharing one shape: scope reference, RACI, window, ending.
**Two tables, not one:** their payloads differ (metric binding versus
scheduling), and merging them would reproduce the 85–100% null columns that were
just removed from `moments`.

**Phase 3 — the edges.** Generate, discharge (M:N), and means-end. This is what
makes "how do intentions become outcomes" a query rather than string surgery, and
it is the point of the whole exercise.

**Phase 4 — endings and valence.** Causes recorded, lapse still derived, appraisal
written as a moment about the intention.

**Phase 5 — assignment.** RACI moves onto intentions; delegation and decline
become events on the assignment rather than on the commitment.

**What disappears on the way.** `moments.window_start`/`window_end`/
`expected_minutes`/`withdrawn_at`/`withdrawal_reason`, once intention lives on
intentions; the `work` kind, since a scheduled task *is* the intention and needs
no shadow moment; and `tasks.area_id`/`program_id`.

## How to use this

A change is legitimate if every scenario still has an answer. That is the test —
not whether it matches the axioms as worded, since the wording is a summary of
the scenarios and not the other way round.

This is TOVE's informal path: motivating scenarios, discriminating questions,
answers checked for consistency. The competency questions have **not** been
formalised in logic and no completeness theorem has been proved. "Closed" here
means no scenario yet constructed breaks it.
