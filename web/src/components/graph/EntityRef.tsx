import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"
import { routeFor } from "@/services/api/routes"
import type { EntityType } from "@/services/api/types"

/**
 * A read-side reference that navigates to the target's detail route when one
 * exists, otherwise renders as plain text. Presentational: the caller passes an
 * already-resolved label as `children`. Styling stays subtle (inherits the
 * surrounding text color) so it's calm in dense list columns and reads as a
 * link on hover; `stopPropagation` lets a ref inside a clickable row win.
 */
export function EntityRef({
  type,
  id,
  children,
  className,
}: {
  type: EntityType
  id: string | null | undefined
  children: ReactNode
  className?: string
}) {
  const to = id ? routeFor(type, id) : undefined
  if (!to) return <span className={className}>{children}</span>
  return (
    <Link
      to={to}
      onClick={(e) => e.stopPropagation()}
      className={cn("rounded-sm hover:text-indigo-600 hover:underline", className)}
    >
      {children}
    </Link>
  )
}
