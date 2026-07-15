import { useState } from "react"
import { Users } from "lucide-react"
import { AffiliationsEditor } from "@/components/AffiliationsEditor"
import { StatusBadge } from "@/components/cells"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import type { FieldSpec } from "@/components/EntityForm"
import { Badge, Modal } from "@/components/ui/primitives"
import { organizations } from "@/services/api/hooks"
import type { Organization } from "@/services/api/types"

const ORG_TYPE = [
  "employer",
  "client",
  "vendor",
  "partner",
  "nonprofit",
  "school",
  "government",
  "community",
  "other",
] as const

const ORG_STATUS = ["active", "inactive", "archived"] as const

export function OrganizationsPage() {
  const [members, setMembers] = useState<Organization | null>(null)
  const fields: FieldSpec[] = [
    { name: "name", label: "Name" },
    { name: "org_type", label: "Type", type: "select", options: ORG_TYPE },
    { name: "industry", label: "Industry" },
    { name: "status", label: "Status", type: "select", options: ORG_STATUS },
    { name: "website", label: "Website", full: true },
    { name: "email", label: "Email" },
    { name: "phone", label: "Phone" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "notes", label: "Notes", type: "textarea" },
  ]
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
          >
            open
          </a>
        ) : (
          "—"
        ),
    },
  ]
  return (
    <>
      <SimpleEntityPage
        title="Organizations"
        subtitle="Companies, clients, vendors, and institutions"
        crud={organizations}
        fields={fields}
        columns={columns}
        rowActions={(row) => (
          <button
            className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Members"
            onClick={() => setMembers(row)}
          >
            <Users size={15} />
          </button>
        )}
      />
      {members && (
        <Modal title={`${members.name} — members`} onClose={() => setMembers(null)}>
          <AffiliationsEditor organizationId={members.id} />
        </Modal>
      )}
    </>
  )
}
