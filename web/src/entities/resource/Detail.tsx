import { ExternalLink } from "lucide-react"
import { Record, RecordSection } from "@/components/record/Record"
import { useField } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { RESOURCE_TYPE } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Resource } from "@/services/api/types"

const F = recordFields<Resource>()


/** The URL, with the "open it" affordance attached to the field it belongs to. */
function UrlField() {
  const { value, save } = useField("url")
  const url = (value as string | null) ?? ""
  return (
    <div className="sm:col-span-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">URL</div>
      <div className="mt-0.5 flex items-center gap-2">
        <input
          type="url"
          value={url}
          placeholder="https://…"
          onChange={(e) => save(e.target.value || null)}
          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-slate-800 transition placeholder:text-slate-300 hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
        />
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-on-accent transition hover:bg-indigo-700"
          >
            <ExternalLink size={14} /> Open
          </a>
        )}
      </div>
    </div>
  )
}

export function ResourceDetail({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  return (
    <Record def={REGISTRY.resource} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="title" placeholder="Resource title" />
        <UrlField />
        <F.Select field="resource_type" label="Type" options={RESOURCE_TYPE} />
        <F.Textarea field="description" label="Description" />
        {/* Editable for the first time: RESOURCE_FIELDS never listed the
            soft-poly pair, so the generic form couldn't reach it. */}
        <F.Root />
      </RecordSection>
    </Record>
  )
}
