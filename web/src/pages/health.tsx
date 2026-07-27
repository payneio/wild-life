import { RefName, StatusBadge } from "@/components/cells"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import {
  MEDICATION_FIELDS,
  PROTOCOL_FIELDS,
  INSURANCE_FIELDS,
  ALLERGY_FIELDS,
} from "@/services/api/fields"
import { Badge } from "@/components/ui/primitives"
import { humanize } from "@/lib/format"
import { protocolState } from "@/lib/protocol"
import {
  allergies,
  insurancePlans,
  medications,
  protocols,
} from "@/services/api/hooks"
import type {
  Allergy,
  InsurancePlan,
  Medication,
  Protocol,
} from "@/services/api/types"

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
          {r.brand ? <span className="text-slate-400"> · {r.brand}</span> : null}
        </span>
      ),
    },
    { key: "med_type", label: "Type", render: (r) => <Badge>{humanize(r.med_type)}</Badge> },
    { key: "program_id", label: "Treats", render: (r) => <RefName kind="program" id={r.program_id} /> },
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
    { key: "state", label: "State", render: (r) => <StatusBadge status={protocolState(r)} /> },
    { key: "program_id", label: "Program", render: (r) => <RefName kind="program" id={r.program_id} /> },
    { key: "program_id", label: "Treats", render: (r) => <RefName kind="program" id={r.program_id} /> },
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
