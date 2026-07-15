import { Badge } from "@/components/ui/primitives"
import { humanize, isOverdue, PRIORITY_CLASS, statusClass } from "@/lib/format"
import { formatDate } from "@/lib/utils"
import {
  useAreaLookup,
  useConditionLookup,
  useGoalLookup,
  useLocationLookup,
  useMedicationLookup,
  useMetricLookup,
  useOrganizationLookup,
  usePeopleLookup,
  useProgramLookup,
  useProjectLookup,
  useProtocolLookup,
  type LookupKey,
} from "@/services/api/lookups"
import type { Priority } from "@/services/api/types"

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={statusClass(status)}>{humanize(status)}</Badge>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge className={PRIORITY_CLASS[priority]}>{priority}</Badge>
}

const LOOKUP_HOOKS = {
  area: useAreaLookup,
  program: useProgramLookup,
  project: useProjectLookup,
  people: usePeopleLookup,
  goal: useGoalLookup,
  metric: useMetricLookup,
  organization: useOrganizationLookup,
  location: useLocationLookup,
  condition: useConditionLookup,
  medication: useMedicationLookup,
  protocol: useProtocolLookup,
} as const

export function RefName({
  kind,
  id,
}: {
  kind: LookupKey
  id: string | null | undefined
}) {
  const { nameOf } = LOOKUP_HOOKS[kind]()
  if (!id) return <span className="text-slate-300">—</span>
  return <span>{nameOf(id)}</span>
}

export function DateText({
  value,
  overdue,
}: {
  value: string | null | undefined
  overdue?: boolean
}) {
  if (!value) return <span className="text-slate-300">—</span>
  const late = overdue && isOverdue(value)
  return (
    <span className={late ? "font-medium text-red-600" : "text-slate-600"}>
      {formatDate(value)}
    </span>
  )
}
