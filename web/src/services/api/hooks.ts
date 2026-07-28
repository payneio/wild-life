import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/services/api/client"
import { createCrud, type Body } from "@/services/api/crud"
import { finalizePendingImages, type PendingImage } from "@/services/api/momentImages"
import type {
  Affiliation,
  Allergy,
  Area,
  Commitment,
  DerivationInfo,
  Evaluation,
  Decision,
  Delegation,
  EntityType,
  EventItem,
  GuestStatus,
  Outcome,
  InsurancePlan,
  Location,
  LocationVisit,
  Presence,
  TrackPoint,
  IngestStatus,
  PlaceCandidate,
  PromoteResult,
  Medication,
  Metric,
  MetricGroup,
  GroupMember,
  GroupReading,
  MetricEntry,
  Moment,
  MomentKind,
  MomentRole,
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
  SeriesPoint,
  Task,
  Request,
} from "@/services/api/types"

// --- CRUD resources ---
export const areas = createCrud<Area>("areas")
export const programs = createCrud<Program>("programs")
export const projects = createCrud<Project>("projects")
export const tasks = createCrud<Task>("tasks")
export const people = createCrud<Person>("people")
export const organizations = createCrud<Organization>("organizations")
export const locations = createCrud<Location>("locations")
export const affiliations = createCrud<Affiliation>("affiliations")
export const routines = createCrud<Routine>("routines")
export const routineInstances = createCrud<RoutineInstance>("routine-instances")
export const outcomes = createCrud<Outcome>("outcomes")
export const metrics = createCrud<Metric>("metrics")
export const metricEntries = createCrud<MetricEntry>("metric-entries")
export const metricGroups = createCrud<MetricGroup>("metric-groups")
export const events = createCrud<EventItem>("events")
/** The spine. A life is a series of moments; everything above is their subject. */
export const moments = createCrud<Moment>("moments")

/**
 * Create a moment, then upload any images that were attached while composing (a
 * new moment has no id to attach to yet) and rewrite their body tokens to the
 * real refs. Returns a `(body, pending) => Promise<Moment>` submit handler.
 */
export function useCreateMomentWithImages() {
  const create = moments.useCreate()
  const update = moments.useUpdate()
  return async (body: Body, pending: PendingImage[]): Promise<Moment> => {
    const moment = await create.mutateAsync(body)
    if (pending.length) {
      const finalBody = await finalizePendingImages(moment.id, String(body.body ?? ""), pending)
      await update.mutateAsync({ id: moment.id, body: { body: finalBody } })
    }
    return moment
  }
}
export const commitments = createCrud<Commitment>("commitments")
export const requests = createCrud<Request>("requests")
export const delegations = createCrud<Delegation>("delegations")
export const reviews = createCrud<Review>("reviews")
export const resources = createCrud<Resource>("resources")
export const decisions = createCrud<Decision>("decisions")

// --- health domain ---
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

// --- whiteboard (one buffer, deliberately not an entity) ---
export interface WhiteboardRead {
  content: string
  updated_at: string | null
}

export function useWhiteboard() {
  return useQuery({
    queryKey: ["whiteboard"],
    queryFn: () => apiClient.get<WhiteboardRead>("/whiteboard"),
  })
}

export function useSaveWhiteboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => apiClient.put<WhiteboardRead>("/whiteboard", { content }),
    // No SSE fan-out reaches this (it is unaudited by design), so seed the cache
    // from the response rather than waiting for an invalidation that never comes.
    onSuccess: (board) => qc.setQueryData(["whiteboard"], board),
  })
}

/** Every reading of a group, newest first, with its values.
 *  Keyed under "group-readings" because that is the table whose changes should
 *  refresh it — recording a reading fires that, not ["metric-groups"]. */
export function useGroupReadings(groupId: string | null) {
  return useQuery({
    queryKey: ["group-readings", "by-group", groupId],
    queryFn: () => apiClient.get<GroupReading[]>(`/metric-groups/${groupId}/readings`),
    enabled: !!groupId,
  })
}

/** The metrics in a group, in the order the form should ask for them. */
export function useGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: ["group-members", "by-group", groupId],
    queryFn: () =>
      apiClient.get<GroupMember[]>("/group-members", {
        group_id: groupId ?? undefined,
        sort: "position",
        limit: "200",
      }),
    enabled: !!groupId,
  })
}

