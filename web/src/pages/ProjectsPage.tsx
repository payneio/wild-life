import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { DateText, PriorityBadge, RefName, StatusBadge } from "@/components/cells"
import { PROJECT_FIELDS } from "@/services/api/fields"
import { projects } from "@/services/api/hooks"
import type { Project } from "@/services/api/types"

export function ProjectsPage() {
  const columns: Column<Project>[] = [
    { key: "name", label: "Project", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "priority", label: "Priority", render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: "area_id", label: "Area", render: (r) => <RefName kind="area" id={r.area_id} /> },
    { key: "next_action", label: "Next action", render: (r) => r.next_action || <span className="text-amber-600">— set one</span> },
    { key: "target_date", label: "Target", render: (r) => <DateText value={r.target_date} /> },
  ]
  return (
    <SimpleEntityPage
      title="Projects"
      subtitle="Finite efforts with a defined outcome"
      crud={projects}
      fields={PROJECT_FIELDS}
      columns={columns}
    />
  )
}
