import { RecordSection } from "@/components/record/Record"
import { useFields } from "@/components/record/context"
import { EntityRefField } from "@/components/graph/EntityRefField"
import { Select } from "@/components/ui/primitives"
import { useDerivations } from "@/services/api/hooks"
import type { Entity, Metric } from "@/services/api/types"

/** The computations that read two other metrics rather than a table of rows.
 *  Mirrors `TWO_OPERAND_DERIVATIONS` on the API, which rejects a mismatch. */
const TWO_OPERAND = ["ratio", "percent"]

/**
 * Where a metric's readings come from.
 *
 * One control for `source` and `derivation` together, written in a single PATCH,
 * because they're only valid as a pair: derived-with-no-computation reads
 * nothing and has no entry to correct it, manual-with-a-computation is a
 * contradiction. The API rejects both, so the UI shouldn't be able to ask for
 * them.
 */
export function MetricSourceField({ entity }: { entity: Entity }) {
  const metric = entity as Metric
  const { save } = useFields([
    "source",
    "derivation",
    "numerator_metric_id",
    "denominator_metric_id",
  ])
  const { data: derivations } = useDerivations()
  const chosen = derivations?.find((d) => d.key === metric.derivation)
  // An operand named here is measured for the same thing the ratio is, so a
  // metric created from this picker is filed where this one is.
  const operandRoot = { entity_type: metric.entity_type, entity_id: metric.entity_id }

  return (
    <RecordSection title="Readings">
      <div className="space-y-2">
        <Select
          className="w-auto"
          value={metric.derivation ?? ""}
          onChange={(e) => {
            const key = e.target.value
            // Operands are cleared alongside the derivation that used them —
            // the API rejects an operand on a computation that ignores it.
            const operands = TWO_OPERAND.includes(key)
              ? {}
              : { numerator_metric_id: null, denominator_metric_id: null }
            save(
              key
                ? { source: "derived", derivation: key, ...operands }
                : { source: "manual", derivation: null, ...operands },
            )
          }}
        >
          <option value="">Entered by hand</option>
          {(derivations ?? []).map((d) => (
            <option key={d.key} value={d.key}>
              Computed · {d.label}
            </option>
          ))}
        </Select>
        <p className="text-sm text-slate-500">
          {chosen
            ? chosen.description
            : "You take the reading and type it in — right for labs, weight, money: things the world tells you."}
        </p>
        {/* A ratio needs to know *which two*. The pair is read within one group
            reading, which is what makes the answer well-defined rather than a
            guess about which reading goes with which. */}
        {metric.derivation && TWO_OPERAND.includes(metric.derivation) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Numerator
              </span>
              <EntityRefField
                lookup="metric"
                intent="assign"
                value={metric.numerator_metric_id}
                onChange={(id) => save({ numerator_metric_id: id })}
                createDefaults={operandRoot}
              />
            </label>
            <label className="text-sm">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Denominator
              </span>
              <EntityRefField
                lookup="metric"
                intent="assign"
                value={metric.denominator_metric_id}
                onChange={(id) => save({ denominator_metric_id: id })}
                createDefaults={operandRoot}
              />
            </label>
          </div>
        )}
      </div>
    </RecordSection>
  )
}
