import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/services/api/client"
import { createCrud, type Body } from "@/services/api/crud"
import { finalizePendingImages, type PendingImage } from "@/services/api/noteImages"
import type {
  Affiliation,
  Allergy,
  Area,
  Commitment,
  Evaluation,
  Condition,
  Decision,
  Delegation,
  EntityType,
  EventItem,
  GuestStatus,
  Outcome,
  InsurancePlan,
  Interaction,
  Location,
  Medication,
  Metric,
  MetricEntry,
  Note,
  Organization,
  Person,
  Program,
  Project,
  Protocol,
  RegimenEntry,
  Resource,
  Review,
  ReviewDashboard,
  Routine,
  RoutineInstance,
  Tag,
  Task,
  Request,
} from "@/services/api/types"

// --- CRUD resources ---
export const areas = createCrud<Area>("areas")
export const programs = createCrud<Program>("programs")
export const projects = createCrud<Project>("projects")
export const tasks = createCrud<Task>("tasks")
export const people = createCrud<Person>("people")
export const interactions = createCrud<Interaction>("interactions")
export const organizations = createCrud<Organization>("organizations")
export const locations = createCrud<Location>("locations")
export const affiliations = createCrud<Affiliation>("affiliations")
export const routines = createCrud<Routine>("routines")
export const routineInstances = createCrud<RoutineInstance>("routine-instances")
export const outcomes = createCrud<Outcome>("outcomes")
export const metrics = createCrud<Metric>("metrics")
export const metricEntries = createCrud<MetricEntry>("metric-entries")
export const events = createCrud<EventItem>("events")
export const notes = createCrud<Note>("notes")

/**
 * Create a note, then upload any images that were attached while composing (a
 * new note has no id to attach to yet) and rewrite their body tokens to the real
 * refs. Returns a `(body, pending) => Promise<Note>` submit handler.
 */
export function useCreateNoteWithImages() {
  const create = notes.useCreate()
  const update = notes.useUpdate()
  return async (body: Body, pending: PendingImage[]): Promise<Note> => {
    const note = await create.mutateAsync(body)
    if (pending.length) {
      const finalBody = await finalizePendingImages(note.id, String(body.body ?? ""), pending)
      await update.mutateAsync({ id: note.id, body: { body: finalBody } })
    }
    return note
  }
}
export const commitments = createCrud<Commitment>("commitments")
export const requests = createCrud<Request>("requests")
export const delegations = createCrud<Delegation>("delegations")
export const reviews = createCrud<Review>("reviews")
export const resources = createCrud<Resource>("resources")
export const decisions = createCrud<Decision>("decisions")
export const tags = createCrud<Tag>("tags")

// --- health domain ---
export const conditions = createCrud<Condition>("conditions")
export const medications = createCrud<Medication>("medications")
export const protocols = createCrud<Protocol>("protocols")
export const insurancePlans = createCrud<InsurancePlan>("insurance-plans")
export const allergies = createCrud<Allergy>("allergies")

/** Today's regimen — routines due today (meds, supplements, activities, habits). */
export function useRegimen(day: string) {
  return useQuery({
    queryKey: ["regimen", day],
    queryFn: () => apiClient.get<RegimenEntry[]>(`/regimen?date=${day}`),
  })
}

// --- review dashboard ---
export function useReviewDashboard() {
  return useQuery({
    queryKey: ["review-dashboard"],
    queryFn: () => apiClient.get<ReviewDashboard>("/review-dashboard"),
  })
}

/**
 * Returns an `invalidate(...resources)` for custom (non-`createCrud`) mutations,
 * so their own writes refresh deterministically like the generic CRUD hooks.
 * Each resource string prefix-matches every list/detail/derived key under it.
 */
function useInvalidator() {
  const qc = useQueryClient()
  return (...resources: string[]) => {
    for (const r of resources) void qc.invalidateQueries({ queryKey: [r] })
  }
}

// --- entity merge (combine duplicates) ---
export interface MergePreview {
  total_references: number
  by_site: Record<string, number>
  note_bodies: number
}

export function useMergeEntities() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      type: EntityType
      survivor_id: string
      loser_id: string
      fill_fields?: boolean
    }) => apiClient.post("/merge", v),
    // Merge repoints references across many tables — invalidate everything.
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useMergePreview() {
  return useMutation({
    mutationFn: (v: { type: EntityType; survivor_id: string; loser_id: string }) =>
      apiClient.post<MergePreview>("/merge/preview", v),
  })
}

export interface DuplicateGroup {
  type: EntityType
  members: { id: string; name: string }[]
}

export function useDuplicates(type?: EntityType) {
  return useQuery({
    queryKey: ["duplicates", type ?? "all"],
    queryFn: () =>
      apiClient.get<DuplicateGroup[]>("/merge/duplicates", type ? { type } : undefined),
  })
}

// --- journal year/month navigation ---
export interface CalendarBucket {
  year: number
  month: number
  count: number
}

