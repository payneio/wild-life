# Use scenarios — what must be doable

Companion to `api/docs/domain.md` → *The scenarios*. Those (S1–S9) are competency
questions: what the model must be able to **represent**. These (U1–U42) are use
scenarios in Carroll's sense: what a person must be able to **do**, with the
constraints they are actually under when they do it.

The distinction earns its own file because the failures differ. The data model
answered fine on 2026-07-30 when a calendar slot offered nowhere to take notes,
and again when a recurring item could not reach the routine behind it. No S
scenario catches either. These do.

**The form.** Each scenario names the situation with its real constraints, what
must work *without being told how*, and the failure it guards against. Where the
guard is dated, it happened.

**How to use it.** `change-the-model` asks "which scenario forces this?" — a U
number is as good an answer as an S number. A change that breaks a U is a
regression even when every table still answers. Adding one is how the surface
grows; write it before the feature, not after, or it is a justification rather
than a specification.

**This file says nothing about what is built.** Like `domain.md`, a claim here
may be unmet but cannot be out of date.

---

## A · Capture and triage

**U1 · The thought with nowhere to go.** Mid-conversation, phone, eight seconds.
Something matters and you have no idea what it belongs to yet.
*Must work:* write it and put it down, naming nothing — no type, no project, no
date. It reappears somewhere that will not let you forget it.
*Guards:* a capture surface that asks a required question is a surface you stop
using; the thought then lives in your head or in another app.
*Exercises:* S8.

**U2 · Emptying the inbox.** Sunday, laptop, twenty unfiled things.
*Must work:* say what each is *about* and have it leave the inbox, without
opening it, without choosing a genre, and without inventing a project to hold it.
*Guards:* triage that costs more than recapture.

**U3 · The thing that is already about something.** You are looking at a project
and want to write a paragraph about it.
*Must work:* write it from there; it is filed by the act of writing, not by a
subsequent step, and it appears on that project's log immediately — not after a
tick.
*Guards:* the lag that made writing feel unrecorded, and the `notes` column every
object grows when it has nowhere to write.

**U4 · Naming a person mid-sentence.** Typing prose, you reach someone's name.
*Must work:* `@` completes them, in *every* composer, including immediately after
punctuation, and the reference survives as a link rather than as text.
*Guards:* 2026-07-30 — the trigger worked in one composer and not another, which
is worse than not existing, because you cannot tell which surfaces to trust.

**U5 · Writing with a picture.** You photographed the cabinet options.
*Must work:* attach it to what you wrote, inline, and see it wherever that
writing appears.
*Guards:* prose surfaces that silently cannot hold what you were looking at.

---

## B · The day

**U6 · Opening the app at 7am.** One minute, half attention.
*Must work:* what is scheduled or due today, what is happening today, and what has
been neglected — on one screen, without navigating. If there is nothing, it says
so plainly rather than showing an empty frame.
*Guards:* a landing page that requires a decision before it tells you anything.

**U7 · Yesterday, read back.** You want to see what a day actually contained.
*Must work:* one stream, everything — prose, doses, meetings, measurements,
completions — grouped by the day *you* were in, not the day UTC was in.
*Guards:* 2026-07-28 — doses logged in the evening appeared on the following day
for every reader west of Greenwich.

**U8 · The unplanned evening.** A friend calls in crisis; you spend the evening
with them. Nothing planned it.
*Must work:* record it afterwards as something that happened, with the person on
it, without a task, a project, or a prior intention to attach it to.
*Guards:* a system that can only describe what it predicted.
*Exercises:* S8.

---

## C · Commitment and planning

**U9 · One line, then gone.** You know the next action; you do not want a form.
*Must work:* type a title in the list you are already looking at, commit it, keep
typing the next one. The new row is visible where you are, so a mistake is
deletable in place.
*Guards:* orphans created by a modal that navigated away.

**U10 · The soft season.** "Redo the deck sometime this summer."
*Must work:* express both ends — not before June, not after August — and not be
told it is overdue on September 1 for a season in which nothing bad happened.
*Guards:* the four days a deadline was the only bound available.
*Exercises:* S6.

**U11 · Waiting on the world.** The tax return cannot start until the K-1 arrives
in mid-February.
*Must work:* say so, and have the task become available if the K-1 comes early —
rather than hiding until a day you picked as a proxy.
*Guards:* `scheduled_date` pressed into service as an availability bound, which it
is not: scheduling is attention, availability is commitment.

**U12 · Ordering a board.** Six things this week; the order matters and cannot be
argued from priority alone.
*Must work:* drag to rank, and have the rank persist and mean something relative
to its siblings.
*Guards:* a rank you could type, which says nothing without the list beside it.

