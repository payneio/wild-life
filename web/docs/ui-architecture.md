# UI architecture — objects & their representations

This app is built object-first ([OOUX](https://www.ooux.com/)): we model domain
**objects** and let each object's **representations** fall out of what it is and what
you're doing with it. Read this before adding a page or deciding how an object appears.

Keep three things separate — *what a thing is*, *how it's showing right now*, and *how
that's wired*. Collapsing them is where the confusion comes from.

## The object model is the registry

`src/services/api/registry.ts` **is** the object model. Each `EntityDef` carries the
object, its relationships (`relations` + `entity`-typed fields), its calls to action
(crud hooks, complete/merge/delete), and its attributes (`fields`).

Add an object by extending the registry + `createCrud` (AGENTS.md → *Generic CRUD*),
not by hand-writing a stack. Everything below then comes for free.

**Person is a deliberate exception** — relationship-rich enough to earn a bespoke
`PeoplePage`, still a first-class object everywhere via the `people` lookup. A bespoke
object still belongs to the object model; it just realizes its representations by hand.

## Representations

Which representation shows is contextual: `f(object, intent, context, space, state, device)`.
Every registered object gets this set:

| Representation | What it is | Realized by |
|---|---|---|
| **Reference** | a name/avatar chip standing in for the object | `RefName`, `cells.tsx` |
| **Collection item** | one row in a list/launcher | `SimpleEntityPage` row, `TaskRow` |
| **Selector** | a picker/autocomplete result | `EntityRefField` |
| **Detail + Editor** | the object's canonical surface | `entities/<obj>/Detail.tsx` |
| **Visualization** | a bespoke rendering | calendar block, `GoalProgress` |

**Detail and editor are fused.** Every field is editable in place and autosaves
(single-field `PATCH`; SSE fans the change back — AGENTS.md → *SSE-driven reactivity*).
No read/edit toggle, because in a single-user tool the intent is always see-and-work.

**Detail layouts are composed, not configured.** An object's detail lives in
`src/entities/<obj>/Detail.tsx` and writes its fields as JSX using `components/record/`.
`<Record>` supplies the chrome; the entity supplies the layout. Field primitives are
*called*, never dispatched to by a type tag, and `recordFields<T>()` makes every `field`
prop `keyof T`.

`<Record>`'s bands, in order: **ancestry → action bar → the entity's own fields →
`relations` panels → Log → backlinks → timestamps**.

**The Log is a band, not a declared relation** — every moment rooted at this object,
with a composer on top. Declarable means forgettable, and an object with nowhere to
write grows a `notes` column instead. Being unforgettable is what makes "where do I
write this?" answerable by navigation alone.

**Every object that can be a moment's subject gets one, and that includes `moment`.**
No exception by kind. A moment about a moment is sometimes a mention — a reflection
referencing Thursday's meeting — and sometimes a subject: the notes taken *during* it.
That is the line `subject` and `mention` already draw for every other type, so a type
check here would answer a question the roles have answered.

`def.detail` is **required**; there is no generic field-grid renderer to fall back to,
so nothing can half-own a surface. `def.fields` is **list configuration only** —
`deriveListConfig` reads it for searchable columns and filter dropdowns. That's
data-as-config describing *querying*, not layout. If you're tempted to add a field
there to make something render, render it in the layout instead.

Because a written layout can drop a field — worse than duplicating one, since the data
becomes invisible and uneditable — every primitive registers the key it binds and
`<Record>` compares that against the row. `entities/coverage.test.tsx` mounts each
object's real detail against a complete fixture and fails on any unrendered, unexcused
key. Deliberate omissions go in `omit` with a reason. Converting an object enrols it
automatically; add its fixture at the same time.

## Creation is capture

Creation is *capture*, not form-filling, and the shape follows from what the gesture
already knows:

1. If the gesture carries the data, don't ask again — a calendar drag has already said
   when, so only the title is missing.
2. If the object is essentially a name, take the name and nothing else.
3. If a non-name discriminator is required, make the *choice* the affordance — "New
   weekly" beats a select inside a form.
4. If the object is meaningless without a relationship, capture that one too.

And decide where you land: capture flows **stay put** so you can keep capturing; objects
you'll immediately elaborate **open**.

| Surface | Create | After |
|---|---|---|
| Task, and every `SimpleEntityPage` list | one-line title (`QuickCreate`) | stay |
| Event | title only, over the dragged range | stay on the canvas |
| Delegation | outcome + responsible person | open |
| Review | type buttons, period computed | open |

Nothing is created until non-empty text is committed, and the new row appears in the
list you're looking at — so a mistake is visible and deletable in place rather than
becoming an orphan.

## Framing

A record opens **full-page**, always: a standalone `/<obj>/:id` route rendering
`RecordPage`, with the list left behind as a full-width launcher.

| Framing | Routing | Component |
|---|---|---|
| **Full-page** | detail route standalone | `RecordPage` |
| **Modal** (over a canvas) | detail route nested under a canvas layout | `CalendarEventRoute` |
| **Modal, for a thing with no row** | a *projected* occurrence, addressed by `(rule, occurrence_at)` | `CalendarSlotRoute` |

A pane beside the list is deliberately gone: every record now carries the Log, and a
384px column is not somewhere you write. The modal survives because being *summoned
from a canvas* is a different question from how wide a record is.

Pick the representation by intent:

- **Browse many** → collection — or a **canvas** if position or time *is* data.
- **Reference / assign** → chip (`RefName`) or picker (`EntityRefField`).
- **Inspect-and-work one** → the detail-editor, full-page — or modal when summoned
  from a canvas.

## When an object earns *bespoke* views

Framing is settled above. Whether an object needs views **beyond the default set** is
earned only by a structural property, never by feel:

| Property | Meaning | Earns | Ours |
|---|---|---|---|
| **Containment** | holds independently-meaningful objects | related-panel workspace / subnav | Project, Area, Program |
| **Temporality** | time-positioned / recurrent | calendar block, recurrence editor | Event |
| **Relationship-richness** | browsed among peers, relationship-heavy | profile + relationship views | Person |
| **Spatiality** | position is data | map / spatial canvas | *(none yet — Locations could)* |

Keep the axes separate: **intent picks the frame; a property earns extra views.** They
co-occur for different reasons — a container is full-page because you *operate* it, and
gets related panels because it *contains* things. A plain work-item (Task) is full-page
with no bespoke views.

**Graduation is a knob, not a rewrite:** when an object accumulates a property past a
threshold, it earns richer views — a representation change, not a new object.

## Adding a page

1. **New object** → extend the registry + `createCrud`; it gets the default set.
2. **Wire the routes** → a `/<obj>` list and a sibling `/<obj>/:id` rendering
   `RecordPage`. Same two lines for every object.
3. **Bespoke views only when a property above earns it.**

## Component index

| Concern | File |
|---|---|
| Object model | `src/services/api/registry.ts` |
| Detail + editor | `src/entities/<obj>/Detail.tsx` · `src/components/record/` |
| Framings | `RecordPage.tsx` · `CalendarEventRoute.tsx` / `CalendarSlotRoute.tsx` |
| List launcher | `src/components/SimpleEntityPage.tsx` |
| The Log band | `src/components/Log.tsx`, rendered by `record/Record.tsx` |
| Reference / collection cells | `src/components/cells.tsx` |
| Selector | `src/components/graph/EntityRefField.tsx` |
| Field primitives | `src/components/record/fields.tsx` |
| Capture | `src/components/QuickCreate.tsx` · `src/components/MomentComposer.tsx` |
| List filter/sort rig | `src/lib/listFilter.ts`, `src/components/ListToolbar.tsx` |
| Routing | `src/router/routes.tsx` |
