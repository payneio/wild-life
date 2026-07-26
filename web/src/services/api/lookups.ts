import { useMemo } from "react"
import {
  areas,
  conditions,
  outcomes,
  medications,
  metrics,
  organizations,
  people,
  programs,
  projects,
  protocols,
  tasks,
} from "@/services/api/hooks"

export interface Option {
  id: string
  label: string
}

export type LookupKey =
  | "area"
  | "program"
  | "project"
  | "task"
  | "people"
  | "outcome"
  | "metric"
  | "organization"
  | "condition"
  | "medication"
  | "protocol"

/** Fetch a resource's rows and expose {options, nameOf}. */
function useLookup(
  useList: () => { data?: { id: string }[] },
  labelKey: string,
): { options: Option[]; nameOf: (id: string | null | undefined) => string } {
  const { data } = useList()
  return useMemo(() => {
    const rows = data ?? []
    const options = rows.map((r) => ({
      id: r.id,
      label: String((r as Record<string, unknown>)[labelKey] ?? r.id),
    }))
    const map = new Map(options.map((o) => [o.id, o.label]))
    return {
      options,
      nameOf: (id) => (id ? (map.get(id) ?? "—") : "—"),
    }
  }, [data, labelKey])
}

export const useAreaLookup = () => useLookup(areas.useList, "name")
export const useProgramLookup = () => useLookup(programs.useList, "name")
export const useProjectLookup = () => useLookup(projects.useList, "name")
export const useTaskLookup = () => useLookup(tasks.useList, "title")
export const usePeopleLookup = () => useLookup(people.useList, "name")
export const useOutcomeLookup = () => useLookup(outcomes.useList, "statement")
export const useMetricLookup = () => useLookup(metrics.useList, "name")
export const useOrganizationLookup = () => useLookup(organizations.useList, "name")
export const useConditionLookup = () => useLookup(conditions.useList, "name")
export const useMedicationLookup = () => useLookup(medications.useList, "name")
export const useProtocolLookup = () => useLookup(protocols.useList, "name")
