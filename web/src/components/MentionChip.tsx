import { Link } from "react-router-dom"
import { routeFor } from "@/services/api/mentions"
import type { EntityType } from "@/services/api/types"

const CLS =
  "rounded bg-indigo-50 px-1 py-0.5 font-medium text-indigo-700 no-underline hover:bg-indigo-100"

/** A resolved @-mention: an inline chip that deep-links to the entity. */
export function MentionChip({
  type,
  id,
  label,
}: {
  type: EntityType
  id: string
  label: string
}) {
  const to = routeFor(type, id)
  if (!to) return <span className={CLS}>@{label}</span>
  return (
    <Link to={to} className={CLS} onClick={(e) => e.stopPropagation()}>
      @{label}
    </Link>
  )
}