export function useNotesCalendar(params?: { tag?: string; no_tag?: string | string[] }) {
  return useQuery({
    queryKey: ["notes", "calendar", params?.tag ?? "", params?.no_tag ?? ""],
    queryFn: () =>
      apiClient.get<CalendarBucket[]>("/notes/calendar", {
        tag: params?.tag,
        no_tag: params?.no_tag,
      }),
  })
}

/** All scoped notes (every year), fetched once for instant client-side journal
 * search. `keepPreviousData` avoids flashing while the query key changes. */
export function useNoteCorpus(
  params: { tag?: string; no_tag?: string | string[] },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["notes", "corpus", params.tag ?? "", params.no_tag ?? ""],
    queryFn: () =>
      apiClient.get<Note[]>("/notes", { tag: params.tag, no_tag: params.no_tag }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

// --- global cross-entity search (/search) ---
export interface SearchHit {
  type: EntityType
  id: string
  label: string
  snippet: string | null
  rank: number
}

export function useSearch(q: string, opts?: { types?: string; limit?: number }) {
  return useQuery({
    queryKey: ["search", q, opts?.types ?? "", opts?.limit ?? 20],
    queryFn: () =>
      apiClient.get<SearchHit[]>("/search", {
        q,
        types: opts?.types,
        limit: String(opts?.limit ?? 20),
      }),
    enabled: q.length >= 3,
    placeholderData: keepPreviousData,
  })
}

// --- notes that mention a given entity (backlinks) ---
export function useNotesLinkedTo(type: EntityType | null, id: string | null) {
  return useQuery({
    queryKey: ["notes", "linked", type, id],
    queryFn: () =>
      apiClient.get<Note[]>("/notes", {
        linked_type: type ?? undefined,
        linked_id: id ?? undefined,
      }),
    enabled: !!type && !!id,
  })
}

// The three below each read from *two* tables (events + entity_links, or
// attendee_responses + sent_invites), and a query key has only one prefix — so
// the child-resource rule documented under "nested / relationship reads" can't
// be applied cleanly here. They stay keyed by the parent and lean on the
// explicit invalidate in their mutations; a real fix needs invalidation to
// accept a set of resources, not one prefix.

/** Events a person is linked to (as an attendee) — the people-graph payoff. */
export function usePersonEvents(id: string | null) {
  return useQuery({
    queryKey: ["people", id, "events"],
    queryFn: () => apiClient.get<EventItem[]>(`/people/${id}/events`),
    enabled: !!id,
  })
}

/** People linked to an event (matched attendees). */
export function useEventPeople(id: string | null) {
  return useQuery({
    queryKey: ["events", id, "people"],
    queryFn: () => apiClient.get<{ id: string; name: string }[]>(`/events/${id}/people`),
    enabled: !!id,
  })
}

/** Per-guest invite + RSVP status for a hosted event (the Guests panel). */
export function useEventGuests(id: string | null) {
  return useQuery({
    queryKey: ["events", id, "guests"],
    queryFn: () => apiClient.get<GuestStatus[]>(`/events/${id}/guests`),
    enabled: !!id,
  })
}

/** Opt an event into invites and send its pending REQUEST/CANCEL now. */
export function useSendInvites() {
  const qc = useQueryClient()
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: (eventId: string) =>
      apiClient.post<{ disabled: boolean; requests_sent: number; cancels_sent: number }>(
        `/events/${eventId}/invites/send`,
        {},
      ),
    onSuccess: (_res, eventId) => {
      void qc.invalidateQueries({ queryKey: ["events", eventId, "guests"] })
      invalidate("events")
    },
  })
}

/** Set my RSVP to a received invite; the reply is emailed immediately. */
export function useSetRsvp() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiClient.post<EventItem>(`/events/${id}/rsvp`, { status }),
    onSuccess: () => invalidate("events"),
  })
}

// --- preferences (generic single-user settings KV) ---
export function usePreference<T = Record<string, unknown>>(key: string) {
  return useQuery({
    queryKey: ["preferences", key],
    queryFn: () => apiClient.get<{ key: string; value: T }>(`/preferences/${key}`),
  })
}

export function useSetPreference(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (value: Record<string, unknown>) =>
      apiClient.put<{ key: string; value: Record<string, unknown> }>(
        `/preferences/${key}`,
        value,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["preferences", key] })
    },
  })
}

// --- nested / relationship reads ---
//
// A nested query's key MUST start with the resource whose *changes* should
// refresh it — the child, not the parent. The SSE stream invalidates by the
// changed row's table (`live.ts`), so `["metrics", id, "entries"]` never heard
// about a new metric entry: that fires `["metric-entries"]`. The endpoint the
// data comes from is irrelevant; what matters is what makes it stale.
export function usePersonInteractions(personId: string | null) {
  return useQuery({
    queryKey: ["interactions", "by-person", personId],
    queryFn: () => apiClient.get<Interaction[]>(`/people/${personId}/interactions`),
    enabled: !!personId,
  })
}

