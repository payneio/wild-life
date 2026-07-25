import { asDay } from "@/lib/date"
import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button, Field, Input, Select } from "@/components/ui/primitives"
import type { Body } from "@/services/api/crud"
import type { ContactMethod, ImportantDate, Person } from "@/services/api/types"

const LABELS = ["mobile", "home", "work", "main", "other", "company", "custom"]

function blank(): ContactMethod {
  return { value: "", label: "mobile" }
}

function MethodRows({
  title,
  rows,
  onChange,
  placeholder,
}: {
  title: string
  rows: ContactMethod[]
  onChange: (rows: ContactMethod[]) => void
  placeholder: string
}) {
  const set = (i: number, patch: Partial<ContactMethod>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="col-span-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{title}</span>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
          onClick={() => onChange([...rows, blank()])}
        >
          <Plus size={13} /> Add
        </button>
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              className="flex-1"
              value={r.value}
              placeholder={placeholder}
              onChange={(e) => set(i, { value: e.target.value })}
            />
            <Input
              className="w-28"
              list="cm-labels"
              value={r.label ?? ""}
              placeholder="label"
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <button
              type="button"
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <datalist id="cm-labels">
        {LABELS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </div>
  )
}

function StringRows({
  title,
  rows,
  onChange,
  placeholder,
}: {
  title: string
  rows: string[]
  onChange: (rows: string[]) => void
  placeholder: string
}) {
  return (
    <div className="col-span-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{title}</span>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
          onClick={() => onChange([...rows, ""])}
        >
          <Plus size={13} /> Add
        </button>
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              className="flex-1"
              value={r}
              placeholder={placeholder}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function DateRows({
  rows,
  onChange,
}: {
  rows: ImportantDate[]
  onChange: (rows: ImportantDate[]) => void
}) {
  const set = (i: number, patch: Partial<ImportantDate>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="col-span-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">Important dates</span>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
          onClick={() => onChange([...rows, { label: "", date: asDay("") }])}
        >
          <Plus size={13} /> Add
        </button>
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              className="flex-1"
              value={r.label ?? ""}
              placeholder="e.g. anniversary"
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <Input
              type="date"
              className="w-40"
              value={r.date}
              onChange={(e) => set(i, { date: asDay(e.target.value) })}
            />
            <button
              type="button"
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PersonForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Person | null
  onSubmit: (body: Body) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [nickname, setNickname] = useState(initial?.nickname ?? "")
  const [relationship, setRelationship] = useState(initial?.relationship ?? "")
  const [role, setRole] = useState(initial?.role ?? "")
  const [jobTitle, setJobTitle] = useState(initial?.job_title ?? "")
  const [specialty, setSpecialty] = useState(initial?.specialty ?? "")
  const [patientId, setPatientId] = useState(initial?.patient_id ?? "")
  const [portalUrl, setPortalUrl] = useState(initial?.portal_url ?? "")
  const [preferred, setPreferred] = useState(initial?.preferred_contact ?? "")
  const [birthday, setBirthday] = useState(initial?.birthday ?? "")
  const [phones, setPhones] = useState<ContactMethod[]>(initial?.phones ?? [])
  const [emails, setEmails] = useState<ContactMethod[]>(initial?.emails ?? [])
  const [addresses, setAddresses] = useState<ContactMethod[]>(initial?.addresses ?? [])
  const [websites, setWebsites] = useState<string[]>(initial?.websites ?? [])
  const [dates, setDates] = useState<ImportantDate[]>(initial?.important_dates ?? [])

  function submit() {
    onSubmit({
      name: name.trim(),
      nickname: nickname || null,
      relationship: relationship || null,
      role: role || null,
      job_title: jobTitle || null,
      specialty: specialty || null,
      patient_id: patientId || null,
      portal_url: portalUrl || null,
      preferred_contact: preferred || null,
      birthday: birthday || null,
      phones: phones.filter((p) => p.value.trim()),
      emails: emails.filter((e) => e.value.trim()),
      addresses: addresses.filter((a) => a.value.trim()),
      websites: websites.filter((w) => w.trim()),
      important_dates: dates.filter((d) => d.date),
    })
  }

  return (
    <form
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Nickname">
        <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </Field>
      <Field label="Job title">
        <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
      </Field>
      <Field label="Relationship">
        <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} />
      </Field>
      <Field label="Role">
        <Input value={role} onChange={(e) => setRole(e.target.value)} />
      </Field>
      <Field label="Preferred contact">
        <Select value={preferred} onChange={(e) => setPreferred(e.target.value)}>
          <option value="">—</option>
          <option value="phone">Phone</option>
          <option value="email">Email</option>
          <option value="text">Text</option>
        </Select>
      </Field>
      <Field label="Birthday">
        <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
      </Field>

      <Field label="Specialty">
        <Input
          value={specialty}
          placeholder="e.g. Cardiology (for providers)"
          onChange={(e) => setSpecialty(e.target.value)}
        />
      </Field>
      <Field label="Patient ID">
        <Input value={patientId} onChange={(e) => setPatientId(e.target.value)} />
      </Field>
      <Field label="Patient portal URL" className="col-span-2">
        <Input
          value={portalUrl}
          placeholder="https://mychart…"
          onChange={(e) => setPortalUrl(e.target.value)}
        />
      </Field>

      <MethodRows title="Phones" rows={phones} onChange={setPhones} placeholder="+1 555…" />
      <MethodRows
        title="Emails"
        rows={emails}
        onChange={setEmails}
        placeholder="name@example.com"
      />
      <MethodRows
        title="Addresses"
        rows={addresses}
        onChange={setAddresses}
        placeholder="street, city…"
      />
      <StringRows
        title="Websites"
        rows={websites}
        onChange={setWebsites}
        placeholder="https://…"
      />
      <DateRows rows={dates} onChange={setDates} />

      {/* No scalar "notes" field: 1e42b56 moved planning/CRM entities to
          first-class Note objects rooted at the person (see the Notes panel on
          PeoplePage), so a textarea here would write to a column that no
          longer exists. */}

      <div className="col-span-2 mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  )
}
