# UI architecture — objects & their representations

This app is built **object-first** (the established name is [Object-Oriented
UX](https://www.ooux.com/) / object-oriented UI architecture). Instead of designing
pages and flows, we model the domain **objects** and let each object's **representations**
fall out of what kind of thing it is and what the user is doing with it.

The point of this note: **new pages should pick their shape by default, not by taste.**
Read it before adding a page or deciding how an object should appear.

## The layers

```
Object model        what things exist          → the registry
Representation model in what forms each appears → chip / row / picker / detail-editor / …
Interaction model   what the user does         → browse / reference / inspect-and-work / …
Framing             where a representation sits → page + layout (routing)
Design system       the components that realize → record/ primitives, cells, EntityRefField, …
```

Keep these separate. Most of our past confusion came from collapsing *what a thing is*,
*how it's showing right now*, and *how that's wired*.

## 1. The object model = the registry

`src/services/api/registry.ts` **is** the object model. Each `EntityDef` carries the four
OOUX/ORCA facets:

- **O**bject — the entity itself (`key`, `entityType`, `crud`)
- **R**elationships — `relations` (related collections) + `entity`-typed fields (refs)
- **C**alls to action — the crud hooks + actions (complete, merge, delete)
- **A**ttributes — `fields` (the `FieldSpec[]`)

Add an object by extending the registry + `createCrud` (see AGENTS.md → *Generic CRUD*),
not by hand-writing a bespoke stack. Everything below comes for free once it's registered.

**Two deliberate exceptions** (intentional, not gaps): **Person** is a relationship-rich
object modeled through its lookup + the bespoke `PeoplePage` rather than the generic
registry — it's still a first-class object everywhere (references, mentions, history) via
the `people` lookup (`mentions.ts` notes this). **Tag** is a *value-object* (a label), not a
referenceable entity, so it has no `entityType`. A bespoke object still belongs to the object
model; it just realizes its representations by hand because a §5 property earns it.

## 2. Representations — one object, many forms

An object has no single UI. Which representation shows is **contextual**:

```
representation = f(object, intent, context, space, state, permissions, device)
```

Every registered object gets this **default representation set**:

| Representation | What it is | Realized by |
|---|---|---|
| **Reference** | a name/avatar chip standing in for the object | `RefName`, `cells.tsx` |
| **Collection item** | one row in a list/launcher | `SimpleEntityPage` row, `TaskRow` |
| **Selector** | a picker/autocomplete result | `EntityRefField` (`graph/`) |
| **Detail + Editor** | the object's canonical surface | `entities/<obj>/Detail.tsx` |
| **Visualization** | a bespoke rendering | calendar block, `GoalProgress` |

**Detail and editor are fused.** Every field is content that's editable in place and
autosaves (single-field `PATCH`; the SSE stream fans the change back, see AGENTS.md →
*SSE-driven reactivity*). There is no read-mode/edit-mode toggle because in a
single-user tool the intent is always *see-and-work*.

**Detail layouts are composed, not configured.** An object's detail lives in
`src/entities/<obj>/Detail.tsx` and writes its fields as JSX using the vocabulary in
`components/record/` — `<Record>` supplies the chrome and the entity supplies the layout.
Field primitives are *called*, never dispatched to by a type tag, and `recordFields<T>()`
makes every `field` prop `keyof T`.

`<Record>`'s bands, in order: **ancestry → action bar → the entity's own fields →
`relations` panels → Log → backlinks → timestamps**. The **Log** — every note rooted at
this object, with a composer on top — is a band rather than a declared relation, and that
distinction is load-bearing. It used to be one entry in `def.relations`, which meant it
could be forgotten: eleven objects had one, nine did not, and those nine grew a `notes`
column that filled up with dated events instead. Being unforgettable is what makes
"where do I write this?" answerable by navigation alone.

`def.detail` is **required** — there is no generic field-grid renderer left to fall
back to, so nothing can half-own a surface. The old partial-override shape (`extra` +
`detailHide`) forced two renderers to agree out-of-band about who drew what, which is
how Task ended up rendering status, priority and its dates twice.

`def.fields` still exists, but only as **list configuration** — `deriveListConfig`
reads it to decide which columns are searchable and which make useful filter
dropdowns. That's data-as-config describing *querying*, not layout, which is where
the line sits. If you're tempted to add a field there to make something render,
render it in the layout instead.

Because a written layout *can* drop a field — worse than duplicating one, since the
data becomes invisible and uneditable — every primitive registers the key it binds and
`<Record>` compares that against the row. `entities/coverage.test.tsx` mounts each
converted object's real detail against a complete fixture in `test/fixtures.ts` and
fails on any unrendered, unexcused key. Deliberate omissions go in `omit` with a
reason. Converting an object enrols it automatically; add its fixture at the same time.

All 23 registered objects are converted, and `EditableRecord`, `DetailSurface`,
`EntityForm`, `extra` and `detailHide` are all deleted. No component renders a
field by switching on a type tag any more.

## 2b. Creation is capture

Creation is *capture*, not form-filling, and the right shape follows from **what the
creating gesture already knows**:

1. If the gesture carries the data, don't ask again — a calendar drag has already
   said when, so only the title is missing.
2. If the object is essentially a name, take the name and nothing else. Refinement
   belongs in the detail, where fields are grouped.
3. If a non-name discriminator is required, make the *choice* the affordance — a
   review is a ritual, so "New weekly" beats a select inside a form.
4. If the object is meaningless without a relationship, capture that one too.

And decide where you land: capture flows **stay put** so you can keep capturing;
objects you'll immediately elaborate **open**.

| Surface | Create | After |
|---|---|---|
| Task, and every `SimpleEntityPage` list | one-line title (`QuickCreate`) | stay |
| Event | title only, over the dragged range | stay on the canvas |
| Delegation | outcome + responsible person | open |
| Review | type buttons, period computed | open |

Nothing is created until non-empty text is committed, and the new row appears in the
list you're looking at — so a mistake is visible and deletable in place rather than
becoming an orphan. For tasks it lands in `inbox`, which is a designed state with a
triage page, not a stray row.

## 3. Framing — one, plus a modal for the canvas

A record opens **full-page**, always: a standalone `/<obj>/:id` sibling route rendering
`RecordPage`, with the list left behind as a full-width launcher.

| Framing | Routing | Component |
|---|---|---|
| **Full-page** | detail route **standalone** (a sibling route) | `RecordPage` |
| **Modal** (over a canvas) | detail route **nested under a canvas layout** | `CalendarEventRoute` |

There used to be a third — a pane beside the list, chosen per entity by intent
("Directory" vs "Workbench"). It's gone, and the reason is §2's Log band: every record
now carries the place you write about that object, and a 384px column is not somewhere
you write. Twelve entities were converted and `EntityDetailRoute` deleted. The modal
survives because being *summoned from a canvas* is a different question from how wide a
record is.

## 4. Choosing the framing — by **intent**

**Two separate decisions live here, and conflating them is the classic mistake:**
*where* the detail is framed (this section, driven by **intent**) vs. *whether* the object
needs extra views (§5, driven by a structural **property**).

Pick the representation by intent:

- **Browse many** → collection (list/table) — or a **canvas** if position or time *is* data
  (§5 spatiality / temporality).
- **Reference / assign** → chip (`RefName`) or picker (`EntityRefField`).
- **Inspect-and-work one** → the detail-editor (`entities/<obj>/Detail.tsx`), full-page —
  or **modal** when summoned from a canvas.

Framing is no longer a per-object decision, so there is nothing here to get wrong. What
*is* an intent call is §5: whether an object earns views beyond the default set.

## 5. When an object earns *bespoke* views

§4 picked the *frame*. This picks whether an object *also* needs **bespoke views beyond the
default set** — and that is earned **only by a structural property**, not by feel:

| Property | Meaning | Earns (extra views) | Examples (ours) |
|---|---|---|---|
| **Containment** | holds independently-meaningful objects | related-panel workspace / subnav | Project, Area, Program (`RelatedPanel`) |
| **Temporality** | time-positioned / recurrent | calendar block, popover, recurrence editor | Event (`CalendarPage`, `RecurrenceEditor`) |
| **Relationship-richness / identity** | browsed among peers, relationship-heavy | profile + relationship views + rich picker | Person (bespoke `PeoplePage`) |
| **Spatiality** | position is data | map / spatial canvas | *(none yet — Locations could)* |

Keep the axes separate: **intent picks the frame (§4); a property earns extra views (§5).**
They often co-occur — a *container* is usually also full-page — but for different reasons:
you get the full page because you **operate** it (§4 intent), and you fill that page with
subnav / related panels because it **contains** things (§5 property). A plain operational
work-item (Task) is full-page with *no* bespoke views; a container (Area) is full-page *and*
gets a related-panel workspace.

**Graduation is a knob, not a rewrite:** when an object accumulates a property past a
threshold (e.g. Person grows real CRM history), it earns richer views — a
framing/representation change, not a new object.

## 6. Practically: adding or reshaping a page

1. **New object** → extend the registry + `createCrud`. It gets the default representation
   set immediately.
2. **Wire the routes** (§3):
   Add a `/<obj>` list and a sibling `/<obj>/:id` route rendering `RecordPage`. There is
   one framing, so this is the same two lines for every object.
3. **Add bespoke views only when a §5 property earns it.** Otherwise the generic
   a plain `Record` layout + a framing is the answer.

## Component index

| Concern | File |
|---|---|
| Object model | `src/services/api/registry.ts` |
| Detail + editor (modeless) | `src/entities/<obj>/Detail.tsx` · `src/components/record/` |
| Framings | `RecordPage.tsx` (full-page) · `CalendarEventRoute.tsx` (modal, canvas only) |
| List launcher | `src/components/SimpleEntityPage.tsx` |
| The Log band | `src/components/Log.tsx`, rendered by `record/Record.tsx` |
| Reference / collection cells | `src/components/cells.tsx` |
| Selector | `src/components/graph/EntityRefField.tsx` |
| Field controls (create form) | `src/components/EntityForm.tsx` |
| List filter/sort rig | `src/lib/listFilter.ts`, `src/components/ListToolbar.tsx` |
| Routing (where framings are wired) | `src/router/routes.tsx` |
