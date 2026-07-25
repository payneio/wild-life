import { MapPin } from "lucide-react"
import { Record, RecordSection } from "@/components/record/Record"
import { useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { LOCATION_CATEGORY } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Location } from "@/services/api/types"

const F = recordFields<Location>()


/** Maps link over whatever address parts are filled in. Read-only, and derived —
 *  so it claims no fields; the inputs above it own them. */
function MapsLink() {
  const { row } = useFields([])
  const parts = [row.address, row.city, row.region].filter(Boolean) as string[]
  if (parts.length === 0) return null
  const q = encodeURIComponent(parts.join(", "))
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${q}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline sm:col-span-2"
    >
      <MapPin size={14} /> Open in Maps
    </a>
  )
}

export function LocationDetail({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  return (
    <Record def={REGISTRY.location} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Location name" />
        <F.Select field="category" label="Category" options={LOCATION_CATEGORY} />
      </RecordSection>

      <RecordSection title="Address">
        <F.Text field="address" label="Street" full />
        <F.Text field="city" label="City" />
        <F.Text field="region" label="Region" />
        <MapsLink />
      </RecordSection>

      <RecordSection>
        <F.Textarea field="notes" label="Notes" />
      </RecordSection>
    </Record>
  )
}
