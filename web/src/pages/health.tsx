import { DateText, RefName, StatusBadge } from "@/components/cells"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import {
  CONDITION_FIELDS,
  MEDICATION_FIELDS,
  PROTOCOL_FIELDS,
  HEALTH_EVENT_FIELDS,
  INSURANCE_FIELDS,
  ALLERGY_FIELDS,
} from "@/services/api/registry"
import { Badge } from "@/components/ui/primitives"
import { humanize } from "@/lib/format"
import {
  allergies,
  conditions,
  healthEvents,
  insurancePlans,
  medications,
  protocols,
} from "@/services/api/hooks"
import type {
  Allergy,
  Condition,
  DoseSlot,
  HealthEvent,
  InsurancePlan,
  Medication,
  Protocol,
} from "@/services/api/types"

function scheduleSummary(schedule: DoseSlot[]): string {
  if (!schedule?.length) return "—"
  return schedule.map((s) => (s.amount ? `${s.amount} @ ${s.slot}` : s.slot)).join(", ")
}

// --- Conditions -------------------------------------------------------------
export function ConditionsPage() {
  const fields = CONDITION_FIELDS
  const columns: Column<Condition>[] = [
    { key: "name", label: "Condition", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "category", label: "Category", render: (r) => (r.category ? <Badge>{humanize(r.category)}</Badge> : "—") },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "program_id", label: "Program", render: (r) => <RefName kind="program" id={r.program_id} /> },
    { key: "onset_date", label: "Onset", render: (r) => <DateText value={r.onset_date} /> },
  ]
  return (
    <SimpleEntityPage
      title="Conditions"
      subtitle="Diagnoses and ongoing health conditions"
      crud={conditions}
      fields={fields}
      columns={columns}
    />
  )
}

// --- Medications ------------------------------------------------------------
export function MedicationsPage() {
  const fields = MEDICATION_FIELDS
  const columns: Column<Medication>[] = [
    {
      key: "name",
      label: "Medication",
      render: (r) => (
        <span className="font-medium">
          {r.name}
          {r.strength ? <span className="text-slate-400"> · {r.strength}</span> : null}
        </span>
      ),
    },
    { key: "med_type", label: "Type", render: (r) => <Badge>{humanize(r.med_type)}</Badge> },
    { key: "schedule", label: "Schedule", render: (r) => <span className="text-slate-500">{scheduleSummary(r.schedule)}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "condition_id", label: "For", render: (r) => <RefName kind="condition" id={r.condition_id} /> },
  ]
  return (
    <SimpleEntityPage
      title="Medications"
      subtitle="Drugs and supplements — dose, schedule, and why"
      crud={medications}
      fields={fields}
      columns={columns}
      emptyText="No medications yet."
    />
  )
}

// --- Protocols --------------------------------------------------------------
export function ProtocolsPage() {
  const fields = PROTOCOL_FIELDS
  const columns: Column<Protocol>[] = [
    { key: "name", label: "Protocol", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "program_id", label: "Program", render: (r) => <RefName kind="program" id={r.program_id} /> },
    { key: "condition_id", label: "For", render: (r) => <RefName kind="condition" id={r.condition_id} /> },
  ]
  return (
    <SimpleEntityPage
      title="Protocols"
      subtitle="Treatment regimens and their dosed steps"
      crud={protocols}
      fields={fields}
      columns={columns}
    />
  )
}

// --- Health events ----------------------------------------------------------
export function HealthEventsPage() {
  const fields = HEALTH_EVENT_FIELDS
  const columns: Column<HealthEvent>[] = [
    { key: "occurred_on", label: "Date", render: (r) => <DateText value={r.occurred_on} /> },
    { key: "event_type", label: "Type", render: (r) => <Badge>{humanize(r.event_type)}</Badge> },
    { key: "title", label: "Title", render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "provider_id", label: "Provider", render: (r) => <RefName kind="people" id={r.provider_id} /> },
    { key: "condition_id", label: "Condition", render: (r) => <RefName kind="condition" id={r.condition_id} /> },
  ]
  return (
    <SimpleEntityPage
      title="Health events"
      subtitle="Visits, labs, procedures, and results"
      crud={healthEvents}
      fields={fields}
      columns={columns}
      newLabel="New event"
      emptyText="No health events yet."
    />
  )
}

// --- Insurance --------------------------------------------------------------
export function InsurancePage() {
  const fields = INSURANCE_FIELDS
  const columns: Column<InsurancePlan>[] = [
    { key: "name", label: "Plan", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "plan_type", label: "Type", render: (r) => (r.plan_type ? <Badge>{humanize(r.plan_type)}</Badge> : "—") },
    { key: "member_id", label: "Member ID", render: (r) => r.member_id || "—" },
    { key: "group_number", label: "Group", render: (r) => r.group_number || "—" },
  ]
  return (
    <SimpleEntityPage
      title="Insurance"
      subtitle="Coverage and the IDs you need to use it"
      crud={insurancePlans}
      fields={fields}
      columns={columns}
      newLabel="New plan"
      emptyText="No insurance plans yet."
    />
  )
}

// --- Allergies --------------------------------------------------------------
export function AllergiesPage() {
  const fields = ALLERGY_FIELDS
  const columns: Column<Allergy>[] = [
    { key: "substance", label: "Substance", render: (r) => <span className="font-medium">{r.substance}</span> },
    { key: "allergy_type", label: "Type", render: (r) => (r.allergy_type ? <Badge>{humanize(r.allergy_type)}</Badge> : "—") },
    { key: "reaction", label: "Reaction", render: (r) => r.reaction || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ]
  return (
    <SimpleEntityPage
      title="Allergies"
      subtitle="Allergies and intolerances"
      crud={allergies}
      fields={fields}
      columns={columns}
      emptyText="No allergies recorded."
    />
  )
}
