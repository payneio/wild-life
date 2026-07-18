import { DateText, RefName, StatusBadge } from "@/components/cells"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import {
  COMMITMENT_FIELDS,
  DECISION_FIELDS,
  PROGRAM_FIELDS,
  REQUEST_FIELDS,
  RESOURCE_FIELDS,
  TAG_FIELDS,
} from "@/services/api/fields"
import { Badge } from "@/components/ui/primitives"
import { refFilter } from "@/lib/listFilter"
import {
  areas,
  commitments,
  decisions,
  programs,
  requests,
  resources,
  tags,
} from "@/services/api/hooks"
import type {
  Commitment,
  Decision,
  Program,
  Request,
  Resource,
  Tag,
} from "@/services/api/types"

export function ProgramsPage() {
  const fields = PROGRAM_FIELDS
  const { data: areaList } = areas.useList()
  const columns: Column<Program>[] = [
    { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "area_id", label: "Area", render: (r) => <RefName kind="area" id={r.area_id} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "target_date", label: "Target", render: (r) => <DateText value={r.target_date} /> },
  ]
  return (
    <SimpleEntityPage
      title="Programs"
      subtitle="Long-running efforts to improve an area"
      crud={programs}
      fields={fields}
      columns={columns}
      detail="page"
      extraFilters={() => [refFilter("area_id", "Area", areaList ?? [])]}
    />
  )
}

export function CommitmentsPage() {
  const fields = COMMITMENT_FIELDS
  const columns: Column<Commitment>[] = [
    { key: "description", label: "Commitment", render: (r) => <span className="font-medium">{r.description}</span> },
    { key: "beneficiary_id", label: "To", render: (r) => <RefName kind="people" id={r.beneficiary_id} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "due_date", label: "Due", render: (r) => <DateText value={r.due_date} overdue /> },
  ]
  return (
    <SimpleEntityPage
      title="Commitments"
      subtitle="Promises and obligations"
      crud={commitments}
      fields={fields}
      columns={columns}
    />
  )
}

export function RequestsPage() {
  const fields = REQUEST_FIELDS
  const columns: Column<Request>[] = [
    { key: "subject", label: "Subject", render: (r) => <span className="font-medium">{r.subject}</span> },
    { key: "requester_id", label: "From", render: (r) => (r.requester_id ? <RefName kind="people" id={r.requester_id} /> : "—") },
    { key: "addressee_id", label: "To", render: (r) => (r.addressee_id ? <RefName kind="people" id={r.addressee_id} /> : r.external_label || "—") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "needed_by", label: "Needed", render: (r) => <DateText value={r.needed_by} overdue /> },
  ]
  return (
    <SimpleEntityPage
      title="Requests"
      subtitle="Asks & answers between you and your collaborators"
      crud={requests}
      fields={fields}
      columns={columns}
    />
  )
}

export function ResourcesPage() {
  const fields = RESOURCE_FIELDS
  const columns: Column<Resource>[] = [
    { key: "title", label: "Title", render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "resource_type", label: "Type", render: (r) => (r.resource_type ? <Badge>{r.resource_type}</Badge> : "—") },
    {
      key: "url",
      label: "URL",
      render: (r) =>
        r.url ? (
          <a className="text-indigo-600 hover:underline" href={r.url} target="_blank" rel="noreferrer">
            open
          </a>
        ) : (
          "—"
        ),
    },
  ]
  return (
    <SimpleEntityPage
      title="Resources"
      subtitle="Links, docs, tools, references"
      crud={resources}
      fields={fields}
      columns={columns}
    />
  )
}

export function DecisionsPage() {
  const fields = DECISION_FIELDS
  const columns: Column<Decision>[] = [
    { key: "question", label: "Question", render: (r) => <span className="font-medium">{r.question}</span> },
    { key: "decision", label: "Decision", render: (r) => r.decision || "—" },
    { key: "decided_on", label: "Decided", render: (r) => <DateText value={r.decided_on} /> },
  ]
  return (
    <SimpleEntityPage
      title="Decisions"
      subtitle="Recorded choices and rationale"
      crud={decisions}
      fields={fields}
      columns={columns}
    />
  )
}

export function TagsPage() {
  const fields = TAG_FIELDS
  const columns: Column<Tag>[] = [
    {
      key: "name",
      label: "Tag",
      render: (r) => <Badge color={r.color}>{r.name}</Badge>,
    },
    { key: "color", label: "Color", render: (r) => r.color || "—" },
  ]
  return (
    <SimpleEntityPage
      title="Tags"
      subtitle="Lightweight labels"
      crud={tags}
      fields={fields}
      columns={columns}
    />
  )
}
