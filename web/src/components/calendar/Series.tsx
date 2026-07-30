import { Link } from "react-router-dom"
import { Repeat } from "lucide-react"
import { routines } from "@/services/api/hooks"
import { summarizeCadence } from "@/lib/moments"

/**
 * That this occurrence belongs to a series, and where the series lives.
 *
 * Without it a repeating occurrence looked exactly like a one-off — until you
 * deleted one and a this/following/all dialog appeared from nowhere. An
 * interaction that exists but is unannounced is worse than one that does not:
 * the reader has no way to know the choice is coming, or that dragging this
 * meeting might move fifty-one others.
 *
 * Shared rather than local to the moment's detail, because the surface that
 * needs it most is the *projected* slot. A slot exists only because a rule
 * says so, and opening one used to be the only way to reach that rule — so
 * routing the click to the occurrence instead, without this, took the series
 * away entirely. Both surfaces say the same sentence in the same words.
 */
export function Series({ ruleId }: { ruleId: string }) {
  const rule = routines.useGet(ruleId).data
  if (!rule) return null
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <Repeat size={13} className="text-slate-400" />
      {summarizeCadence(rule)}
      <Link to={`/routines/${ruleId}`} className="text-indigo-600 hover:underline">
        the series
      </Link>
    </p>
  )
}
