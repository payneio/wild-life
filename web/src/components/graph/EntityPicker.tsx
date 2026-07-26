import { PickerBody } from "@/components/graph/PickerBody"
import { PickerOverlay } from "@/components/graph/PickerOverlay"
import type { MentionResult, PickerIntent } from "@/services/api/mentions"
import type { Body } from "@/services/api/crud"
import type { EntityType } from "@/services/api/types"

/**
 * The one canonical relationship picker. A search-first typeahead over the
 * registry-driven entity index (`useEntitySearch`), rendered in a responsive
 * `PickerOverlay` (popover on desktop, bottom sheet on mobile). Optionally
 * restrict to one `type` and exclude an id.
 *
 * When restricted to a quick-creatable `type`, a trailing "＋ Create '<query>'"
 * row appears once the query has no exact match — creating the row inline (with
 * any `createDefaults`, e.g. an inherited parent FK) and selecting it.
 *
 * `intent` is required: see `PickerIntent`. It decides whether finished rows
 * (completed / archived / cancelled / resolved) are offered or withheld behind a
 * reveal, and there is no safe default.
 */
export function EntityPicker({
  getAnchor,
  onSelect,
  onClose,
  placeholder = "Search…",
  type,
  excludeId,
  intent,
  allowCreate = true,
  createDefaults,
}: {
  getAnchor: () => HTMLElement | null
  onSelect: (r: MentionResult) => void
  onClose: () => void
  placeholder?: string
  type?: EntityType
  excludeId?: string
  intent: PickerIntent
  allowCreate?: boolean
  createDefaults?: Body
}) {
  return (
    <PickerOverlay getAnchor={getAnchor} onClose={onClose}>
      <PickerBody
        onSelect={onSelect}
        onClose={onClose}
        placeholder={placeholder}
        type={type}
        excludeId={excludeId}
        intent={intent}
        allowCreate={allowCreate}
        createDefaults={createDefaults}
      />
    </PickerOverlay>
  )
}
