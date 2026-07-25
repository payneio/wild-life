import type { ReactNode } from "react"
import {
  RecordCheckbox,
  RecordDate,
  RecordDateTime,
  RecordNumber,
  RecordRecurrence,
  RecordRef,
  RecordRoot,
  RecordSelect,
  RecordTags,
  RecordText,
  RecordTextarea,
  RecordTime,
  RecordTitle,
} from "@/components/record/fields"
import type { LookupKey } from "@/services/api/lookups"

/**
 * Field set bound to one entity type: `const F = recordFields<Task>()` makes
 * every `field` prop `keyof Task`, so a renamed or mistyped column is a compile
 * error rather than a silently empty control.
 */
export function recordFields<T>() {
  type K = Extract<keyof T, string>
  return {
    Title: RecordTitle as (p: { field: K; placeholder?: string }) => ReactNode,
    Text: RecordText as (p: {
      field: K
      label?: string
      placeholder?: string
      full?: boolean
    }) => ReactNode,
    Textarea: RecordTextarea as (p: {
      field: K
      label?: string
      placeholder?: string
      minRows?: number
    }) => ReactNode,
    Number: RecordNumber as (p: { field: K; label?: string; placeholder?: string }) => ReactNode,
    Select: RecordSelect as (p: {
      field: K
      label?: string
      options: readonly string[]
      optionLabel?: (o: string) => string
    }) => ReactNode,
    Date: RecordDate as (p: { field: K; label?: string }) => ReactNode,
    Time: RecordTime as (p: { field: K; label?: string }) => ReactNode,
    DateTime: RecordDateTime as (p: { field: K; label?: string }) => ReactNode,
    Checkbox: RecordCheckbox as (p: { field: K; label: string }) => ReactNode,
    Ref: RecordRef as (p: { field: K; label?: string; lookup: LookupKey }) => ReactNode,
    Recurrence: RecordRecurrence as (p: { field: K; label?: string }) => ReactNode,
    Tags: RecordTags as (p: { field: K; label?: string }) => ReactNode,
    /** Owns the entity_type/entity_id pair, so it takes no `field`. */
    Root: RecordRoot,
  }
}
