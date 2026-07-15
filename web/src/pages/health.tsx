import { DateText, RefName, StatusBadge } from "@/components/cells"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { type FieldSpec } from "@/components/EntityForm"
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

const CONDITION_CATEGORY = [
  "gastrointestinal",
  "cardiovascular",
  "dermatologic",
  "musculoskeletal",
  "urologic",
  "auditory",
  "mental_health",
  "other",
] as const
const CONDITION_STATUS = ["active", "monitoring", "chronic", "resolved", "ruled_out"] as const
const MED_TYPE = ["prescription", "otc", "supplement"] as const
const MED_STATUS = ["active", "discontinued", "as_needed", "planned", "completed"] as const
const PROTOCOL_STATUS = ["planned", "active", "paused", "completed", "abandoned"] as const
const EVENT_TYPE = [
  "appointment",
  "lab",
  "procedure",
  "surgery",
  "imaging",
  "test",
  "vaccination",
  "injury",
  "symptom",
  "note",
] as const
const PLAN_TYPE = ["medical", "dental", "vision", "pharmacy"] as const
const ALLERGY_TYPE = ["medication", "food", "environmental", "other"] as const
const ALLERGY_SEVERITY = ["mild", "moderate", "severe", "unknown"] as const
const ALLERGY_STATUS = ["active", "suspected", "resolved"] as const

function scheduleSummary(schedule: DoseSlot[]): string {
  if (!schedule?.length) return "—"
  return schedule.map((s) => (s.amount ? `${s.amount} @ ${s.slot}` : s.slot)).join(", ")
}

// --- Conditions -------------------------------------------------------------
export function ConditionsPage() {
  const fields: FieldSpec[] = [
    { name: "name", label: "Name" },
    { name: "category", label: "Category", type: "select", options: CONDITION_CATEGORY },
    { name: "status", label: "Status", type: "select", options: CONDITION_STATUS },
    { name: "area_id", label: "Area", type: "entity", lookup: "area" },
    { name: "program_id", label: "Program", type: "entity", lookup: "program" },
    { name: "severity", label: "Severity" },
    { name: "onset_date", label: "Onset", type: "date" },
    { name: "resolved_date", label: "Resolved", type: "date" },
    { name: "diagnosed_by_id", label: "Diagnosed by", type: "entity", lookup: "people" },
    { name: "description", label: "Description", type: "textarea", full: true },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ]
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
  const fields: FieldSpec[] = [
    { name: "name", label: "Name" },
    { name: "brand", label: "Brand" },
    { name: "generic_name", label: "Generic name" },
    { name: "med_type", label: "Type", type: "select", options: MED_TYPE },
    { name: "strength", label: "Strength", placeholder: "40mg" },
    { name: "dose", label: "Dose", placeholder: "1 tablet" },
    { name: "status", label: "Status", type: "select", options: MED_STATUS },
    { name: "start_date", label: "Started", type: "date" },
    { name: "end_date", label: "Stopped", type: "date" },
    { name: "condition_id", label: "For condition", type: "entity", lookup: "condition" },
    { name: "prescriber_id", label: "Prescriber", type: "entity", lookup: "people" },
    { name: "pharmacy_id", label: "Pharmacy", type: "entity", lookup: "organization" },
    { name: "reason", label: "Reason", type: "textarea" },
    { name: "instructions", label: "Instructions", type: "textarea" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ]
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
  const fields: FieldSpec[] = [
    { name: "name", label: "Name" },
    { name: "category", label: "Category" },
    { name: "status", label: "Status", type: "select", options: PROTOCOL_STATUS },
    { name: "area_id", label: "Area", type: "entity", lookup: "area" },
    { name: "program_id", label: "Program", type: "entity", lookup: "program" },
    { name: "duration", label: "Duration", placeholder: "4-6 wk" },
    { name: "start_date", label: "Start", type: "date" },
    { name: "end_date", label: "End", type: "date" },
    { name: "condition_id", label: "For condition", type: "entity", lookup: "condition" },
    { name: "provider_id", label: "Provider", type: "entity", lookup: "people" },
    { name: "intended_outcome", label: "Intended outcome", type: "textarea", full: true },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ]
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
  const fields: FieldSpec[] = [
    { name: "occurred_on", label: "Date", type: "date" },
    { name: "event_type", label: "Type", type: "select", options: EVENT_TYPE },
    { name: "title", label: "Title", full: true },
    { name: "provider_id", label: "Provider", type: "entity", lookup: "people" },
    { name: "organization_id", label: "Facility", type: "entity", lookup: "organization" },
    { name: "condition_id", label: "Condition", type: "entity", lookup: "condition" },
    { name: "summary", label: "Summary", type: "textarea", full: true },
    { name: "findings", label: "Findings / results", type: "textarea", full: true },
    { name: "recommendations", label: "Recommendations", type: "textarea", full: true },
    { name: "follow_up", label: "Follow-up", type: "textarea" },
    { name: "follow_up_date", label: "Follow-up date", type: "date" },
    { name: "location", label: "Location" },
    { name: "external_ref", label: "External ref", placeholder: "MyChart / OneDrive" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ]
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
  const fields: FieldSpec[] = [
    { name: "name", label: "Plan name" },
    { name: "plan_type", label: "Type", type: "select", options: PLAN_TYPE },
    { name: "organization_id", label: "Insurer", type: "entity", lookup: "organization" },
    { name: "network", label: "Network" },
    { name: "member_id", label: "Member ID" },
    { name: "group_number", label: "Group #" },
    { name: "rx_bin", label: "RX BIN" },
    { name: "rx_pcn", label: "RX PCN" },
    { name: "rx_group", label: "RX Group" },
    { name: "phone", label: "Phone" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ]
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
  const fields: FieldSpec[] = [
    { name: "substance", label: "Substance" },
    { name: "allergy_type", label: "Type", type: "select", options: ALLERGY_TYPE },
    { name: "reaction", label: "Reaction" },
    { name: "severity", label: "Severity", type: "select", options: ALLERGY_SEVERITY },
    { name: "status", label: "Status", type: "select", options: ALLERGY_STATUS },
    { name: "noted_on", label: "Noted on", type: "date" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ]
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
