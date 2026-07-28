import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { Badge } from "@/components/ui/primitives"
import { LOCATION_FIELDS } from "@/services/api/fields"
import { locations } from "@/services/api/hooks"
import type { Location } from "@/services/api/types"

export function LocationsPage() {
  const columns: Column<Location>[] = [
    { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "category", label: "Category", render: (r) => (r.category ? <Badge>{r.category}</Badge> : "—") },
    { key: "city", label: "City", render: (r) => r.city || "—" },
    { key: "region", label: "Region", render: (r) => r.region || "—" },
  ]
  return (
    <SimpleEntityPage
      title="Locations"
      subtitle="Places you reference across notes and events"
      crud={locations}
      fields={LOCATION_FIELDS}
      columns={columns}
      // A location now carries a map, a fence you draw, and its own visit
      // history — it became somewhere you go in and work rather than something
      // you glance at beside a list. See docs/ui-architecture.md §5 (Spatiality).
    />
  )
}
