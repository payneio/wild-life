import { useNavigate, useParams } from "react-router-dom"
import { DetailDrawer } from "@/components/DetailDrawer"
import { DetailView } from "@/components/DetailView"
import { EmptyState } from "@/components/ui/primitives"
import { REGISTRY } from "@/services/api/registry"
import type { Entity } from "@/services/api/types"

/**
 * Deep-linkable detail route: `/<entity>/:id`. Reads the id from the URL,
 * fetches the entity (cold deep-links work), and shows it in the drawer.
 */
export function EntityDetailRoute({ entityKey }: { entityKey: string }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const def = REGISTRY[entityKey]
  const { data, isLoading, isError } = def.crud.useGet(id)
  const close = () => navigate("..", { relative: "path" })

  return (
    <DetailDrawer
      title={data ? def.title(data) : def.label}
      onClose={close}
    >
      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : isError || !data ? (
        <EmptyState>Not found.</EmptyState>
      ) : (
        <DetailView
          def={def}
          entity={data as Entity}
          onClose={close}
          extra={def.extra ? <def.extra entity={data as Entity} /> : undefined}
        />
      )}
    </DetailDrawer>
  )
}
