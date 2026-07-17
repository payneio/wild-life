import { useState } from "react"
import { Pencil, Plus, Star, Trash2 } from "lucide-react"
import { Badge, Button, Field, Input, Select } from "@/components/ui/primitives"
import { EntityRef } from "@/components/graph/EntityRef"
import { formatDate } from "@/lib/utils"
import type { Body } from "@/services/api/crud"
import {
  useDeleteAffiliation,
  useOrganizationAffiliations,
  usePersonAffiliations,
  useSaveAffiliation,
} from "@/services/api/hooks"
import { useOrganizationLookup, usePeopleLookup } from "@/services/api/lookups"
import type { Affiliation } from "@/services/api/types"

// Editable from either side: pass the id of the person OR the organization
// whose affiliations you're managing; the other side becomes the picker.
type Props = { personId: string } | { organizationId: string }

interface Draft {
  otherId: string
  role: string
  is_primary: boolean
  start_date: string
  end_date: string
}

const EMPTY: Draft = {
  otherId: "",
  role: "",
  is_primary: false,
  start_date: "",
  end_date: "",
}

export function AffiliationsEditor(props: Props) {
  const byPerson = "personId" in props
  const personId = byPerson ? props.personId : null
  const orgId = byPerson ? null : props.organizationId

  const personAff = usePersonAffiliations(personId)
  const orgAff = useOrganizationAffiliations(orgId)
  const list = (byPerson ? personAff.data : orgAff.data) ?? []

  const orgLookup = useOrganizationLookup()
  const peopleLookup = usePeopleLookup()
  const otherLookup = byPerson ? orgLookup : peopleLookup
  const otherLabel = byPerson ? "Organization" : "Person"

  const save = useSaveAffiliation()
  const del = useDeleteAffiliation()

  const [editing, setEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)

  function startAdd() {
    setDraft(EMPTY)
    setEditingId(null)
    setEditing(true)
  }

  function startEdit(a: Affiliation) {
    setDraft({
      otherId: byPerson ? a.organization_id : a.person_id,
      role: a.role ?? "",
      is_primary: a.is_primary,
      start_date: a.start_date ?? "",
      end_date: a.end_date ?? "",
    })
    setEditingId(a.id)
    setEditing(true)
  }

  function submit() {
    if (!draft.otherId) return
    const body: Body = {
      person_id: byPerson ? personId : draft.otherId,
      organization_id: byPerson ? draft.otherId : orgId,
      role: draft.role || null,
      is_primary: draft.is_primary,
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
    }
    save.mutate(
      { id: editingId ?? undefined, body },
      {
        onSuccess: () => {
          setEditing(false)
          setEditingId(null)
        },
      },
    )
  }

  return (
    <div className="space-y-2">
      {list.length === 0 && !editing && (
        <p className="text-sm text-slate-400">No affiliations yet.</p>
      )}
      <ul className="space-y-1.5">
        {list.map((a) => {
          const otherId = byPerson ? a.organization_id : a.person_id
          return (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-sm"
            >
              <EntityRef
                type={byPerson ? "organization" : "person"}
                id={otherId}
                className="font-medium text-slate-700"
              >
                {otherLookup.nameOf(otherId)}
              </EntityRef>
              {a.role && <span className="text-slate-500">· {a.role}</span>}
              {a.is_primary && (
                <Badge className="bg-amber-100 text-amber-700">
                  <Star size={11} /> primary
                </Badge>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {a.start_date ? formatDate(a.start_date) : "—"} –{" "}
                {a.end_date ? formatDate(a.end_date) : "present"}
              </span>
              <button
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Edit"
                onClick={() => startEdit(a)}
              >
                <Pencil size={14} />
              </button>
              <button
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Remove"
                onClick={() => del.mutate(a.id)}
              >
                <Trash2 size={14} />
              </button>
            </li>
          )
        })}
      </ul>

      {editing ? (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Field label={otherLabel}>
              <Select
                value={draft.otherId}
                onChange={(e) => setDraft({ ...draft, otherId: e.target.value })}
              >
                <option value="">—</option>
                {otherLookup.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Role">
              <Input
                value={draft.role}
                placeholder="e.g. Board Member"
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              />
            </Field>
            <Field label="Start">
              <Input
                type="date"
                value={draft.start_date}
                onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
              />
            </Field>
            <Field label="End (blank = current)">
              <Input
                type="date"
                value={draft.end_date}
                onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={draft.is_primary}
              onChange={(e) => setDraft({ ...draft, is_primary: e.target.checked })}
            />
            Primary affiliation
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(false)
                setEditingId(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={submit}>{editingId ? "Save" : "Add"}</Button>
          </div>
        </div>
      ) : (
        <button
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
          onClick={startAdd}
        >
          <Plus size={14} /> Add affiliation
        </button>
      )}
    </div>
  )
}
