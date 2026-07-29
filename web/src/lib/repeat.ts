/** How often a new occasion repeats, in our own vocabulary.
 *
 *  Lives apart from the control so the constant can be shared without breaking
 *  fast refresh, which only works when a module exports components alone. */
export interface Repeat {
  days: string[]
  everyWeeks: number
  until: string
}

/** The default, and the thing "Does not repeat" means. */
export const NO_REPEAT: Repeat = { days: [], everyWeeks: 0, until: "" }
