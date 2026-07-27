import { Badge } from "@/components/ui/primitives"
import { EntityRef } from "@/components/graph/EntityRef"
import { LOOKUP_TO_TYPE } from "@/components/graph/lookupType"
import { humanize, isOverdue, PRIORITY_CLASS, statusClass } from "@/lib/format"
import { asDay, type CalendarDay, type Instant } from "@/lib/date"
import { formatDate } from "@/lib/utils"
import { useEntityResolver } from "@/services/api/mentions"
import {
  useAreaLookup,
  useOutcomeLookup,
  useMedicationLookup,
  useMetricLookup,
  useLocationLookup,
  useOrganizationLookup,
  usePeopleLookup,
  useProgramLookup,
  useProjectLookup,
  useTaskLookup,
  useProtocolLookup,
  type LookupKey,
} from "@/services/api/lookups"
import type { EntityType, Priority } from "@/services/api/types"

/** The name of whatever a soft-poly root points at.
 *
 *  `RefName` needs a `LookupKey`, and a root can be any `EntityType` — so this
 *  goes through the same resolver notes and mentions use rather than a per-type
 *  lookup that would only cover some of them. */
export function RootName({
  type,
  id,
}: {
  type: EntityType | null | undefined
  id: string | null | undefined
}) {
  const resolve = useEntityResolver()
  if (!type || !id) return <span className="text-slate-300">—</span>
  return <span>{resolve(type, id) ?? "…"}</span>
}

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
  task: useTaskLookup,
  people: usePeopleLookup,
  outcome: useOutcomeLookup,
  metric: useMetricLookup,
  organization: useOrganizationLookup,
  location: useLocationLookup,
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
  return (
    <EntityRef type={LOOKUP_TO_TYPE[kind]} id={id}>
      {nameOf(id)}
    </EntityRef>
  )
}

export function DateText({
  value,
  overdue,
}: {
  value: CalendarDay | Instant | null | undefined
  overdue?: boolean
}) {
  if (!value) return <span className="text-slate-300">—</span>
  const late = overdue && isOverdue(asDay(value))
  return (
    <span className={late ? "font-medium text-red-600" : "text-slate-600"}>
      {formatDate(value)}
    </span>
  )
}
