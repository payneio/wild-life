import { useCallback, useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
  type DragStartEvent,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowUpToLine, GripVertical } from "lucide-react"
import { EmptyState } from "@/components/ui/primitives"
import { TaskRow } from "@/pages/TasksPage"
import { cn } from "@/lib/utils"
import { useMoveTask } from "@/services/api/hooks"
import type { Task, TaskStatus } from "@/services/api/types"

/**
 * The project's tasks, in the order you put them in.
 *
 * Rank is the only judgment this surface asks for, and it is deliberately
 * ordinal. Inside one project nothing is urgent — urgency arrives from outside,
 * as a due date — so the order you drag things into *is* your importance
 * ranking, without having to name an axis or keep two attributes current on
 * every row. Priority and due date still show, as badges on the row; neither
 * re-sorts what you arranged.
 *
 * Sections are status, and they are named honestly rather than computed as
 * "everything that isn't in progress" — which silently filed `waiting` and
 * `delegated` work under a heading claiming it was yours to do. Only the two
 * you act on are drop targets: you don't delegate something by dragging it, and
 * completing is a click on the checkbox, which beats a drag to a bin.
 */

/** Sections, in board order. `drop` marks the two a drag may land in. */
const SECTIONS: {
  key: string
  title: string
  statuses: TaskStatus[]
  drop?: boolean
  capped?: boolean
}[] = [
  { key: "in_progress", title: "In progress", statuses: ["in_progress"], drop: true },
  { key: "todo", title: "To do", statuses: ["inbox", "planned"], drop: true },
  { key: "waiting", title: "Waiting", statuses: ["waiting"] },
  { key: "delegated", title: "Delegated", statuses: ["delegated", "delivered"] },
  { key: "done", title: "Done", statuses: ["completed"], capped: true },
]

/**
 * Where the pointer is, not which rect is nearest.
 *
 * `closestCenter` compares the dragged rect against every droppable's centre,
 * so a tall "To do" list beats the short "In progress" strip sitting right under
 * the cursor — a drag aimed at the empty section landed back where it started.
 * Sections have wildly different heights here, which is exactly the case centre
 * distance gets wrong. The fallback matters for the keyboard sensor, which has
 * no pointer to be within anything.
 */
const collisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args)
  return byPointer.length > 0 ? byPointer : closestCenter(args)
}

/** Matches `ranking.GAP` — the client guesses the same number the server will. */
const GAP = 1024

type Pending = Record<string, { position: number; status: TaskStatus }>

function SortableTaskRow({
  task,
  onTop,
  canMove,
}: {
  task: Task
  onTop: () => void
  canMove: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: !canMove })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/row flex items-center border-b border-slate-50 bg-surface last:border-0",
        isDragging && "opacity-40",
      )}
    >
      {canMove && (
        <div className="flex shrink-0 items-center pl-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${task.title}`}
            className="cursor-grab rounded p-1 text-slate-300 opacity-0 transition group-hover/row:opacity-100 focus:opacity-100 focus:outline-none active:cursor-grabbing"
          >
            <GripVertical size={14} />
          </button>
          {/* "Make this the next thing" is the dominant intent and deserves to
              cost one click rather than a drag across a dozen rows. */}
          <button
            type="button"
            onClick={onTop}
            title="Move to top"
            className="rounded p-1 text-slate-300 opacity-0 transition group-hover/row:opacity-100 hover:text-indigo-600 focus:opacity-100"
          >
            <ArrowUpToLine size={14} />
          </button>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <TaskRow task={task} hideProject />
      </div>
    </div>
  )
}

