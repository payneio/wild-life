import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Badge, Input } from "@/components/ui/primitives"
import { tags, useAttachTag, useDetachTag, useEntityTags } from "@/services/api/hooks"
import type { EntityType } from "@/services/api/types"

/**
 * Tags on any object.
 *
 * Tags used to be two systems sharing a word: a `text[]` column on notes and
 * resources, and `Tag`/`EntityTag` rows everywhere else. They are one mechanism
 * now (a0b1c2d3e4f5) — a polymorphic edge like rooting and mentions, rather than
 * a column each table grows for itself. That is what makes rename-once possible,
 * which this data needed: it held both `work` and `work:microsoft`.
 *
 * Typing stays as fast as the comma-separated column was: type a name, press
 * Enter, and it find-or-creates. The identity is a consequence, not a chore.
 */
export function TagField({
  entityType,
  entityId,
}: {
  entityType: EntityType
  entityId: string
}) {
  const { data: current } = useEntityTags(entityType, entityId)
  const { data: all } = tags.useList()
  const attach = useAttachTag()
  const detach = useDetachTag()
  const createTag = tags.useCreate()
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState("")

  const currentIds = new Set((current ?? []).map((t) => t.id))
  const available = (all ?? []).filter((t) => !currentIds.has(t.id))

  async function add() {
    const name = value.trim()
    if (!name) return
    // Match case-insensitively so `Divorce` doesn't become a second `divorce` —
    // the drift the string column had no way to prevent.
    const existing = (all ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase())
    const tag = existing ?? ((await createTag.mutateAsync({ name })) as { id: string })
    attach.mutate({ tagId: tag.id, entityType, entityId })
    setValue("")
    setAdding(false)
  }

  const listId = `tags-${entityType}-${entityId}`

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(current ?? []).map((t) => (
        <Badge key={t.id} color={t.color}>
          {t.name}
          <button
            className="ml-1 text-slate-400 hover:text-red-600"
            title={`Remove ${t.name}`}
            onClick={() => detach.mutate({ tagId: t.id, entityType, entityId })}
          >
            <X size={11} />
          </button>
        </Badge>
      ))}
      {adding ? (
        <span className="flex items-center gap-1">
          <Input
            list={listId}
            autoFocus
            className="h-7 w-32 py-0.5"
            value={value}
            placeholder="tag…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add()
              if (e.key === "Escape") {
                setValue("")
                setAdding(false)
              }
            }}
            onBlur={() => value.trim() === "" && setAdding(false)}
          />
          <datalist id={listId}>
            {available.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
          <button className="text-indigo-600" title="Add tag" onClick={() => void add()}>
            <Plus size={14} />
          </button>
        </span>
      ) : (
        <button
          className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:text-indigo-600"
          onClick={() => setAdding(true)}
        >
          <Plus size={11} /> tag
        </button>
      )}
    </div>
  )
}
