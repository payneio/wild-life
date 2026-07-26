import { PickerBody } from "@/components/graph/PickerBody"
import type { MentionResult, PickerIntent } from "@/services/api/mentions"
import type { EntityType } from "@/services/api/types"

/** Typeahead over mentionable entities, in a plain bordered box (the picker
 *  without the overlay). Optionally restrict to one type / exclude an id.
 *  `intent` is required — see `PickerIntent`. */
export function EntityCombobox({
  onSelect,
  onClose,
  placeholder = "Search people, places, projects…",
  type,
  excludeId,
  intent,
}: {
  onSelect: (r: MentionResult) => void
  onClose?: () => void
  placeholder?: string
  type?: EntityType
  excludeId?: string
  intent: PickerIntent
}) {
  return (
    <div className="w-72 rounded-lg border border-slate-200 bg-surface shadow-lg">
      <PickerBody
        onSelect={onSelect}
        onClose={onClose}
        placeholder={placeholder}
        type={type}
        excludeId={excludeId}
        intent={intent}
        listClassName="max-h-64"
      />
    </div>
  )
}