// --- person <-> organization affiliations ---
export function usePersonAffiliations(personId: string | null) {
  return useQuery({
    queryKey: ["affiliations", "by-person", personId],
    queryFn: () => apiClient.get<Affiliation[]>(`/people/${personId}/affiliations`),
    enabled: !!personId,
  })
}

export function useOrganizationAffiliations(orgId: string | null) {
  return useQuery({
    queryKey: ["affiliations", "by-organization", orgId],
    queryFn: () => apiClient.get<Affiliation[]>(`/organizations/${orgId}/affiliations`),
    enabled: !!orgId,
  })
}

export function useSaveAffiliation() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Body }) =>
      id
        ? apiClient.patch<Affiliation>(`/affiliations/${id}`, body)
        : apiClient.post<Affiliation>("/affiliations", body),
    onSuccess: () => invalidate("affiliations", "people", "organizations"),
  })
}

export function useDeleteAffiliation() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/affiliations/${id}`),
    onSuccess: () => invalidate("affiliations", "people", "organizations"),
  })
}

export function useMetricEntries(metricId: string | null) {
  return useQuery({
    queryKey: ["metric-entries", "by-metric", metricId],
    queryFn: () => apiClient.get<MetricEntry[]>(`/metrics/${metricId}/entries`),
    enabled: !!metricId,
  })
}

export function useRoutineInstances(routineId: string | null) {
  return useQuery({
    queryKey: ["routine-instances", "by-routine", routineId],
    queryFn: () => apiClient.get<RoutineInstance[]>(`/routines/${routineId}/instances`),
    enabled: !!routineId,
  })
}

function completeUrl(id: string, on?: string, slot?: string): string {
  const q = new URLSearchParams()
  if (on) q.set("on", on)
  if (slot) q.set("slot", slot)
  const s = q.toString()
  return `/routines/${id}/complete${s ? `?${s}` : ""}`
}

/** Check a routine done for a day (+slot). Idempotent. */
export function useCompleteRoutine() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: ({ id, on, slot }: { id: string; on?: string; slot?: string }) =>
      apiClient.post(completeUrl(id, on, slot)),
    onSuccess: () => invalidate("routines", "routine-instances"),
  })
}

/** Un-check a routine for a day (+slot). */
export function useUncompleteRoutine() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: ({ id, on, slot }: { id: string; on?: string; slot?: string }) =>
      apiClient.delete(completeUrl(id, on, slot)),
    onSuccess: () => invalidate("routines", "routine-instances"),
  })
}

export interface DoseLog {
  medication_id?: string | null // required unless routine_id supplies it
  routine_id?: string | null // optional; pre-fills amount/unit/medication
  amount?: number | null // the dose taken (amount + unit)
  unit?: string | null
  slot?: string
  scheduled_date?: string // LOCAL day of the intake (dayOf(taken_at))
  completed_at?: string // actual time taken
  notes?: string | null
}

/** Log an intake — always inserts a new event (extra / PRN / backdated / un-prescribed). */
export function useLogDose() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: (body: DoseLog) => apiClient.post<RoutineInstance>("/intakes", body),
    onSuccess: () => invalidate("routines", "routine-instances"),
  })
}

// --- where an outcome actually stands ---
// Keyed under "outcomes" so an edit to the claim refreshes it; a *reading*
// changes the verdict without touching that row, which `DERIVED_FROM` in
// live.ts handles.
export function useOutcomeEvaluation(outcomeId: string | null) {
  return useQuery({
    queryKey: ["outcomes", outcomeId, "evaluation"],
    queryFn: () => apiClient.get<Evaluation>(`/outcomes/${outcomeId}/evaluation`),
    enabled: !!outcomeId,
  })
}

// --- tags attached to any entity (soft polymorphic) ---
export function useEntityTags(entityType: string, entityId: string | null) {
  return useQuery({
    queryKey: ["entity-tags", entityType, entityId],
    queryFn: () =>
      apiClient.get<Tag[]>("/entity-tags", {
        entity_type: entityType,
        entity_id: entityId ?? undefined,
      }),
    enabled: !!entityId,
  })
}

export function useAttachTag() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: (v: { tagId: string; entityType: string; entityId: string }) =>
      apiClient.post(`/tags/${v.tagId}/attach`, {
        entity_type: v.entityType,
        entity_id: v.entityId,
      }),
    onSuccess: () => invalidate("entity-tags", "tag-entities", "tags"),
  })
}

export function useDetachTag() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: (v: { tagId: string; entityType: string; entityId: string }) =>
      apiClient.delete(
        `/tags/${v.tagId}/attach?entity_type=${v.entityType}&entity_id=${v.entityId}`,
      ),
    onSuccess: () => invalidate("entity-tags", "tag-entities", "tags"),
  })
}

// --- person photos (multipart upload / delete) ---
export function useUploadPersonPhoto() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const form = new FormData()
      form.append("file", file)
      return apiClient.postForm<Person>(`/people/${id}/photo`, form)
    },
    onSuccess: () => invalidate("people"),
  })
}

export function useDeletePersonPhoto() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/people/${id}/photo`),
    onSuccess: () => invalidate("people"),
  })
}
