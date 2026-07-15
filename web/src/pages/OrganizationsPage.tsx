import { StatusBadge } from "@/components/cells"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { Badge } from "@/components/ui/primitives"
import { ORGANIZATION_FIELDS } from "@/services/api/registry"
import { organizations } from "@/services/api/hooks"
import type { Organization } from "@/services/api/types"

export function OrganizationsPage() {
  const columns: Column<Organization>[] = [
    { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "org_type", label: "Type", render: (r) => (r.org_type ? <Badge>{r.org_type}</Badge> : "—") },
    { key: "industry", label: "Industry", render: (r) => r.industry || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "website",
      label: "Website",
      render: (r) =>
        r.website ? (
          <a
            className="text-indigo-600 hover:underline"
            href={r.website.startsWith("http") ? r.website : `https://${r.website}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            open
          </a>
        ) : (
          "—"
        ),
    },
  ]
  return (
    <SimpleEntityPage
      title="Organizations"
      subtitle="Companies, clients, vendors, and institutions"
      crud={organizations}
      fields={ORGANIZATION_FIELDS}
      columns={columns}
    />
  )
}
