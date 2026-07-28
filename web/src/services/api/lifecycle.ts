// What "closed" means, client-side. The table itself is generated from
// `api/src/wild_life/lifecycle.py` (see `lifecycle.gen.ts`); this file holds the
// semantics layered on it, plus the compile-time proof that the two generated
// artifacts agree.
import { LIFECYCLE, type LifecyclePhase } from "@/services/api/lifecycle.gen"
import type {
  AllergyStatus,
  AreaStatus,
  CommitmentStatus,
  DelegationStatus,
  EntityType,
  OutcomeStatus,
  OrgStatus,
  PlanStatus,
  ProgramStatus,
  ProjectStatus,
  RequestStatus,
  RoutineStatus,
  TaskStatus,
} from "@/services/api/types"

/**
 * The exhaustiveness guard, and the reason this table is generated rather than
 * hand-written.
 *
 * `Record<XStatus, LifecyclePhase>` is *total*: the assignment below fails to
 * compile the moment the API grows a status with no phase. The repo's usual
 * `as const satisfies readonly XStatus[]` idiom could not do this job — it
 * catches renames and removals but **not additions**, and a terminal-status
 * list is by definition a subset, so a hand-written one would silently go stale
 * and start leaking a dead record back into every picker.
 *
 * (The reverse direction — a stale entry for a *removed* status — is caught on
 * the Python side, where `test_lifecycle.py` asserts set equality.)
 */
const _total: {
  task: Record<TaskStatus, LifecyclePhase>
  project: Record<ProjectStatus, LifecyclePhase>
  program: Record<ProgramStatus, LifecyclePhase>
  outcome: Record<OutcomeStatus, LifecyclePhase>
  request: Record<RequestStatus, LifecyclePhase>
  delegation: Record<DelegationStatus, LifecyclePhase>
  commitment: Record<CommitmentStatus, LifecyclePhase>
  area: Record<AreaStatus, LifecyclePhase>
  routine: Record<RoutineStatus, LifecyclePhase>
  allergy: Record<AllergyStatus, LifecyclePhase>
  insurance_plan: Record<PlanStatus, LifecyclePhase>
  organization: Record<OrgStatus, LifecyclePhase>
} = LIFECYCLE
void _total

const TERMINAL_PHASES: ReadonlySet<LifecyclePhase> = new Set(["done", "cancelled"])

/**
 * Is this row finished — completed, cancelled, archived, dropped, resolved?
 *
 * Status-only, deliberately. A type with no status column (person, event, note,
 * location, resource, metric, medication, protocol, decision, review, tag) always
 * reports `false`, as does an unknown status: absence of a terminal status is not
 * evidence of one. Lifecycle facts stored as timestamps instead of a status —
 * `Event.cancelled_at`, `Review.completed_at` — are invisible here; those surfaces
 * are reference-only today, so nothing depends on seeing them.
 */
export function isTerminal(type: EntityType, status: unknown): boolean {
  if (typeof status !== "string") return false
  const phases: Record<string, LifecyclePhase> | undefined = (
    LIFECYCLE as Record<string, Record<string, LifecyclePhase>>
  )[type]
  const phase = phases?.[status]
  return phase !== undefined && TERMINAL_PHASES.has(phase)
}

/** `isTerminal` for a whole row, for callers holding an entity rather than a status. */
export function rowIsTerminal(type: EntityType, row: unknown): boolean {
  if (!row || typeof row !== "object") return false
  return isTerminal(type, (row as { status?: unknown }).status)
}

/**
 * Reading order for a list nobody sorted: what's live, then what's stalled, then
 * what hasn't started, then what's over.
 *
 * Statuses are per-type and their enum order is definition order, not
 * importance — `proposed` comes before `active` in `PROJECT_STATUS`. The phase is
 * the shared axis, so one rank orders every status-bearing type the same way.
 */
const PHASE_ORDER: readonly LifecyclePhase[] = ["active", "blocked", "backlog", "done", "cancelled"]

/** A row's reading rank; rows with no (or an unknown) status sort with the live ones. */
export function lifecycleRank(type: EntityType, row: unknown): number {
  const status = (row as { status?: unknown } | null)?.status
  if (typeof status !== "string") return 0
  const phase = (LIFECYCLE as Record<string, Record<string, LifecyclePhase>>)[type]?.[status]
  const i = phase ? PHASE_ORDER.indexOf(phase) : -1
  return i === -1 ? 0 : i
}

/**
 * Order rows by lifecycle phase, keeping the server's order within each phase
 * (`Array.prototype.sort` is stable), so a list stays sorted the way its endpoint
 * sorted it and only gains the grouping.
 */
export function byLifecycle<T>(type: EntityType, rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => lifecycleRank(type, a) - lifecycleRank(type, b))
}
