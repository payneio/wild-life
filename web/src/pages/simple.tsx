import { DateText, RefName, StatusBadge } from "@/components/cells"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import {
  COMMITMENT_FIELDS,
  DECISION_FIELDS,
  EVENT_FIELDS,
  NOTE_FIELDS,
  PROGRAM_FIELDS,
  RESOURCE_FIELDS,
  TAG_FIELDS,
  WAITING_FIELDS,
} from "@/services/api/registry"
import { Badge } from "@/components/ui/primitives"
import { formatDateTime } from "@/lib/utils"
import {
  commitments,
  decisions,
  events,
  notes,
  programs,
  resources,
  tags,
  waitingItems,
} from "@/services/api/hooks"
import type {
  Commitment,
  Decision,
  EventItem,
  Note,
  Program,
  Resource,
  Tag,
  WaitingItem,
} from "@/services/api/types"

export function ProgramsPage() {
  const fields = PROGRAM_FIELDS
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
    />
  )
}

export function EventsPage() {
  const fields = EVENT_FIELDS
  const columns: Column<EventItem>[] = [
    { key: "title", label: "Title", render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "start_at", label: "When", render: (r) => formatDateTime(r.start_at) },
    { key: "location", label: "Where" },
    { key: "area_id", label: "Area", render: (r) => <RefName kind="area" id={r.area_id} /> },
  ]
  return (
    <SimpleEntityPage
      title="Events"
      subtitle="Calendar items"
      crud={events}
      fields={fields}
      columns={columns}
    />
  )
}

export function NotesPage() {
  const fields = NOTE_FIELDS
  const columns: Column<Note>[] = [
    {
      key: "title",
      label: "Title",
      render: (r) => <span className="font-medium">{r.title || "(untitled)"}</span>,
    },
    { key: "note_type", label: "Type", render: (r) => <Badge>{r.note_type}</Badge> },
    { key: "entry_date", label: "Date", render: (r) => <DateText value={r.entry_date} /> },
    {
      key: "body",
      label: "Preview",
      render: (r) => <span className="text-slate-500">{r.body.slice(0, 60)}</span>,
    },
  ]
  return (
    <SimpleEntityPage
      title="Notes"
      subtitle="Journal entries, ideas, meeting notes"
      crud={notes}
      fields={fields}
      columns={columns}
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

export function WaitingPage() {
  const fields = WAITING_FIELDS
  const columns: Column<WaitingItem>[] = [
    { key: "expected_result", label: "Expecting", render: (r) => <span className="font-medium">{r.expected_result}</span> },
    { key: "from", label: "From", render: (r) => (r.person_id ? <RefName kind="people" id={r.person_id} /> : r.from_org || "—") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "follow_up_date", label: "Follow up", render: (r) => <DateText value={r.follow_up_date} overdue /> },
  ]
  return (
    <SimpleEntityPage
      title="Waiting on"
      subtitle="Things expected from others"
      crud={waitingItems}
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