**U13 · One trip, three commitments.** Library book, prescription, parcel — three
scopes, one Saturday.
*Must work:* discharge all three from one act, without pretending they were one
task or copying the act three times.
*Exercises:* S2.

**U14 · What is this for.** Looking at a task, you want to know which objective it
serves — and from the objective, what is left before it.
*Must work:* both directions, optional on both ends, and completing every
contributing task must **not** satisfy the objective.
*Guards:* contribution read as satisfaction; drafting and submitting do not
publish the paper.
*Exercises:* S3.

**U15 · Deliberation that is not yet commitment.** Three weeks of writing about
being tired, no decision made.
*Must work:* hold competing routes in prose without any of them becoming tasks,
and later convert one — without the system having demanded structure while you
were still thinking.
*Guards:* a model whose entry point is a form; the journal is architectural for
this reason.
*Exercises:* S1.

---

## D · Attention and review

**U16 · The weekly review.** Forty open tasks and a Sunday hour.
*Must work:* see the two failures separately — overdue commitments, and scopes
nobody has looked at — because they are different failures with different
remedies.
*Exercises:* S7.

**U17 · Judging a standing claim.** "No important relationship neglected."
*Must work:* answer it in one click, with three answers available — holds,
doesn't, can't tell — and have the answer join a history rather than close
anything.
*Guards:* a claim with a deadline, which is the wrong prompt for something that
is never done; and "can't tell" collapsed into "no", which hides the claims that
are badly worded.
*Exercises:* S9.

**U18 · The objective nothing can measure.** You capture a claim with neither a
metric nor a review cadence.
*Must work:* keep it, and report it as inert — nothing can ever change its truth
value — rather than carry it silently among claims that mean something.

**U19 · Reviewing a scope from the scope.** You are in an area and it is time.
*Must work:* start its review from there, covering the period since the last one,
and have that examination count against the cadence — activity inside it does not.
*Guards:* activity mistaken for attention; a busy project nobody has looked at.

---

## E · Other people

**U20 · Handing something over.** You commit that the paper will be published and
delegate the draft. Three weeks of nothing. Then they decline.
*Must work:* offer, accept, decline and withdraw as moves on the *assignment*,
leaving the commitment yours throughout. "They said no" must never read as "it is
over".
*Guards:* assignment and intention sharing one state machine.
*Exercises:* S4.

**U21 · Asking, and being asked.** Someone owes you an answer; you owe someone
else one.
*Must work:* see both directions, and see what has gone quiet.
*Open:* whether asking, assigning and delegating are one loop or three is
undecided — `domain.md` → *What the domain has not decided*. This scenario is the
test any answer must pass.

**U22 · A meeting that generates commitments.** Three decisions made; you leave
with two commitments, one yours and one on the team's behalf.
*Must work:* capture them *from the meeting*, with the meeting as their origin, so
"where did this come from" is navigable later.
*Exercises:* S5.

**U23 · The same person, twice.** Two records for one person, made months apart.
*Must work:* merge them and have every reference — moments, mentions, tasks,
attendance — follow the survivor, with nothing orphaned. And have the duplicate be
findable in the first place.
*Guards:* a merge that repoints typed FKs and misses the polymorphic ones.

**U24 · Everything with someone.** You are about to see them.
*Must work:* one query — every moment they were in, everything about them, what is
outstanding with them — regardless of which surface produced each.
*Guards:* attendee addresses conflated with people, which is what made this
unanswerable before.

---

## F · Body and health

**U25 · The 7am dose, one hand.** Kitchen, kids, phone in one hand.
*Must work:* log what you took in one gesture and have it land on today — with the
amount, without opening the medication, and without navigating to a protocol.
*Guards:* the timezone defect (U7); and a logging path that requires finding the
schedule first.

**U26 · The step you skipped.** You did not take the evening dose.
*Must work:* record that, with a reason, distinguishably from having simply not
recorded anything — and not have the skip appear on the timeline as something
that happened.
*Guards:* silence and decision made indistinguishable, which is the whole reason
endings carry causes.

**U27 · The panel.** A lipid panel comes back: five values, one blood draw.
*Must work:* enter it as one act with a value per metric, with act-level context
("fasting") recorded once, and each value graphable on its own.
*Guards:* five separate readings that no longer know they were the same draw.

**U28 · The protocol that changes.** A medication's dose changes mid-course, or
the protocol ends.
*Must work:* change it going forward without rewriting what already happened.
*Guards:* a schedule edit that retroactively alters history.

---

## G · Places

