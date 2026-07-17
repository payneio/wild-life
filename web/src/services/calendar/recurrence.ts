import { apiClient } from "@/services/api/client"
import type { EventItem } from "@/services/api/types"

export type RecurrenceScope = "this" | "following" | "all"

/** Edit a recurring event at a chosen scope. `occurrenceDate` is the original
 *  ISO start of the occurrence acted on; `changes` are absolute new values. */
export async function editOccurrence(
  eventId: string,
  scope: RecurrenceScope,
  occurrenceDate: string,
  changes: Partial<EventItem>,
): Promise<EventItem> {
  return apiClient.patch<EventItem>(`/events/${eventId}/occurrence`, {
    scope,
    occurrence_date: occurrenceDate,
    changes,
  })
}

export async function deleteOccurrence(
  eventId: string,
  scope: RecurrenceScope,
  occurrenceDate: string,
): Promise<void> {
  const qs = new URLSearchParams({ scope, occurrence_date: occurrenceDate })
  await apiClient.delete<void>(`/events/${eventId}/occurrence?${qs.toString()}`)
}
