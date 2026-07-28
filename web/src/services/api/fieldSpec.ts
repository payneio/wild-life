import type { LookupKey } from "@/services/api/lookups"

/**
 * A field's shape, for **list configuration only**.
 *
 * This used to describe how a field *rendered*, in a config-driven form and
 * detail renderer. Both are gone: detail layouts are composed JSX in
 * `entities/<obj>/Detail.tsx`, and creation is one-line capture. What's left is
 * the honest remainder — `deriveListConfig` reads these to decide which columns
 * are searchable and which make useful filter dropdowns.
 *
 * That's a legitimate use of data-as-config: it describes *querying*, not
 * layout. Keep it that way. If you find yourself adding a field here to make
 * something render, render it in the layout instead.
 */
export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime"
  | "checkbox"
  | "select"
  | "entity"
 
  | "attendees"
  | "multiselect"
  | "time"
  | "recurrence"

export interface FieldSpec {
  name: string
  label: string
  type?: FieldType
  options?: readonly string[]
  lookup?: LookupKey
  full?: boolean
  placeholder?: string
}
