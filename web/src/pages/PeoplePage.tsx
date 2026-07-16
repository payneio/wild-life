import { useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { DetailDrawer } from "@/components/DetailDrawer"
import {
  Cake,
  Copy,
  GitMerge,
  Globe,
  ImageUp,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { AffiliationsEditor } from "@/components/AffiliationsEditor"
import { Backlinks } from "@/components/Backlinks"
import { MergeDialog } from "@/components/MergeDialog"
import { Avatar } from "@/components/AuthedImage"
import { PersonForm } from "@/components/PersonForm"
import { StatusBadge } from "@/components/cells"
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui/primitives"
import { usePersistentState } from "@/lib/persistentState"
import { formatDate, formatDateTime } from "@/lib/utils"
import { apiClient } from "@/services/api/client"
import type { Body } from "@/services/api/crud"
import {
  commitments,
  delegations,
  interactions,
  people,
  tags,
  tasks,
  useAttachTag,
  useDeletePersonPhoto,
  useDetachTag,
  useEntityTags,
  usePersonInteractions,
  useUploadPersonPhoto,
  waitingItems,
} from "@/services/api/hooks"
import type { ContactMethod, Person } from "@/services/api/types"

// --- birthday helpers -------------------------------------------------------
interface BdayInfo {
  days: number
  age: number | null
}
function birthdayInfo(bday: string | null): BdayInfo | null {
  const m = bday && /^(\d{4})-(\d{2})-(\d{2})$/.exec(bday)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const now = new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(now.getFullYear(), month - 1, day)
  if (next < todayMid) next = new Date(now.getFullYear() + 1, month - 1, day)
  const days = Math.round((next.getTime() - todayMid.getTime()) / 86_400_000)
  const age = year > 1900 ? next.getFullYear() - year : null
  return { days, age }
}
function inDays(n: number): string {
  if (n === 0) return "today"
  if (n === 1) return "tomorrow"
  return `in ${n} days`
}

// --- small building blocks --------------------------------------------------
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
      title="Copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1000)
      }}
    >
      {done ? <span className="text-[10px] text-emerald-600">✓</span> : <Copy size={13} />}
    </button>
  )
}

function MethodList({
  icon,
  rows,
  href,
}: {
  icon: React.ReactNode
  rows: ContactMethod[]
  href: (v: string) => string
}) {
  if (rows.length === 0) return null
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">{icon}</span>
          <a
            className="text-indigo-600 hover:underline"
            href={href(r.value)}
            target="_blank"
            rel="noreferrer"
          >
            {r.value}
          </a>
          {r.label && <span className="text-xs text-slate-400">{r.label}</span>}
          <CopyButton text={r.value} />
        </li>
      ))}
    </ul>
  )
}

