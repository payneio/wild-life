import { useNavigate, useParams } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { DetailSurface } from "@/components/record/DetailSurface"
import { EmptyState } from "@/components/ui/primitives"
import { REGISTRY } from "@/services/api/registry"
import type { Entity } from "@/services/api/types"

/**
 * Full-page ("workbench") frame for a single record. The item gets the whole
 * screen to work in — the same EditableRecord as the pane/modal, just variant
 * "page". Used for entities you go *into* to do work (Tasks, Projects, …) rather
 * than peek at beside a list.
 */
export function RecordPage({
  entityKey,
  backTo,
  backLabel,
}: {
  entityKey: string
  backTo: string
  backLabel: string
}) {
  const { id } = useParams()
  const navigate = useNavigate()
  const def = REGISTRY[entityKey]
  const { data, isLoading, isError } = def.crud.useGet(id)
  const close = () => navigate(backTo)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <button
        onClick={close}
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-800"
      >
        <ChevronLeft size={16} /> {backLabel}
      </button>
      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : isError || !data ? (
        <EmptyState>Not found.</EmptyState>
      ) : (
        <DetailSurface def={def} entity={data as Entity} onClose={close} variant="page" />
      )}
    </div>
  )
}
