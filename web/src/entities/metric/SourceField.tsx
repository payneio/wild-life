import { RecordSection } from "@/components/record/Record"
import { useFields } from "@/components/record/context"
import { Select } from "@/components/ui/primitives"
import { useDerivations } from "@/services/api/hooks"
import type { Entity, Metric } from "@/services/api/types"

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
  const { save } = useFields(["source", "derivation"])
  const { data: derivations } = useDerivations()
  const chosen = derivations?.find((d) => d.key === metric.derivation)

  return (
    <RecordSection title="Readings">
      <div className="space-y-2">
        <Select
          className="w-auto"
          value={metric.derivation ?? ""}
          onChange={(e) => {
            const key = e.target.value
            save(
              key
                ? { source: "derived", derivation: key }
                : { source: "manual", derivation: null },
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
            ? `${chosen.description} Measured over whatever this metric is rooted to.`
            : "You take the reading and type it in — right for labs, weight, money: things the world tells you."}
        </p>
      </div>
    </RecordSection>
  )
}
