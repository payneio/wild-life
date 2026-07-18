import { useNavigate, useParams } from "react-router-dom"
import { X } from "lucide-react"
import { DetailDrawer } from "@/components/DetailDrawer"
import { EditableRecord } from "@/components/EditableRecord"
import { Card, EmptyState } from "@/components/ui/primitives"
import { REGISTRY } from "@/services/api/registry"
import type { Entity } from "@/services/api/types"

/**
 * Deep-linkable detail route: `/<entity>/:id`. Reads the id from the URL, fetches
 * the entity (cold deep-links work), and renders it as an inline pane on desktop
 * (beside the list, no backdrop — click-through stays possible) or a full-screen
 * overlay on mobile.
 */
export function EntityDetailRoute({ entityKey }: { entityKey: string }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const def = REGISTRY[entityKey]
  const { data, isLoading, isError } = def.crud.useGet(id)
  const close = () => navigate("..", { relative: "path" })
  const title = data ? def.title(data) : def.label

  const body = isLoading ? (
    <EmptyState>Loading…</EmptyState>
  ) : isError || !data ? (
    <EmptyState>Not found.</EmptyState>
  ) : (
    <EditableRecord def={def} entity={data as Entity} onClose={close} variant="pane" />
  )

  return (
    <>
      {/* Desktop: inline pane beside the list */}
      <div className="hidden min-w-0 lg:block lg:flex-1">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-display break-words text-xl font-medium text-slate-900">{title}</h2>
            <button
              onClick={close}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
          {body}
        </Card>
      </div>

      {/* Mobile: full-screen overlay */}
      <div className="lg:hidden">
        <DetailDrawer title={title} onClose={close}>
          {body}
        </DetailDrawer>
      </div>
    </>
  )
}
