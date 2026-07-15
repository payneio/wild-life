import { useMemo } from "react"
import { areas, goals, metrics, people, programs, projects } from "@/services/api/hooks"

export interface Option {
  id: string
  label: string
}

export type LookupKey = "area" | "program" | "project" | "people" | "goal" | "metric"

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
export const usePeopleLookup = () => useLookup(people.useList, "name")
export const useGoalLookup = () => useLookup(goals.useList, "name")
export const useMetricLookup = () => useLookup(metrics.useList, "name")
