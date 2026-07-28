import { Record, RecordSection } from "@/components/record/Record"
import { WhereWasI } from "@/components/record/WhereWasI"
import { useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Note, NoteLink } from "@/services/api/types"

const F = recordFields<Note>()

/** Outbound mentions, parsed from the body — they follow the text, not a field. */
function Links() {
  const { row } = useFields(["links"])
  const links = (row.links as NoteLink[] | null) ?? []
  if (links.length === 0) return null
  return (
    <div className="text-xs text-slate-400">
      Mentions {links.length} {links.length === 1 ? "entity" : "entities"}
    </div>
  )
}

/**
 * The note body carries the note, so it leads and everything else is metadata
 * beneath it. `entity_type`/`entity_id` — what this note is *about* — stays
 * prominent rather than buried: it is the note's one structural fact, and the
 * only thing separating an entry in a log from an unfiled scrap.
 */
export function NoteDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.note} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="title" placeholder="Untitled note" />
      </RecordSection>

      <RecordSection columns={false}>
        {/* Renders the same way the journal does — one field, one appearance. */}
        <F.Markdown field="body" label="Body" minRows={8} />
      </RecordSection>

      <Links />

      <RecordSection title="Filing">
        <F.Root label="Rooted to" />
        <F.Date field="entry_date" label="Entry date" />
        <F.Text field="mood" label="Mood" />
        <F.Tags field="tags" label="Tags" />
        {/* Where you were when you wrote it. No column backs this — it is a
            query against the visit intervals, which is why it also fills in
            retroactively once you name a place you had not named yet. */}
        <WhereWasI field="created_at" />
      </RecordSection>
    </Record>
  )
}
