import { useState } from "react"
import { History } from "lucide-react"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { EntityForm, type FieldSpec } from "@/components/EntityForm"
import { Button, EmptyState, Modal } from "@/components/ui/primitives"
import { formatDateTime } from "@/lib/utils"
import { interactions, people, usePersonInteractions } from "@/services/api/hooks"
import type { Body } from "@/services/api/crud"
import type { Person } from "@/services/api/types"

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "relationship", label: "Relationship" },
  { name: "organization", label: "Organization" },
  { name: "role", label: "Role" },
  { name: "emails", label: "Emails", type: "tags" },
  { name: "phones", label: "Phones", type: "tags" },
  { name: "preferred_contact", label: "Preferred contact" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

function InteractionsModal({ person, onClose }: { person: Person; onClose: () => void }) {
  const { data } = usePersonInteractions(person.id)
  const create = interactions.useCreate()
  const [adding, setAdding] = useState(false)
  const list = data ?? []
  return (
    <Modal title={`${person.name} — history`} onClose={onClose}>
      <div className="space-y-3">
        {list.length === 0 ? (
          <EmptyState>No interactions logged.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {list.map((i) => (
              <li key={i.id} className="rounded-lg border border-slate-100 p-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium capitalize">{i.kind}</span>
                  <span className="text-slate-400">{formatDateTime(i.occurred_at)}</span>
                </div>
                {i.summary && <p className="text-slate-600">{i.summary}</p>}
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <EntityForm
            fields={[
              { name: "occurred_at", label: "When", type: "datetime" },
              { name: "kind", label: "Kind", type: "select", options: ["call", "email", "meeting", "note"] },
              { name: "summary", label: "Summary", type: "textarea", full: true },
            ]}
            onSubmit={(body: Body) => {
              create.mutate({ ...body, person_id: person.id })
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
            submitLabel="Log"
          />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Log interaction
          </Button>
        )}
      </div>
    </Modal>
  )
}

export function PeoplePage() {
  const [selected, setSelected] = useState<Person | null>(null)
  const columns: Column<Person>[] = [
    { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "relationship", label: "Relationship" },
    { key: "organization", label: "Organization" },
    { key: "role", label: "Role" },
  ]
  return (
    <>
      <SimpleEntityPage
        title="People"
        subtitle="Contacts across your life and work"
        crud={people}
        fields={FIELDS}
        columns={columns}
        rowActions={(row) => (
          <button
            className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="History"
            onClick={() => setSelected(row)}
          >
            <History size={15} />
          </button>
        )}
      />
      {selected && <InteractionsModal person={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
