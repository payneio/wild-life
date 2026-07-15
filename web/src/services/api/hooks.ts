import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/services/api/client"
import { createCrud, type Body } from "@/services/api/crud"
import type {
  Affiliation,
  Allergy,
  Area,
  Commitment,
  ComputedProgress,
  Condition,
  Decision,
  Delegation,
  EventItem,
  Goal,
  HealthEvent,
  InsurancePlan,
  Interaction,
  Medication,
  Metric,
  MetricEntry,
  Note,
  Organization,
  Person,
  Program,
  Project,
  Protocol,
  ProtocolItem,
  Resource,
  Review,
  ReviewDashboard,
  Routine,
  RoutineInstance,
  Tag,
  Task,
  WaitingItem,
} from "@/services/api/types"

// --- CRUD resources ---
export const areas = createCrud<Area>("areas")
export const programs = createCrud<Program>("programs")
export const projects = createCrud<Project>("projects")
export const tasks = createCrud<Task>("tasks")
export const people = createCrud<Person>("people")
export const interactions = createCrud<Interaction>("interactions")
export const organizations = createCrud<Organization>("organizations")
export const affiliations = createCrud<Affiliation>("affiliations")
export const routines = createCrud<Routine>("routines")
export const routineInstances = createCrud<RoutineInstance>("routine-instances")
export const goals = createCrud<Goal>("goals")
export const metrics = createCrud<Metric>("metrics")
export const metricEntries = createCrud<MetricEntry>("metric-entries")
export const events = createCrud<EventItem>("events")
export const notes = createCrud<Note>("notes")
export const commitments = createCrud<Commitment>("commitments")
export const waitingItems = createCrud<WaitingItem>("waiting-items")
export const delegations = createCrud<Delegation>("delegations")
export const reviews = createCrud<Review>("reviews")
export const resources = createCrud<Resource>("resources")
export const decisions = createCrud<Decision>("decisions")
export const tags = createCrud<Tag>("tags")

// --- health domain ---
export const conditions = createCrud<Condition>("conditions")
export const medications = createCrud<Medication>("medications")
export const protocols = createCrud<Protocol>("protocols")
export const protocolItems = createCrud<ProtocolItem>("protocol-items")
export const healthEvents = createCrud<HealthEvent>("health-events")
export const insurancePlans = createCrud<InsurancePlan>("insurance-plans")
export const allergies = createCrud<Allergy>("allergies")

export function useProtocolItems(protocolId: string | null) {
  return useQuery({
    queryKey: ["protocols", protocolId, "items"],
    queryFn: () =>
      apiClient.get<ProtocolItem[]>(`/protocols/${protocolId}/items`),
    enabled: !!protocolId,
  })
}

// --- review dashboard ---
export function useReviewDashboard() {
  return useQuery({
    queryKey: ["review-dashboard"],
    queryFn: () => apiClient.get<ReviewDashboard>("/review-dashboard"),
  })
}

// --- nested / relationship reads ---
export function usePersonInteractions(personId: string | null) {
  return useQuery({
    queryKey: ["people", personId, "interactions"],
    queryFn: () => apiClient.get<Interaction[]>(`/people/${personId}/interactions`),
    enabled: !!personId,
  })
}

// --- person <-> organization affiliations ---
export function usePersonAffiliations(personId: string | null) {
  return useQuery({
    queryKey: ["people", personId, "affiliations"],
    queryFn: () => apiClient.get<Affiliation[]>(`/people/${personId}/affiliations`),
    enabled: !!personId,
  })
}

export function useOrganizationAffiliations(orgId: string | null) {
  return useQuery({
    queryKey: ["organizations", orgId, "affiliations"],
    queryFn: () => apiClient.get<Affiliation[]>(`/organizations/${orgId}/affiliations`),
    enabled: !!orgId,
  })
}

/** Invalidate every affiliation view (list + both nested sides). */
function invalidateAffiliations(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["affiliations"] })
  qc.invalidateQueries({ queryKey: ["people"] })
  qc.invalidateQueries({ queryKey: ["organizations"] })
}

export function useSaveAffiliation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Body }) =>
      id
        ? apiClient.patch<Affiliation>(`/affiliations/${id}`, body)
        : apiClient.post<Affiliation>("/affiliations", body),
    onSuccess: () => invalidateAffiliations(qc),
  })
}

export function useDeleteAffiliation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/affiliations/${id}`),
    onSuccess: () => invalidateAffiliations(qc),
  })
}

export function useMetricEntries(metricId: string | null) {
  return useQuery({
    queryKey: ["metrics", metricId, "entries"],
    queryFn: () => apiClient.get<MetricEntry[]>(`/metrics/${metricId}/entries`),
    enabled: !!metricId,
  })
}

export function useRoutineInstances(routineId: string | null) {
  return useQuery({
    queryKey: ["routines", routineId, "instances"],
    queryFn: () => apiClient.get<RoutineInstance[]>(`/routines/${routineId}/instances`),
    enabled: !!routineId,
  })
}

export function useCompleteRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on?: string }) =>
      apiClient.post(`/routines/${id}/complete${on ? `?on=${on}` : ""}`),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["routines", id, "instances"] })
      qc.invalidateQueries({ queryKey: ["routine-instances"] })
    },
  })
}

// --- goal <-> project links + computed progress ---
export function useGoalProjects(goalId: string | null) {
  return useQuery({
    queryKey: ["goals", goalId, "projects"],
    queryFn: () => apiClient.get<Project[]>(`/goals/${goalId}/projects`),
    enabled: !!goalId,
  })
}

export function useGoalProgress(goalId: string | null) {
  return useQuery({
    queryKey: ["goals", goalId, "progress"],
    queryFn: () =>
      apiClient.get<ComputedProgress>(`/goals/${goalId}/computed-progress`),
    enabled: !!goalId,
  })
}

export function useLinkGoalProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ goalId, projectId }: { goalId: string; projectId: string }) =>
      apiClient.post(`/goals/${goalId}/projects/${projectId}`),
    onSuccess: (_d, { goalId }) => {
      qc.invalidateQueries({ queryKey: ["goals", goalId, "projects"] })
      qc.invalidateQueries({ queryKey: ["goals", goalId, "progress"] })
    },
  })
}

export function useUnlinkGoalProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ goalId, projectId }: { goalId: string; projectId: string }) =>
      apiClient.delete(`/goals/${goalId}/projects/${projectId}`),
    onSuccess: (_d, { goalId }) => {
      qc.invalidateQueries({ queryKey: ["goals", goalId, "projects"] })
      qc.invalidateQueries({ queryKey: ["goals", goalId, "progress"] })
    },
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
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { tagId: string; entityType: string; entityId: string }) =>
      apiClient.post(`/tags/${v.tagId}/attach`, {
        entity_type: v.entityType,
        entity_id: v.entityId,
      }),
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["entity-tags", v.entityType, v.entityId] }),
  })
}

export function useDetachTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { tagId: string; entityType: string; entityId: string }) =>
      apiClient.delete(
        `/tags/${v.tagId}/attach?entity_type=${v.entityType}&entity_id=${v.entityId}`,
      ),
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["entity-tags", v.entityType, v.entityId] }),
  })
}

// --- person photos (multipart upload / delete) ---
export function useUploadPersonPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const form = new FormData()
      form.append("file", file)
      return apiClient.postForm<Person>(`/people/${id}/photo`, form)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }),
  })
}

export function useDeletePersonPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/people/${id}/photo`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }),
  })
}
