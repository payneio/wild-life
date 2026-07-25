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
Design system       the components that realize → EditableRecord, cells, EntityRefField, …
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
`components/record/` — `<Record>` supplies the chrome (action bar, `relations` panels,
backlinks, timestamps) and the entity supplies the layout. Field primitives are
*called*, never dispatched to by a type tag, and `recordFields<T>()` makes every
`field` prop `keyof T`.

`def.detail` is **required** — there is no generic field-grid renderer left to fall
back to, so nothing can half-own a surface. The old partial-override shape (`extra` +
`detailHide`) forced two renderers to agree out-of-band about who drew what, which is
how Task ended up rendering status, priority and its dates twice.

`def.fields` still exists, but only for the **create** form (`EntityForm`) and the
list filter/sort config (`listFilter.ts`) — it no longer describes the detail view.

Because a written layout *can* drop a field — worse than duplicating one, since the
data becomes invisible and uneditable — every primitive registers the key it binds and
`<Record>` compares that against the row. `entities/coverage.test.tsx` mounts each
converted object's real detail against a complete fixture in `test/fixtures.ts` and
fails on any unrendered, unexcused key. Deliberate omissions go in `omit` with a
reason. Converting an object enrols it automatically; add its fixture at the same time.

All 23 registered objects are converted. `EditableRecord`, `DetailSurface`, `extra`
and `detailHide` are deleted. What remains of the old config-driven path is the
*create* form: `EntityForm` still switches on `FieldSpec.type`, so that half of the
DSL — and its drift risk — is still live. Converting it is the next step.

## 3. Framing — pane / modal / full-page

The **same** detail representation (`EditableRecord`) is *framed* differently by context.
This is the **space** argument to `f(…)`, and it's a **routing** decision — not a different
component:

| Framing | Routing | Component |
|---|---|---|
| **Pane** (beside a list) | detail route **nested under a list layout** (the list renders `<Outlet/>`) | `EntityDetailRoute` |
| **Modal** (over a surface) | detail route **nested under a canvas layout** | `CalendarEventRoute` |
| **Full-page** | detail route **standalone** (a sibling route, no list around it) | `RecordPage` |

The knob is literally *"is the detail route nested inside a list layout or not."* On
`SimpleEntityPage`, `detail="page"` flips a list from two-pane (pane) to a full-width
launcher whose rows open a standalone `RecordPage`. On mobile, pane collapses to a
full-screen drawer (there's only room for one thing).

## 4. Choosing the framing — by **intent**

**Two separate decisions live here, and conflating them is the classic mistake:**
*where* the detail is framed (this section, driven by **intent**) vs. *whether* the object
needs extra views (§5, driven by a structural **property**).

Pick the representation by intent:

- **Browse many** → collection (list/table) — or a **canvas** if position or time *is* data
  (§5 spatiality / temporality).
- **Reference / assign** → chip (`RefName`) or picker (`EntityRefField`).
- **Inspect-and-work one** → the detail-editor (`EditableRecord`), **framed** by intent + space:
  - **peek / reference** a small record with a list beside it → **pane** *(a "Directory")*
  - **go in and work** it → **full-page** *(a "Workbench")*
  - **summoned** from a canvas or a cross-page link → **modal**

Framing is an **intent** call, not a structural one. The everyday full-page case is an
**operational work-item** — an object with a lifecycle you go *into* to get work done
(task, project, goal, review). It earns a full page because you *work in* it, **even with
no containment**. Objects you merely glance at (a tag, a location, a contact you reference)
stay panes. Mobile collapses pane → full-screen drawer (room for one thing).

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
2. **Pick the framing by intent** (§4):
   - *Directory* — you peek/reference it → `withDetail(...)` in `routes.tsx` → pane.
   - *Workbench* — you go in and work it (an operational work-item, or a container you
     operate) → a standalone `/<obj>/:id` route with `RecordPage` + `detail="page"` on the
     list. Tasks, Projects, Goals, Areas, Programs, and Reviews are Workbenches because you
     *work in* them.
3. **Add bespoke views only when a §5 property earns it.** Otherwise the generic
   `EditableRecord` + a framing is the answer.

## Component index

| Concern | File |
|---|---|
| Object model | `src/services/api/registry.ts` |
| Detail + editor (modeless) | `src/components/EditableRecord.tsx` |
| Framings | `EntityDetailRoute.tsx` (pane) · `RecordPage.tsx` (full-page) · `CalendarEventRoute.tsx` (modal) |
| List page + launcher/pane toggle | `src/components/SimpleEntityPage.tsx` (`detail` prop) |
| Reference / collection cells | `src/components/cells.tsx` |
| Selector | `src/components/graph/EntityRefField.tsx` |
| Field controls (create form) | `src/components/EntityForm.tsx` |
| List filter/sort rig | `src/lib/listFilter.ts`, `src/components/ListToolbar.tsx` |
| Routing (where framings are wired) | `src/router/routes.tsx` |