/** Record one act of measuring: one moment, one context, N values. */
export function useRecordReading() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: (v: {
      groupId: string
      recorded_at: string
      context?: string | null
      values: { metric_id: string; value: number }[]
    }) =>
      apiClient.post(`/metric-groups/${v.groupId}/readings`, {
        recorded_at: v.recorded_at,
        context: v.context ?? null,
        values: v.values,
      }),
    // The entries land in metric-entries, which is what charts and outcomes read.
    onSuccess: () => invalidate("group-readings", "metric-entries", "outcomes"),
  })
}

/** Replace a group's membership with exactly this ordered list. */
export function useSetGroupMembers() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: (v: { groupId: string; metricIds: string[] }) =>
      apiClient.put(`/metric-groups/${v.groupId}/members`, { metric_ids: v.metricIds }),
    onSuccess: () => invalidate("group-members"),
  })
}

// --- a log's scope, and its year/month navigation ---
/**
 * Which stream a log shows.
 *
 * **The timeline of X is the moments linked to X**, so one shape answers a
 * program's band, a person's history and a medication's dose log. `kind` narrows
 * it to one act — the Journal is `reflection`, the Inbox is `capture` — which is
 * what lets a surface be defined by what it *is* rather than by what it lacks.
 */
export interface MomentScope {
  kind?: MomentKind
  linked_type?: string
  linked_id?: string
  /** Which involvements count. Repeatable server-side; see `TIMELINE_ROLES`. */
  role?: MomentRole[]
}

/**
 * The involvements that put a moment on a thing's **timeline**.
 *
 * `subject` is what it was about, `participant` who was there, `place` where. A
 * `mention` is the writing merely naming the thing, and belongs in the backlinks
 * panel instead — showing it in both is what once made 18 of 20 "mentioned in"
 * rows duplicate the list directly above them. Mirrors `TIMELINE_ROLES` in
 * `routers/moments.py`.
 */
export const TIMELINE_ROLES: MomentRole[] = ["subject", "participant", "place"]

const scopeParams = (s: MomentScope) => ({
  kind: s.kind,
  linked_type: s.linked_type,
  linked_id: s.linked_id,
  role: s.role,
})
const scopeKey = (s: MomentScope) => [
  s.kind ?? "",
  s.linked_type ?? "",
  s.linked_id ?? "",
  (s.role ?? []).join(","),
]

export interface CalendarBucket {
  year: number
  month: number
  count: number
}

/** Per-(year, month) counts for the stream's navigation rail. Scoped exactly the
 *  way the list is — a rail that disagrees with its stream is worse than none. */
export function useMomentsCalendar(scope: MomentScope, enabled = true) {
  return useQuery({
    queryKey: ["moments", "calendar", ...scopeKey(scope)],
    queryFn: () => apiClient.get<CalendarBucket[]>("/moments/calendar", scopeParams(scope)),
    enabled,
  })
}

/** One year of a scoped stream. `since`/`until` rather than a `year` param: the
 *  API places a moment by occurrence *or* window, and a single column couldn't. */
