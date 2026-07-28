import { formatAddress } from "@/lib/address"
import { useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { DetailDrawer } from "@/components/DetailDrawer"
import {
  Cake,
  Copy,
  GitMerge,
  Globe,
  ImageUp,
  KeyRound,
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
import { EntityRef } from "@/components/graph/EntityRef"
import { RelatedPanel } from "@/components/graph/RelatedPanel"
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives"
import { usePersistentState } from "@/lib/persistentState"
import { formatImportantDate } from "@/lib/date"
import { formatDate } from "@/lib/utils"
import { apiClient } from "@/services/api/client"
import type { Body } from "@/services/api/crud"
import {
  commitments,
  delegations,
  people,
  tasks,
  useDeletePersonPhoto,
  usePersonEvents,
  useUploadPersonPhoto,
  requests,
} from "@/services/api/hooks"
import { REGISTRY_BY_TYPE } from "@/services/api/registry"
import type { ContactMethod, EntityType, Person } from "@/services/api/types"
import { formatPhone, phoneDigits } from "@/lib/phone"

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
  display = (v) => v,
}: {
  icon: React.ReactNode
  rows: ContactMethod[]
  href: (v: string) => string
  /** Stored value → shown value. Phones store E.164 and show local form. */
  display?: (v: string) => string
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
            {display(r.value)}
          </a>
          {r.label && <span className="text-xs text-slate-400">{r.label}</span>}
          <CopyButton text={display(r.value)} />
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

// --- related items across the system ---------------------------------------
function RelatedSection({ personId }: { personId: string }) {
  const { data: dels } = delegations.useList()
  const { data: comms } = commitments.useList()
  const { data: reqs } = requests.useList()
  const { data: tks } = tasks.useList({ queue: "all" })

  const relDel = (dels ?? []).filter((d) =>
    [d.responsible_id, d.delegator_id, d.accountable_owner_id].includes(personId),
  )
  const relCom = (comms ?? []).filter((c) =>
    [c.owner_id, c.beneficiary_id, c.responsible_id].includes(personId),
  )
  const relReq = (reqs ?? []).filter(
    (r) => r.addressee_id === personId || r.requester_id === personId,
  )
  const relTask = (tks ?? []).filter((t) =>
    [t.accountable_owner_id, t.responsible_id, t.assignee_id].includes(personId),
  )

  const allGroups: {
    label: string
    type: EntityType
    rows: { id: string; title: string; status: string }[]
  }[] = [
    {
      label: "Delegations",
      type: "delegation",
      rows: relDel.map((d) => ({
        id: d.id,
        title: d.requested_outcome,
        status: d.status,
      })),
    },
    {
      label: "Commitments",
      type: "commitment",
      rows: relCom.map((c) => ({ id: c.id, title: c.description, status: c.status })),
    },
    {
      label: "Requests",
      type: "request",
      rows: relReq.map((r) => ({
        id: r.id,
        title: r.subject,
        status: r.status,
      })),
    },
    {
      label: "Tasks",
      type: "task",
      rows: relTask.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    },
  ]
  const groups = allGroups.filter((g) => g.rows.length > 0)

  if (groups.length === 0)
    return <p className="text-sm text-slate-400">Not referenced elsewhere yet.</p>

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 text-xs font-medium tracking-wide text-slate-400 uppercase">
            {g.label}
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {g.rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-sm"
              >
                <EntityRef type={g.type} id={r.id} className="break-words text-slate-700">
                  {r.title}
                </EntityRef>
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

interface AdminToken {
  id: string
  label: string
  person_id: string | null
  role: string
  revoked_at: string | null
}
interface AdminTokenCreated extends AdminToken {
  token: string
}

const MCP_WORKER_URL = `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:9005"}/mcp-worker`

/** Mint / reveal / revoke the worker credentials that let an assistant act as
 * this person (read-all + scoped writes) through /mcp-worker. */
function AssistantAccessSection({ person }: { person: Person }) {
  const qc = useQueryClient()
  const { data: tokens } = useQuery<AdminToken[]>({
    queryKey: ["admin-tokens"],
    queryFn: () => apiClient.get<AdminToken[]>("/admin/tokens"),
  })
  const [minted, setMinted] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mine = (tokens ?? []).filter((t) => t.person_id === person.id && !t.revoked_at)

  const mint = async () => {
    setBusy(true)
    try {
      const created = await apiClient.post<AdminTokenCreated>("/admin/tokens", {
        label: `${person.name} (assistant)`,
        person_id: person.id,
        role: "worker",
      })
      setMinted(created.token)
      void qc.invalidateQueries({ queryKey: ["admin-tokens"] })
    } finally {
      setBusy(false)
    }
  }
  const revoke = async (id: string) => {
    await apiClient.post(`/admin/tokens/${id}/revoke`)
    void qc.invalidateQueries({ queryKey: ["admin-tokens"] })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Worker credentials that act as this person — read-all plus writes scoped to
          their tasks and owned areas/projects.
        </p>
        <Button size="sm" onClick={mint} disabled={busy}>
          <KeyRound size={14} /> Mint token
        </Button>
      </div>

      {minted && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
          <div className="mb-1 font-medium text-amber-800">
            Copy this token now — it won't be shown again.
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-700">
              {minted}
            </code>
            <CopyButton text={minted} />
          </div>
          <div className="mt-2 text-amber-700">
            Connect at <code className="font-mono">{MCP_WORKER_URL}</code>
          </div>
        </div>
      )}

      {mine.length > 0 ? (
        <ul className="space-y-1">
          {mine.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded border border-slate-100 px-2 py-1 text-xs"
            >
              <span className="truncate text-slate-600">{t.label}</span>
              <button
                className="ml-2 shrink-0 font-medium text-slate-400 hover:text-rose-600"
                title="Revoke"
                onClick={() => revoke(t.id)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">No active credentials.</p>
      )}
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                  display={formatPhone}
                />
                <MethodList
                  icon={<Mail size={14} />}
                  rows={person.emails}
                  href={(v) => `mailto:${v}`}
                />
                {/* Addresses no longer share the one-value ContactMethod shape,
                    so they flatten for display rather than being one already. */}
                <MethodList
                  icon={<MapPin size={14} />}
                  rows={person.addresses.map((a) => ({
                    value: formatAddress(a),
                    label: a.label ?? null,
                  }))}
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
                    {formatImportantDate(d.date)}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-4">
          <RelatedPanel
            parent={person}
            parentType="person"
            spec={{ mode: "soft-backref", label: "Log", type: "note" }}
            targetDef={REGISTRY_BY_TYPE.note!}
          />
        </div>
      </div>

      <Section title="Organizations">
        <AffiliationsEditor personId={person.id} />
      </Section>

      <PersonEventsSection personId={person.id} />


      <Section title="Related">
        <RelatedSection personId={person.id} />
      </Section>

      <Section title="Assistant access">
        <AssistantAccessSection person={person} />
      </Section>

      <Backlinks type="person" id={person.id} />
    </Card>
  )
}

// --- a person's events (attendee links) ------------------------------------
function PersonEventsSection({ personId }: { personId: string }) {
  const navigate = useNavigate()
  const events = usePersonEvents(personId).data ?? []
  if (events.length === 0) return null
  return (
    <Section title={`Meetings & events · ${events.length}`}>
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {events.slice(0, 50).map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => navigate(`/calendar/${e.id}`)}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-100 bg-surface px-3 py-2 text-left transition hover:border-slate-300"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{e.title}</span>
              {e.start_at && (
                <span className="shrink-0 text-xs text-slate-400">{formatDate(e.start_at)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Section>
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
  const getOne = people.useGet(id)

  const [search, setSearch] = usePersistentState("people:q", "")
  const [relFilter, setRelFilter] = usePersistentState("people:rel", "")
  const [sort, setSort] = usePersistentState<"name" | "updated">("people:sort", "name")
  const [editing, setEditing] = useState<Person | null>(null)
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => data ?? [], [data])


  const relationships = useMemo(
    () =>
      [...new Set(rows.map((r) => r.relationship).filter(Boolean))].sort() as string[],
    [rows],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = rows.filter((p) => {
      if (relFilter && p.relationship !== relFilter) return false
      if (!q) return true
      // Phones are matched on digits alone, so "2063996403", "206-399-6403" and
      // "(206) 399" all find the same person — you type the number, not the
      // punctuation it happens to be stored or displayed with.
      const qDigits = phoneDigits(q)
      if (qDigits.length >= 3 && p.phones.some((e) => phoneDigits(e.value).includes(qDigits))) {
        return true
      }
      const hay = [p.name, p.nickname, ...p.emails.map((e) => e.value)]
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
  }, [rows, search, relFilter, sort])

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
                        <span className="block break-words text-sm font-medium text-slate-800">
                          {p.name}
                        </span>
                        <span className="block truncate text-xs text-slate-400">
                          {p.job_title ||
                            p.emails[0]?.value ||
                            formatPhone(p.phones[0]?.value) ||
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