function PhotoControl({ person }: { person: Person }) {
  const upload = useUploadPersonPhoto()
  const remove = useDeletePersonPhoto()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="relative">
      <Avatar name={person.name} photoUrl={person.photo_url} size="lg" />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload.mutate({ id: person.id, file })
          e.target.value = ""
        }}
      />
      <button
        className="absolute -right-1 -bottom-1 rounded-full border border-slate-200 bg-surface p-1 text-slate-500 shadow-sm hover:text-indigo-600"
        title="Upload photo"
        onClick={() => inputRef.current?.click()}
      >
        <ImageUp size={14} />
      </button>
      {person.photo_url && (
        <button
          className="absolute -top-1 -right-1 rounded-full border border-slate-200 bg-surface p-0.5 text-slate-400 shadow-sm hover:text-red-600"
          title="Remove photo"
          onClick={() => remove.mutate(person.id)}
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

// --- tags on a person -------------------------------------------------------
function TagEditor({ personId }: { personId: string }) {
  const { data: current } = useEntityTags("person", personId)
  const { data: all } = tags.useList()
  const attach = useAttachTag()
  const detach = useDetachTag()
  const createTag = tags.useCreate()
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState("")
  const currentIds = new Set((current ?? []).map((t) => t.id))
  const available = (all ?? []).filter((t) => !currentIds.has(t.id))

  async function add() {
    const name = value.trim()
    if (!name) return
    const existing = (all ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase())
    const tag = existing ?? ((await createTag.mutateAsync({ name })) as { id: string })
    attach.mutate({ tagId: tag.id, entityType: "person", entityId: personId })
    setValue("")
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(current ?? []).map((t) => (
        <Badge key={t.id} color={t.color}>
          {t.name}
          <button
            className="ml-1 text-slate-400 hover:text-red-600"
            onClick={() =>
              detach.mutate({ tagId: t.id, entityType: "person", entityId: personId })
            }
          >
            <X size={11} />
          </button>
        </Badge>
      ))}
      {adding ? (
        <span className="flex items-center gap-1">
          <Input
            list="all-tags"
            autoFocus
            className="h-7 w-32 py-0.5"
            value={value}
            placeholder="tag…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
          />
          <datalist id="all-tags">
            {available.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
          <button className="text-indigo-600" onClick={() => void add()}>
            <Plus size={14} />
          </button>
        </span>
      ) : (
        <button
          className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:text-indigo-600"
          onClick={() => setAdding(true)}
        >
          <Plus size={11} /> tag
        </button>
      )}
    </div>
  )
}

// --- interactions -----------------------------------------------------------
function InteractionSection({ personId }: { personId: string }) {
  const { data } = usePersonInteractions(personId)
  const create = interactions.useCreate()
  const [kind, setKind] = useState("call")
  const [summary, setSummary] = useState("")
  const list = data ?? []

  function log() {
    create.mutate({
      person_id: personId,
      kind,
      summary: summary || null,
      occurred_at: new Date().toISOString(),
    })
    setSummary("")
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <Field label="Log interaction" className="w-32">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {["call", "email", "meeting", "note"].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
        <Input
          className="flex-1"
          placeholder="summary…"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && log()}
        />
        <Button variant="secondary" onClick={log}>
          Log
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-slate-400">No interactions logged.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((i) => (
            <li key={i.id} className="rounded-lg border border-slate-100 p-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium capitalize">{i.kind}</span>
                <span className="text-xs text-slate-400">
                  {formatDateTime(i.occurred_at)}
                </span>
              </div>
              {i.summary && <p className="text-slate-600">{i.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// --- related items across the system ---------------------------------------
function RelatedSection({ personId }: { personId: string }) {
  const { data: dels } = delegations.useList()
  const { data: comms } = commitments.useList()
  const { data: waits } = waitingItems.useList()
  const { data: tks } = tasks.useList({ queue: "all" })

  const relDel = (dels ?? []).filter((d) =>
    [d.responsible_id, d.delegator_id, d.accountable_owner_id].includes(personId),
  )
  const relCom = (comms ?? []).filter((c) =>
    [c.owner_id, c.beneficiary_id, c.responsible_id].includes(personId),
  )
  const relWait = (waits ?? []).filter((w) => w.person_id === personId)
  const relTask = (tks ?? []).filter((t) =>
    [t.accountable_owner_id, t.responsible_id, t.assignee_id].includes(personId),
  )

  const groups: { label: string; rows: { id: string; title: string; status: string }[] }[] =
    [
      {
        label: "Delegations",
        rows: relDel.map((d) => ({
          id: d.id,
          title: d.requested_outcome,
          status: d.status,
        })),
      },
      {
        label: "Commitments",
        rows: relCom.map((c) => ({ id: c.id, title: c.description, status: c.status })),
      },
      {
        label: "Waiting on",
        rows: relWait.map((w) => ({
          id: w.id,
          title: w.expected_result,
          status: w.status,
        })),
      },
      {
        label: "Tasks",
        rows: relTask.map((t) => ({ id: t.id, title: t.title, status: t.status })),
      },
    ].filter((g) => g.rows.length > 0)

  if (groups.length === 0)
    return <p className="text-sm text-slate-400">Not referenced elsewhere yet.</p>

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 text-xs font-medium tracking-wide text-slate-400 uppercase">
            {g.label}
          </p>
          <ul className="space-y-1">
            {g.rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-1.5 text-sm"
              >
                <span className="truncate text-slate-700">{r.title}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  )
}

// --- detail pane ------------------------------------------------------------
function PersonDetail({
  person,
  onEdit,
  onDelete,
}: {
  person: Person
  onEdit: () => void
  onDelete: () => void
}) {
  const update = people.useUpdate()
  const [notes, setNotes] = useState(person.notes ?? "")
  const [notesDirty, setNotesDirty] = useState(false)
  const [merging, setMerging] = useState(false)
  const bday = birthdayInfo(person.birthday)

  return (
    <Card className="space-y-6 p-5">
      <div className="flex items-start gap-4">
        <PhotoControl person={person} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-900">
            {person.name}
            {person.nickname && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                “{person.nickname}”
              </span>
            )}
          </h2>
          {person.job_title && (
            <p className="text-sm text-slate-600">{person.job_title}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
            {person.relationship && <span>{person.relationship}</span>}
            {person.preferred_contact && <span>prefers {person.preferred_contact}</span>}
          </div>
          <div className="mt-2">
            <TagEditor personId={person.id} />
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="secondary" onClick={onEdit}>
            <Pencil size={14} /> Edit
          </Button>
          <Button variant="ghost" onClick={() => setMerging(true)} title="Merge duplicate">
            <GitMerge size={14} />
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {merging && (
        <MergeDialog
          type="person"
          survivor={{ id: person.id, label: person.name }}
          onClose={() => setMerging(false)}
        />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          {(person.phones.length > 0 ||
            person.emails.length > 0 ||
            person.addresses.length > 0 ||
            person.websites.length > 0) && (
            <Section title="Contact">
              <div className="space-y-2">
                <MethodList
                  icon={<Phone size={14} />}
                  rows={person.phones}
                  href={(v) => `tel:${v.replace(/[^+\d]/g, "")}`}
                />
                <MethodList
                  icon={<Mail size={14} />}
                  rows={person.emails}
                  href={(v) => `mailto:${v}`}
                />
                <MethodList
                  icon={<MapPin size={14} />}
                  rows={person.addresses}
                  href={(v) => `https://maps.google.com/?q=${encodeURIComponent(v)}`}
                />
                <MethodList
                  icon={<Globe size={14} />}
                  rows={person.websites.map((w) => ({ value: w, label: null }))}
                  href={(v) => (v.startsWith("http") ? v : `https://${v}`)}
                />
              </div>
            </Section>
          )}

          {(bday || person.important_dates.length > 0) && (
            <Section title="Dates">
              <ul className="space-y-1 text-sm">
                {person.birthday && (
                  <li className="flex items-center gap-2">
                    <Cake size={14} className="text-slate-400" />
                    {formatDate(person.birthday)}
                    {bday?.age != null && (
                      <span className="text-slate-400">(turns {bday.age})</span>
                    )}
                    {bday && bday.days <= 30 && (
                      <Badge className="bg-pink-100 text-pink-700">
                        {inDays(bday.days)}
                      </Badge>
                    )}
                  </li>
                )}
                {person.important_dates.map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-600">
                    <span className="text-slate-400">{d.label ?? "date"}:</span>
                    {formatDate(d.date)}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-4">
          <Section title="Notes">
            <Textarea
              value={notes}
              placeholder="Add a note…"
              onChange={(e) => {
                setNotes(e.target.value)
                setNotesDirty(true)
              }}
            />
            {notesDirty && (
              <div className="mt-1 flex justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    update.mutate({ id: person.id, body: { notes: notes || null } })
                    setNotesDirty(false)
                  }}
                >
                  Save note
                </Button>
              </div>
            )}
          </Section>
        </div>
      </div>

      <Section title="Organizations">
        <AffiliationsEditor personId={person.id} />
      </Section>

      <Section title="Interactions">
        <InteractionSection personId={person.id} />
      </Section>

      <Section title="Related">
        <RelatedSection personId={person.id} />
      </Section>

      <Backlinks type="person" id={person.id} />
    </Card>
  )
}

// --- upcoming birthdays strip ----------------------------------------------
function BirthdayStrip({
  list,
  onPick,
}: {
  list: Person[]
  onPick: (p: Person) => void
}) {
  const upcoming = list
    .map((p) => ({ p, b: birthdayInfo(p.birthday) }))
    .filter((x): x is { p: Person; b: BdayInfo } => !!x.b && x.b.days <= 30)
    .sort((a, b) => a.b.days - b.b.days)
  if (upcoming.length === 0) return null
  return (
    <Card className="flex flex-wrap items-center gap-2 p-2.5">
      <Cake size={15} className="text-pink-500" />
      <span className="text-xs font-medium text-slate-500">Upcoming birthdays:</span>
      {upcoming.map(({ p, b }) => (
        <button
          key={p.id}
          className="rounded-full bg-pink-50 px-2 py-0.5 text-xs text-pink-700 hover:bg-pink-100"
          onClick={() => onPick(p)}
        >
          {p.name} · {inDays(b.days)}
        </button>
      ))}
    </Card>
  )
}

// --- page -------------------------------------------------------------------
export function PeoplePage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { data, isLoading } = people.useList()
  const create = people.useCreate()
  const update = people.useUpdate()
  const remove = people.useRemove()
  const { data: allTags } = tags.useList()
  const getOne = people.useGet(id)

  const [search, setSearch] = usePersistentState("people:q", "")
  const [relFilter, setRelFilter] = usePersistentState("people:rel", "")
  const [tagFilter, setTagFilter] = usePersistentState("people:tag", "")
  const [sort, setSort] = usePersistentState<"name" | "updated">("people:sort", "name")
  const [editing, setEditing] = useState<Person | null>(null)
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => data ?? [], [data])

  const { data: tagEntities } = useQuery({
    queryKey: ["tag-entities", tagFilter],
    queryFn: () =>
      apiClient.get<{ entity_type: string; entity_id: string }[]>(
        `/tags/${tagFilter}/entities`,
      ),
    enabled: !!tagFilter,
  })
  const tagPersonIds = useMemo(
    () =>
      new Set(
        (tagEntities ?? [])
          .filter((e) => e.entity_type === "person")
          .map((e) => e.entity_id),
      ),
    [tagEntities],
  )

  const relationships = useMemo(
    () =>
      [...new Set(rows.map((r) => r.relationship).filter(Boolean))].sort() as string[],
    [rows],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = rows.filter((p) => {
      if (relFilter && p.relationship !== relFilter) return false
      if (tagFilter && !tagPersonIds.has(p.id)) return false
      if (!q) return true
      const hay = [
        p.name,
        p.nickname,
        ...p.emails.map((e) => e.value),
        ...p.phones.map((e) => e.value),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
    return [...out].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updated_at.localeCompare(a.updated_at),
    )
  }, [rows, search, relFilter, tagFilter, tagPersonIds, sort])

  const selected = rows.find((p) => p.id === id) ?? getOne.data ?? null

  function submit(body: Body) {
    if (editing) update.mutate({ id: editing.id, body })
    else create.mutate(body, { onSuccess: (p) => navigate(`/people/${(p as Person).id}`) })
    setEditing(null)
    setCreating(false)
  }

  const detail = selected ? (
    <PersonDetail
      key={selected.id}
      person={selected}
      onEdit={() => setEditing(selected)}
      onDelete={() => {
        if (confirm(`Delete ${selected.name}?`)) {
          remove.mutate(selected.id)
          navigate("/people")
        }
      }}
    />
  ) : null

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">People</h1>
          <p className="text-sm text-slate-500">
            {rows.length} contacts across your life and work
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> New contact
        </Button>
      </div>

      <BirthdayStrip list={rows} onPick={(p) => navigate(`/people/${p.id}`)} />

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="lg:w-80 lg:shrink-0">
          <div className="space-y-2">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400"
              />
              <Input
                className="pl-8"
                placeholder="Search name, email, phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select
                className="text-xs"
                value={relFilter}
                onChange={(e) => setRelFilter(e.target.value)}
              >
                <option value="">All relationships</option>
                {relationships.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <Select
                className="text-xs"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">All tags</option>
                {(allTags ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <Select
                className="w-28 text-xs"
                value={sort}
                onChange={(e) => setSort(e.target.value as "name" | "updated")}
              >
                <option value="name">A–Z</option>
                <option value="updated">Recent</option>
              </Select>
            </div>
          </div>

          <Card className="mt-2 max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-sm text-slate-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-slate-400">No matches.</div>
            ) : (
              <ul>
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      className={`flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50 ${
                        p.id === id ? "bg-indigo-50" : ""
                      }`}
                      onClick={() => navigate(`/people/${p.id}`)}
                    >
                      <Avatar name={p.name} photoUrl={p.photo_url} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {p.name}
                        </span>
                        <span className="block truncate text-xs text-slate-400">
                          {p.job_title ||
                            p.emails[0]?.value ||
                            p.phones[0]?.value ||
                            ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Desktop: inline detail pane */}
        <div className="hidden min-w-0 flex-1 lg:block">
          {detail ?? <EmptyState>Select a contact to see their details.</EmptyState>}
        </div>
      </div>

      {/* Mobile: full-screen detail drawer */}
      {detail && (
        <div className="lg:hidden">
          <DetailDrawer title={selected?.name ?? "Contact"} onClose={() => navigate("/people")}>
            {detail}
          </DetailDrawer>
        </div>
      )}

      {(creating || editing) && (
        <Modal
          title={editing ? `Edit ${editing.name}` : "New contact"}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
        >
          <PersonForm
            initial={editing}
            onSubmit={submit}
            onCancel={() => {
              setEditing(null)
              setCreating(false)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
