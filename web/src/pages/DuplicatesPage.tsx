import { useState } from "react"
import { GitMerge } from "lucide-react"
import { MergeDialog } from "@/components/MergeDialog"
import { Badge, Button, Card, EmptyState } from "@/components/ui/primitives"
import { useDuplicates, type DuplicateGroup } from "@/services/api/hooks"
import { typeLabel } from "@/services/api/mentions"

export function DuplicatesPage() {
  const { data, isLoading } = useDuplicates()
  const [active, setActive] = useState<DuplicateGroup | null>(null)
  const groups = data ?? []
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Duplicates</h1>
        <p className="text-sm text-slate-500">
          Entities that share a name — merge to combine them into one.
        </p>
      </div>

      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState>No duplicates found.</EmptyState>
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => (
            <Card key={`${g.type}-${i}`} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {typeLabel(g.type)}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {g.members.map((m) => (
                    <Badge key={m.id}>{m.name}</Badge>
                  ))}
                  <span className="text-xs text-slate-400">({g.members.length})</span>
                </div>
              </div>
              <Button variant="secondary" onClick={() => setActive(g)}>
                <GitMerge size={14} /> Merge
              </Button>
            </Card>
          ))}
        </div>
      )}

      {active && (
        <MergeDialog
          type={active.type}
          survivor={{ id: active.members[0].id, label: active.members[0].name }}
          loser={{ id: active.members[1].id, label: active.members[1].name }}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  )
}
