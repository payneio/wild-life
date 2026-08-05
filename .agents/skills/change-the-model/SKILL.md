---
name: change-the-model
description: Read before adding, removing or repurposing a column, table, entity, moment kind, status value or Alembic migration in api/ — anything that changes the shape of what the system can say. Two questions that must be answered before the edit, plus the migration procedure. Not for changing behaviour over an existing shape.
---

# Changing the model

Two questions, then the procedure. The questions are the point; they are here
rather than in `AGENTS.md` because that file is read when a session starts and
this is needed when a migration is written, which is rarely the same moment.

They are deliberately questions and not steps. Anything that could be written as
a step over the *current* shape is already enforced by a check that fails —
see "What already fails without you" below — and would rot the way the docs this
repository spent an evening deleting rotted.

## 1. Which scenario forces this?

`api/docs/domain.md` holds the definitions and the scenarios S1–S9, and states
its own test: *a change is legitimate only if every scenario still has an
answer.* Run that test **before** the migration, not after.

Name the scenario that fails without the change — an S number from `domain.md`
(what must be representable) or a U number from `docs/scenarios.md` (what must be
doable). Both count, and a change that satisfies every S while breaking a U is
still a regression. If you cannot name either, the change is a guess — say so plainly and let Paul decide, rather than shipping
structure and reasoning about it later.

Adding a scenario is allowed and is how the model grows. It is a claim about the
domain, so it gets written down in `domain.md` where the next change is tested
against it.

## 2. What else can write this fact?

Enumerate every writer. If there are two, that is the defect — stop and collapse
them before continuing.

Nearly every correction this system has needed was one fact with two writers: a
mirror table beside the spine; `work` moments restating `tasks.scheduled_date`;
`moments.window_*` restating the intention; `activity` beside `name`; three
nullable scope FKs; a rule anchor and its wire RRULE both expanded, which put
the same therapy appointment on the calendar twice a week. Each was found by
symptom, separately, long after it was written.

The inverse also holds: a fact with one writer needs no reconciliation, no tick,
and no staleness. That is why `spine.py` writes inline in the act's own
transaction and why `uq_moments_source_ref` exists.

## The schema is not evidence

This is a system one person is building, so the current shape is a hypothesis
under test, not a fact about the domain. Row counts, which columns exist, and
what the writers happen to produce are evidence about **past guesses**, not
about what is needed.

The failure has a shape worth recognising: every one of the 485 windows ever
written on `moments` was zero-width, and that was offered as evidence the model
was right — when the three writers were fed single dates and could not have
produced anything else. Absence of use is not evidence of absence of need when
nothing could have expressed the need.

Say which kind of claim you are making: what the code does, what the domain
requires, or what you believe and on what grounds. Do not let the first stand in
for the second. Cite outside work or drop the claim.

## Migration procedure

```bash
cd api
export WILD_LIFE_DATABASE_URL="postgresql+asyncpg://castle:$(wildpc secret get POSTGRES_PASSWORD)@localhost:5432/castle"

uv run alembic heads            # more than one → rebase your down_revision, don't guess
uv run alembic revision --autogenerate -m "..."   # generates the id; never hand-write one
uv run alembic upgrade head
```

Hand-written revision ids collided four times in one session. `alembic revision`
generates a unique one; edit the body it writes, never the id.

Then, in order, because each step's failure is how the next one's work is found:

```bash
uv run pytest tests/ -q
uv run python -c "import json; from wild_life.main import app; open('openapi.json','w').write(json.dumps(app.openapi(), indent=2))"
cd ../web && pnpm gen:api && pnpm build && pnpm test && pnpm lint
```

Commit `openapi.json` and `schema.gen.ts` with the change. They are how the
frontend learns the shape moved.

Deploying: `wildpc service restart wild-life-api` for API code, `wildpc program
build wild-life` for the SPA. `alembic upgrade head` runs against the live
database yourself — nothing runs migrations for you. See `AGENTS.md`.

## What already fails without you

Do not restate these in prose; they are checks, and a check that is also a
paragraph is a paragraph that will disagree with the check:

- **Generated types.** Removing a value from a `Literal` (e.g. `MomentKind`)
  makes `tsc` name every frontend site that still uses it. Regenerate before
  believing a removal is done.
- **`entities/coverage.test.tsx`.** Mounts each object's real detail against a
  complete fixture and fails on any unrendered key. A new column must be
  rendered or excused in `omit` with a reason. Add the fixture in the same pass.
- **`tests/test_spine_invariants.py`.** Pins the boundaries that keep producing
  bugs — day derivation (a date anchors at **noon** UTC, not midnight), source-ref
  idempotency, tense. It caught `spine.instant` at midnight after the code it was
  written for had been deleted. A new boundary of that kind gets its invariant
  test before the feature.
- **`ruff check .` and `ruff format --check .`** from `api/`, both. `check`
  passes on an unformatted tree, which is how four migrations sat unformatted
  across several phases. A `Stop` hook now runs these on the files a change
  touches.
