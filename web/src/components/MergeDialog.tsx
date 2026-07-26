import { useEffect, useState } from "react"
import { ArrowRight, ArrowLeftRight } from "lucide-react"
import { EntityCombobox } from "@/components/EntityCombobox"
import { Button, Modal } from "@/components/ui/primitives"
import { useMergeEntities, useMergePreview } from "@/services/api/hooks"
import { typeLabel } from "@/services/api/mentions"
import type { EntityType } from "@/services/api/types"

interface Ref {
  id: string
  label: string
}

/** Merge two same-type entities: the loser's references move to the survivor,
 * then the loser is deleted. Survivor = the entity that is kept. */
export function MergeDialog({
  type,
  survivor: initSurvivor,
  loser: initLoser,
  onClose,
  onMerged,
}: {
  type: EntityType
  survivor?: Ref | null
  loser?: Ref | null
  onClose: () => void
  onMerged?: (survivorId: string) => void
}) {
  const [survivor, setSurvivor] = useState<Ref | null>(initSurvivor ?? null)
  const [loser, setLoser] = useState<Ref | null>(initLoser ?? null)
  const preview = useMergePreview()
  const merge = useMergeEntities()

  // (Re)compute the preview whenever both sides are chosen.
  useEffect(() => {
    if (survivor && loser && survivor.id !== loser.id) {
      preview.mutate({ type, survivor_id: survivor.id, loser_id: loser.id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survivor?.id, loser?.id, type])

  function swap() {
    setSurvivor(loser)
    setLoser(survivor)
  }

  function confirm() {
    if (!survivor || !loser) return
    merge.mutate(
      { type, survivor_id: survivor.id, loser_id: loser.id },
      {
        onSuccess: () => {
          onMerged?.(survivor.id)
          onClose()
        },
      },
    )
  }

  const p = preview.data
  return (
    <Modal title={`Merge ${typeLabel(type)}`} onClose={onClose}>
      <div className="space-y-4">
        {/* survivor <- loser */}
        <div className="flex items-center gap-2 text-sm">
          <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
            <div className="text-xs font-medium uppercase tracking-wide text-emerald-600">Keep</div>
            <div className="break-words font-medium text-slate-800">{survivor?.label ?? "—"}</div>
          </div>
          <button
            type="button"
            title="Swap"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            disabled={!survivor || !loser}
            onClick={swap}
          >
            <ArrowLeftRight size={16} />
          </button>
          <div className="flex-1 rounded-lg border border-red-200 bg-red-50 p-2">
            <div className="text-xs font-medium uppercase tracking-wide text-red-600">Absorb + delete</div>
            <div className="break-words font-medium text-slate-800">{loser?.label ?? "—"}</div>
          </div>
        </div>

        {!survivor && (
          <div>
            <div className="mb-1 text-sm text-slate-500">Pick the entity to keep:</div>
            <EntityCombobox type={type} onSelect={(r) => setSurvivor(r)} placeholder="Search…"
            intent="reference" />
          </div>
        )}
        {survivor && !loser && (
          <div>
            <div className="mb-1 text-sm text-slate-500">Pick the duplicate to merge in:</div>
            <EntityCombobox
              type={type}
              excludeId={survivor.id}
              onSelect={(r) => setLoser(r)}
              placeholder="Search duplicates…"
            intent="reference"
            />
          </div>
        )}

        {survivor && loser && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <span className="break-words">{loser.label}</span>
              <ArrowRight size={14} />
              <span className="break-words">{survivor.label}</span>
            </div>
            {preview.isPending ? (
              <div className="mt-1 text-xs text-slate-400">Checking references…</div>
            ) : p ? (
              <div className="mt-1 text-xs text-slate-500">
                Repoints <b>{p.total_references}</b> reference{p.total_references === 1 ? "" : "s"}
                {p.note_bodies > 0 && <> + rewrites <b>{p.note_bodies}</b> note{p.note_bodies === 1 ? "" : "s"}</>}, then deletes “{loser.label}”. This can’t be undone.
              </div>
            ) : null}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!survivor || !loser || merge.isPending} onClick={confirm}>
            {merge.isPending ? "Merging…" : "Merge"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
