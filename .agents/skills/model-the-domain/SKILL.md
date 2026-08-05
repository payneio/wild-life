---
name: model-the-domain
description: Read before proposing what a concept *is* — a new entity, merging or splitting two concepts, a status vocabulary, or a structural inversion ("what if everything were a moment"). Three questions that must be answered before any code or schema is proposed, and where each answer has to land. Use `change-the-model` instead when the concept is settled and you are moving a column.
---

# Modelling a domain concept

This fires **earlier** than `change-the-model`. That one asks whether a change to
an existing shape is warranted; this one asks what the thing is in the first
place. By the time a migration is being written the question here has already
been answered, usually without being asked.

Three questions. Answer all three *before* proposing structure, in the output
format at the bottom.

## 1. Who has modelled this before?

Name specific systems, standards or research: what each chose, and where we
deviate and why. Personal productivity, planning, delegation and health
scheduling are all heavily worked domains — assume prior art exists and go find
it before inventing.

**"I looked and found nothing" is a finding to state, not a step to skip.** It is
also usually wrong. This system re-derived the Winograd–Flores conversation for
action four separate times under four table names because nobody checked; the
schema still carries all four.

Prior art already load-bearing here, as evidence this is worth doing: HL7 FHIR
Timing (cadence), RFC 5545 (recurrence and calendar interchange), vCard RFC 6350
(addresses), GTD Horizons of Focus (the attention ladder), RACI (accountable vs
responsible). `api/docs/domain.md` -> *What this is not* lists what the model
deliberately declines to borrow, which is the other half of the same work.

## 2. What must it answer?

Competency questions, in the sense of Grüninger & Fox's TOVE method: the things
the system must be able to answer, written *before* the structure that answers
them, so the structure can be judged rather than admired.

**Draw them from the domain, not from the database.** The last time this method
was used here it was named correctly and then short-circuited — motivating
scenarios were taken from the current schema because it was to hand, which
imported every distortion of the design under test. `api/docs/domain.md` -> *The
scenarios* holds S1–S9; a change is legitimate only if every one still has an
answer. Adding a scenario is how the model grows.

The schema is not evidence. See `change-the-model` -> *The schema is not
evidence*, which is the fuller statement and is not repeated here.

## 3. What would make this wrong, and what does undoing it cost?

Name the reversal concretely: which tables, which data, how many days. Then say
what observation would show the design is wrong, and when you would expect to see
it.

This question has never once been asked in this project's history, and its
absence has a price. On 2026-07-28 a model in which a moment carried a *window*,
and precision was the window's width, was proposed, agreed and built. Every
window ever written was zero-width; the columns were retired four days later
(`c1d2e3f4a5b6`). The idea was elegant and the reasoning was sound. Nobody asked
what it would cost if it were wrong, so nothing was watching for the answer.

An idea being beautiful is not evidence. It is a reason to ask this question
harder, not to skip it.

## The output format

Answer in this shape — it is the format Paul asked for twice, verbatim, on
2026-07-28, and it is here so it does not have to be asked for a third time:

1. **What we are trying to accomplish.**
2. **What our options are** — at least two, genuinely different.
3. **Pros and cons of each**, including the reversal cost from Q3.
4. **What you believe the correct and elegant solution is**, and why.

Option (2) is the load-bearing one. If Paul proposed the idea under discussion,
producing a second option is the only structural defence against elaborating it
instead of testing it — and elaborating it is what happens by default. Say
plainly when you think a proposal is wrong; "no pushback on major data
architecture changes" is the failure this format exists to prevent.

## Where the answers go

A finding that stays in the conversation is lost. The operating definition of an
Area — *a standard you maintain indefinitely, not a goal you complete* —
restructured the top of the hierarchy on 2026-07-23 and then existed nowhere in
the repository for two weeks, because it had no destination.

| finding | lands in |
|---|---|
| what a concept *is*; a boundary; prior art followed or declined | `api/docs/domain.md` |
| a new scenario the model must *represent* | `api/docs/domain.md` -> *The scenarios* |
| a new scenario a person must be able to *do* | `docs/scenarios.md` |
| why *this column* has this shape; which standard it follows | the docstring beside it in `models/` |
| what the schema currently holds | nothing — `erd.md` is regenerated, never written |

`domain.md` holds definitions only. **Never put implementation status, row counts
or a phase plan in it** — that mixture is what rotted its predecessor badly enough
to be deleted, and it took the prior art down with it.
