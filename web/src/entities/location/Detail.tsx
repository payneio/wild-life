import { lazy, Suspense } from "react"
import { AddressFields } from "@/components/record/AddressFields"
import { Record, RecordSection } from "@/components/record/Record"
import { recordFields } from "@/components/record/typed"
import { VisitsPanel } from "@/entities/location/VisitsPanel"
import { LOCATION_CATEGORY } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Location } from "@/services/api/types"

const F = recordFields<Location>()

// Leaflet plus its wrapper is ~52 KB gzipped and only two surfaces need it, so it
// stays out of the main bundle.
const LocationMap = lazy(() =>
  import("@/components/record/LocationMap").then((m) => ({ default: m.LocationMap })),
)

export function LocationDetail({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  return (
    <Record
      def={REGISTRY.location}
      entity={entity}
      onClose={onClose}
      // Internal bookkeeping: set when the fence moves so the tick knows to
      // re-derive this location's history, and cleared when it has. Not data.
      omit={["geo_dirty_at"]}
    >
      <RecordSection>
        <F.Title field="name" placeholder="Location name" />
        <F.Select field="category" label="Category" options={LOCATION_CATEGORY} />
      </RecordSection>

      <RecordSection title="Address">
        {/* The pin is the authoritative thing — it is what readings are matched
            against — so the address is a label for it, and the button fills it
            in rather than making you type it. */}
        <AddressFields lookupPath={`/locations/${entity.id}/lookup-address`} />
      </RecordSection>

      <RecordSection title="Fence">
        <Suspense
          fallback={
            <div className="h-[260px] animate-pulse rounded-lg bg-stone-100 sm:col-span-2 dark:bg-stone-800" />
          }
        >
          <LocationMap />
        </Suspense>
        <F.Number field="latitude" label="Latitude" />
        <F.Number field="longitude" label="Longitude" />
        <F.Number field="radius_m" label="Radius (m)" />
      </RecordSection>

      <RecordSection>
        <VisitsPanel />
      </RecordSection>

      <RecordSection>
        <F.Textarea field="description" label="Description" />
      </RecordSection>
    </Record>
  )
}
