import { DateText, RefName, RootName, StatusBadge } from "@/components/cells"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import {
  COMMITMENT_FIELDS,
  DECISION_FIELDS,
  METRIC_GROUP_FIELDS,
  REQUEST_FIELDS,
  RESOURCE_FIELDS,
} from "@/services/api/fields"
import { Badge } from "@/components/ui/primitives"
import { commitments, decisions, metricGroups, requests, resources } from "@/services/api/hooks"
import type { Commitment, Decision, MetricGroup, Request, Resource } from "@/services/api/types"

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

export function MetricGroupsPage() {
  const columns: Column<MetricGroup>[] = [
    { key: "name", label: "Group", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "root", label: "Measures", render: (r) => <RootName type={r.entity_type} id={r.entity_id} /> },
  ]
  return (
    <SimpleEntityPage
      title="Metric groups"
      subtitle="Numbers you read together — a panel, a cuff, a monthly look at every balance"
      crud={metricGroups}
      fields={METRIC_GROUP_FIELDS}
      columns={columns}
      newLabel="New group"
      emptyText="No groups yet."
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