function SectionShell({
  id,
  title,
  count,
  droppable,
  capped,
  children,
}: {
  id: string
  title: string
  count: number
  droppable: boolean
  capped?: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable })
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-slate-500">
        {title} · {count}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "rounded-lg border transition-colors",
          isOver ? "border-indigo-300 bg-indigo-50/40" : "border-slate-100",
          capped ? "max-h-64 overflow-y-auto" : "overflow-hidden",
          // An empty drop target needs somewhere to aim. "In progress" is empty
          // most of the time, which is exactly when you want to drag into it.
          droppable && count === 0 && "border-dashed py-4",
        )}
      >
        {count === 0 ? (
          <p className="px-3 text-center text-xs text-slate-400">
            {droppable ? "Drop a task here" : "None"}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

export function TaskBoard({ tasks: rows }: { tasks: Task[] }) {
  const move = useMoveTask()
  const [pending, setPending] = useState<Pending>({})
  const [dragging, setDragging] = useState<Task | null>(null)

  // A guess applies only while the server still disagrees with it — derived at
  // render rather than cleared in an effect, so there's no window where the row
  // is drawn from a guess the data has already superseded. Anything the server
  // computed differently (a respace) replaces the guess when the move returns.
  const unsettled = useMemo(() => {
    const out: Pending = {}
    for (const t of rows) {
      const guess = pending[t.id]
      if (guess && (t.position !== guess.position || t.status !== guess.status)) {
        out[t.id] = guess
      }
    }
    return out
  }, [rows, pending])

  const tasks: Task[] = useMemo(
    () => rows.map((t) => (unsettled[t.id] ? { ...t, ...unsettled[t.id] } : t)),
    [rows, unsettled],
  )

  const bySection = useMemo(() => {
    const out: Record<string, Task[]> = {}
    for (const s of SECTIONS) {
      out[s.key] = tasks
        .filter((t) => s.statuses.includes(t.status))
        .sort((a, b) => a.position - b.position)
    }
    return out
  }, [tasks])

  const sectionOf = useCallback(
    (id: string) =>
      SECTIONS.find((s) => bySection[s.key].some((t) => t.id === id))?.key,
    [bySection],
  )

  const sensors = useSensors(
    // A few pixels of travel before a drag begins, so the handle can still be
    // focused and the row still clicked.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /** Send a task to a slot, guessing the position the server will compute. */
  const commit = useCallback(
    (task: Task, sectionKey: string, index: number) => {
      const section = SECTIONS.find((s) => s.key === sectionKey)
      if (!section) return
      const siblings = bySection[sectionKey].filter((t) => t.id !== task.id)
      const after = siblings[index - 1]
      const before = siblings[index]
      const status = section.statuses.includes(task.status)
        ? task.status
        : section.statuses[0]

      const all = tasks.filter((t) => t.id !== task.id).map((t) => t.position)
      const guess =
        after && before
          ? (after.position + before.position) / 2
          : after
            ? after.position + GAP
            : before
              ? before.position - GAP
              : Math.max(0, ...all) + GAP

      // Rebuilt from `unsettled`, so guesses the server has already confirmed
      // drop out instead of accumulating for the life of the page.
      setPending({ ...unsettled, [task.id]: { position: guess, status } })
      move.mutate(
        {
          id: task.id,
          after_id: after?.id ?? null,
          before_id: before?.id ?? null,
          status: status === task.status ? null : status,
        },
        {
          onSuccess: (updated) =>
            setPending((p) => ({
              ...p,
              [task.id]: { position: updated.position, status: updated.status },
            })),
          onError: () =>
            setPending((p) => {
              const next = { ...p }
              delete next[task.id]
              return next
            }),
        },
      )
    },
    [bySection, tasks, move, unsettled],
  )

  const onDragStart = (e: DragStartEvent) =>
    setDragging(tasks.find((t) => t.id === e.active.id) ?? null)

  // Deliberately no `onDragOver`: reparenting the row mid-drag moved the list
  // out from under the cursor, which put the pointer back over the section it
  // came from, which moved it back — a loop that fired dozens of times per drag
  // and always dropped the task where it started. The section highlights under
  // the pointer instead, and the move resolves once, on drop.

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over: target } = e
    setDragging(null)
    const task = tasks.find((t) => t.id === active.id)
    if (!task || !target) return

    const to = SECTIONS.some((s) => s.key === target.id)
      ? String(target.id)
      : sectionOf(String(target.id))
    if (!to || !SECTIONS.find((s) => s.key === to)?.drop) return

    const siblings = bySection[to].filter((t) => t.id !== task.id)
    const index =
      target.id === to
        ? siblings.length
        : Math.max(0, siblings.findIndex((t) => t.id === target.id))
    commit(task, to, index)
  }

  if (rows.length === 0) return <EmptyState>No tasks yet.</EmptyState>

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="space-y-3">
        {SECTIONS.map((s) => {
          const list = bySection[s.key]
          // A status nobody on this project is in doesn't need a heading — but
          // the two drop targets always show, or there'd be nowhere to drop.
          if (list.length === 0 && !s.drop) return null
          return (
            <SectionShell
              key={s.key}
              id={s.key}
              title={s.title}
              count={list.length}
              droppable={!!s.drop}
              capped={s.capped}
            >
              <SortableContext
                items={list.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {list.map((t) => (
                  <SortableTaskRow
                    key={t.id}
                    task={t}
                    canMove={!!s.drop}
                    onTop={() => commit(t, s.key, 0)}
                  />
                ))}
              </SortableContext>
            </SectionShell>
          )
        })}
      </div>
      <DragOverlay>
        {dragging && (
          <div className="rounded-lg border border-indigo-200 bg-surface shadow-lg">
            <TaskRow task={dragging} hideProject />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
