import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/services/api/client"
import { createCrud } from "@/services/api/crud"
import type {
  Area,
  Commitment,
  ComputedProgress,
  Decision,
  Delegation,
  EventItem,
  Goal,
  Interaction,
  Metric,
  MetricEntry,
  Note,
  Person,
  Program,
  Project,
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