export function useMomentYear(scope: MomentScope, year: number | null, enabled = true) {
  return useQuery({
    queryKey: ["moments", "year", ...scopeKey(scope), year],
    queryFn: () =>
      apiClient.get<Moment[]>("/moments", {
        ...scopeParams(scope),
        ...(year === null
          ? {}
          : { since: `${year}-01-01T00:00:00Z`, until: `${year}-12-31T23:59:59Z` }),
        limit: "500",
      }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/** The whole scoped corpus, fetched once for instant client-side search.
 *  `keepPreviousData` avoids flashing while the query key changes. */
export function useMomentCorpus(scope: MomentScope, enabled: boolean) {
  return useQuery({
    queryKey: ["moments", "corpus", ...scopeKey(scope)],
    queryFn: () =>
      apiClient.get<Moment[]>("/moments", { ...scopeParams(scope), limit: "2000" }),
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

/**
 * Moments that *mention* an entity — the backlinks panel.
 *
 * `role=mention` does server-side what the panel used to do by hand: a moment
 * whose subject is this entity already sits in its Log, and listing it again as
 * a backlink is what made 18 of 20 "mentioned in" rows duplicates. Roles are the
 * closed vocabulary that makes the distinction expressible at all.
 */
export function useMomentsMentioning(type: EntityType | null, id: string | null) {
  return useQuery({
    queryKey: ["moments", "mentioning", type, id],
    queryFn: () =>
      apiClient.get<Moment[]>("/moments", {
        linked_type: type ?? undefined,
        linked_id: id ?? undefined,
        role: "mention",
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

/** Visits derived inside one location, newest first.
 *
 *  Keyed under "location-visits" — the table whose changes make it stale — so
 *  arriving or leaving refreshes it over the SSE path. Read-only: visits are
 *  derived from readings, and the tick owns them. */
export function useLocationVisits(locationId: string | null) {
  return useQuery({
    queryKey: ["location-visits", "by-location", locationId],
    queryFn: () => apiClient.get<LocationVisit[]>(`/locations/${locationId}/visits`),
    enabled: !!locationId,
  })
}

/** Everywhere you were at one instant, innermost first.
 *
 *  A list, not a place: fences nest, so at any moment you are inside several.
 *  `places[0]` is the most specific answer and the tail is the breadcrumb. */
export function usePresence(at?: string) {
  return useQuery({
    queryKey: ["location-visits", "where-was-i", at ?? "now"],
    queryFn: () =>
      apiClient.get<Presence>(`/where-was-i${at ? `?at=${encodeURIComponent(at)}` : ""}`),
  })
}

/** Visits overlapping a window, for the day timeline. */
export function useVisitsBetween(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ["location-visits", "between", fromIso, toIso],
    queryFn: () =>
      apiClient.get<LocationVisit[]>(
        `/location-visits?entered_at__lte=${encodeURIComponent(toIso)}&limit=500`,
      ),
    // The API filters on entry; a visit that began earlier and is still running
    // overlaps this window too, so the tail is trimmed client-side.
    select: (rows) =>
      rows.filter((v) => v.exited_at === null || v.exited_at >= fromIso),
  })
}

/** Raw positions for a day's track. Keyed on "location-pings" so a new reading
 *  refreshes the line — the table name the SSE stream reports. */
export function useTrack(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ["location-pings", "track", fromIso, toIso],
    queryFn: () =>
      apiClient.get<TrackPoint[]>(
        `/location-pings?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
      ),
  })
}

/** The review queue of proposed places. Keyed on the table name so a nightly
 *  recompute, a promote, or a dismissal all refresh it over the SSE path. */
export function usePlaceCandidates() {
  return useQuery({
    queryKey: ["place-candidates"],
    queryFn: () => apiClient.get<PlaceCandidate[]>("/place-candidates"),
  })
}

export function usePromoteCandidate() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; radius_m?: number }) =>
      apiClient.post<PromoteResult>(`/place-candidates/${id}/promote`, body),
  })
}

export function useDismissCandidate() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<PlaceCandidate>(`/place-candidates/${id}/dismiss`, {}),
  })
}

/** Whether readings are still arriving at all — see IngestStatus on the API. */
export function useIngestStatus() {
  return useQuery({
    queryKey: ["location-pings", "status"],
    queryFn: () => apiClient.get<IngestStatus>("/location-status"),
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

/**
 * Drop a task between two of its siblings, optionally restatusing it.
 *
 * Anchors, not a number — the board knows what the row landed between, and the
 * server turns that into a position it alone can guarantee is unique. Carrying
 * `status` means a drag across a section boundary is one write, so the row
 * doesn't visibly land and then change again.
 */
export function useMoveTask() {
  const invalidate = useInvalidator()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      after_id?: string | null
      before_id?: string | null
      status?: Task["status"] | null
    }) => apiClient.post<Task>(`/tasks/${id}/move`, body),
    onSuccess: () => invalidate("tasks"),
  })
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
/** The readings, however they arise — typed in, or computed on read.
 *  Keyed under "metric-entries" so logging one refreshes the chart; a derived
 *  series has no entries to change, and recomputes when its inputs do. */
export function useMetricSeries(metricId: string | null) {
  return useQuery({
    queryKey: ["metric-entries", "series", metricId],
    queryFn: () => apiClient.get<SeriesPoint[]>(`/metrics/${metricId}/series`),
    enabled: !!metricId,
  })
}

export function useDerivations() {
  return useQuery({
    queryKey: ["derivations"],
    queryFn: () => apiClient.get<DerivationInfo[]>("/derivations"),
    staleTime: Infinity,
  })
}

export function useOutcomeEvaluation(outcomeId: string | null) {
  return useQuery({
    queryKey: ["outcomes", outcomeId, "evaluation"],
    queryFn: () => apiClient.get<Evaluation>(`/outcomes/${outcomeId}/evaluation`),
    enabled: !!outcomeId,
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