**U29 · Where I was.** You need to reconstruct a day, or to say where something
happened.
*Must work:* the day's visits, derived from the phone's own record, and a place
attachable to anything that happened.
*Guards:* a derived visit overwriting something you wrote; derived and authored
must be distinguishable, and a rebuild must not clobber.

**U30 · The place worth keeping.** Somewhere you keep going has no name.
*Must work:* promote it to a real location once, after which everything past and
future refers to it.

---

## H · Time, calendar, and the world outside

**U31 · Dragging a range.** You block Thursday afternoon on the canvas.
*Must work:* the drag has already said *when*, so only the title is missing, and
you stay on the canvas to keep going.
*Guards:* a form that asks again for what the gesture already carried.

**U32 · Notes from the meeting you are in.** You clicked the calendar item and the
meeting is starting.
*Must work:* write into it — the notes taken *during* it, attached to it — from
the thing you clicked. Every object you can click can be written into, with no
exception by kind.
*Guards:* 2026-07-30 — the description field was iCalendar's, and there was
nowhere that was yours.

**U33 · The recurring thing behind the occurrence.** You clicked one instance of a
weekly item and want to change the series.
*Must work:* reach what generates it, and choose whether the change touches this
one, this and following, or all.
*Guards:* 2026-07-30 — an occurrence with no route to its rule; and the same
appointment drawn twice weekly because two expanders both claimed it.

**U34 · An invitation arrives.** Someone sends you a meeting.
*Must work:* see it, reply yes or no, and have the reply reach them — echoing back
exactly what arrived, so the reply is valid to a system you do not control.
*Guards:* paraphrasing wire form; UID, SEQUENCE and organizer are one system.

**U35 · Inviting people.** You add two guests to something you own.
*Must work:* they are notified; a later change of time notifies everyone; adding a
third guest does **not** re-notify the first two.
*Guards:* notification storms, which train you to ignore them.

**U36 · Being reminded.** Something starts in ten minutes and you are elsewhere.
*Must work:* the device tells you, once.

---

## I · Memory, machinery, and trust

**U37 · Finding a thing you half-remember.** One word, wrong spelling, no idea of
its type.
*Must work:* one search across everything, ranked, that gets you there.

**U38 · The scratch buffer.** You paste something while offline; the connection is
bad.
*Must work:* an empty buffer must never be mistaken for a real one and saved over
it, and a failed save must say so rather than report success.
*Guards:* 2026-08-01 — 2,755 bytes lost exactly this way; recovery meant reading
dead tuples out of the heap.

**U39 · What changed, and when.** Something is different and you did not do it.
*Must work:* a readable history of what changed.

**U40 · A second machine writing.** An agent completes tasks and writes moments on
your behalf.
*Must work:* mint and revoke its credential; see what it did as *its* doing.
*Open:* a moment has no actor — `domain.md` → *Whose attention did a moment
consume?* This scenario is the test.

**U41 · Two screens.** The laptop is open on the timeline; you log a dose on the
phone.
*Must work:* the laptop shows it, without a refresh.

**U42 · Settings you set once.** Zone, invite defaults, notification permission.
*Must work:* set them once and never be asked again.

---

## Coverage

Every surface, and the scenario that speaks for it. A feature with no scenario is
either undefended or unnecessary; a scenario with no feature is the backlog.

| surface | scenarios |
|---|---|
| Capture, Inbox, unfiled triage | U1, U2 |
| Journal, Log band, composers, mentions, images | U3, U4, U5, U15 |
| Today | U6 |
| Timeline, moments, backlinks | U7, U8, U24 |
| Tasks: create, schedule, bound, rank, block | U9–U13 |
| Areas, Programs, Projects | U19 |
| Outcomes, evaluations, means-end | U14, U17, U18 |
| Reviews, review dashboard | U16, U17, U19 |
| Delegations, requests, assignment | U20, U21 |
| People, Organizations | U22, U23, U24 |
| Merge, Duplicates | U23 |
| Medications, Protocols, Routines, doses | U25, U26, U28 |
| Allergies, Insurance | U28 |
| Metrics, Metric groups | U14, U18, U27 |
| Locations, Places, tracking ingest, candidates | U29, U30 |
| Calendar, occurrences, rules, recurrence editing | U31, U33 |
| Calendar mail (iMIP), invites, RSVP | U34, U35 |
| Reminders, push, nudges | U36 |
| Resources, Decisions | U22, U37 |
| Whiteboard | U38 |
| Search | U37 |
| History / change log | U39 |
| Agents, API tokens | U40 |
| SSE stream | U41 |
| Settings, preferences | U42 |
