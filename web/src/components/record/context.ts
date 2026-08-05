import { createContext, useCallback, useContext, useEffect, useRef } from "react"

/**
 * The record surface's shared state: the row being edited, how to save one
 * field, and the coverage collector.
 *
 * Coverage is the reason this context exists rather than each field being handed
 * a value and a setter. The generic renderer this replaces was exhaustive *by
 * construction* — it walked every FieldSpec — so it could not silently drop a
 * field. A hand-composed layout can, and a field that renders nowhere is worse
 * than a duplicated one: it's data you can neither see nor edit.
 *
 * So every field primitive registers the key it binds, and `<Record>` compares
 * what actually rendered against the keys the entity carries. The claim is
 * *observed*, never declared — a declared list (the `detailHide` mistake) is a
 * second source of truth that drifts. Since each primitive already needs its
 * key to read the value and to PATCH, registration costs nothing extra.
 */
export interface RecordCtx {
  row: Record<string, unknown>
  save: (field: string, value: unknown) => void
  /** Write several fields in one PATCH — for controls that own a pair, like the
   *  `entity_type`/`entity_id` soft-poly link, where two writes could race. */
  saveMany: (body: Record<string, unknown>) => void
  register: (field: string) => void
}

export const RecordContext = createContext<RecordCtx | null>(null)

function useRecordCtx(): RecordCtx {
  const ctx = useContext(RecordContext)
  if (!ctx) throw new Error("record field used outside <Record>")
  return ctx
}

/** Bind one field: its current value, a save callback, and its coverage claim. */
export function useField(field: string) {
  const { row, save, register } = useRecordCtx()
  // Registration is an effect, not a render side-effect, so it stays pure and
  // survives StrictMode's double render. Child effects run before the parent's,
  // so <Record> sees a complete set when it checks.
  useEffect(() => register(field), [field, register])
  const onSave = useCallback((v: unknown) => save(field, v), [field, save])
  return { value: row[field], save: onSave }
}

/** Read the record being edited without claiming any of its fields — for
 *  controls that need the row as *context* rather than as data to render, like
 *  a ref field donating this record's root to the row it's about to create. */
export function useRecordRow(): Record<string, unknown> {
  return useRecordCtx().row
}

/** Bind several fields at once: the row, a multi-field save, and their claims. */
export function useFields(fields: readonly string[]) {
  const { row, saveMany, register } = useRecordCtx()
  const key = fields.join(",")
  useEffect(() => {
    for (const f of key.split(",")) register(f)
  }, [key, register])
  return { row, save: saveMany }
}

/** Keys every record carries but no layout is expected to render. */
export const SYSTEM_FIELDS = ["id", "created_at", "updated_at"]

/**
 * Test seam. A listener sees every record's coverage result, so the coverage
 * suite can mount an entity's *real* detail component and assert on it. The
 * alternative — re-listing the fields in the test — would be a second source of
 * truth that drifts from the layout exactly as `detailHide` did, and would keep
 * passing after a field was dropped.
 */
type CoverageListener = (entityKey: string, missing: string[]) => void
let coverageListener: CoverageListener | null = null
export function setCoverageListener(l: CoverageListener | null) {
  coverageListener = l
}

/**
 * Compare what rendered against what the row carries — the unrendered, unexcused
 * keys. Empty means the layout is complete.
 */
export function useCoverage(
  row: Record<string, unknown>,
  registry: React.RefObject<Set<string>>,
  omit: readonly string[],
  entityKey: string,
  onCoverage?: (missing: string[]) => void,
) {
  const reported = useRef(false)
  useEffect(() => {
    const excused = new Set([...SYSTEM_FIELDS, ...omit])
    const missing = Object.keys(row).filter((k) => !registry.current.has(k) && !excused.has(k))
    onCoverage?.(missing)
    coverageListener?.(entityKey, missing)
    if (missing.length && import.meta.env.DEV && !reported.current) {
      reported.current = true
      console.error(
        `[record] unrendered field(s): ${missing.join(", ")}. ` +
          `Render them, or list them in \`omit\` with a reason.`,
      )
    }
  })
}
