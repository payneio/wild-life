import { useState } from "react"
import { Save } from "lucide-react"
import { Button, Field, Input } from "@/components/ui/primitives"
import { usePreference, useSetPreference } from "@/services/api/hooks"
import { showActionToast } from "@/lib/toast"
import { cn } from "@/lib/utils"

interface CalendarPrefs {
  request_rsvp: boolean
  rsvp_options: string[]
  auto_send: boolean
  default_reminders: number[]
  organizer_from: string
  allow_propose_new_time: boolean
}

const ALL_RSVP_OPTIONS = ["accepted", "tentative", "declined"] as const

const DEFAULTS: CalendarPrefs = {
  request_rsvp: true,
  rsvp_options: ["accepted", "tentative", "declined"],
  auto_send: false,
  default_reminders: [1440, 60],
  organizer_from: "",
  allow_propose_new_time: false,
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  )
}

export function SettingsPage() {
  const { data } = usePreference<CalendarPrefs>("calendar")
  const setPref = useSetPreference("calendar")
  const [prefs, setPrefs] = useState<CalendarPrefs>(DEFAULTS)

  // Seed the editable form from the server value when it arrives (and if it
  // changes underneath us). "Adjust state during render" per React guidance —
  // the same pattern EditableRecord uses to re-sync from the server.
  const [syncedFrom, setSyncedFrom] = useState(data)
  if (data !== syncedFrom) {
    setSyncedFrom(data)
    if (data?.value) setPrefs({ ...DEFAULTS, ...data.value })
  }

  const set = <K extends keyof CalendarPrefs>(key: K, value: CalendarPrefs[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }))

  const toggleOption = (opt: string) =>
    set(
      "rsvp_options",
      prefs.rsvp_options.includes(opt)
        ? prefs.rsvp_options.filter((o) => o !== opt)
        : [...prefs.rsvp_options, opt],
    )

  const save = () =>
    setPref.mutate(prefs as unknown as Record<string, unknown>, {
      onSuccess: () => showActionToast("Calendar settings saved"),
    })

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Calendar &amp; invitations</p>
      </div>

      <section className="space-y-1 rounded-2xl border border-slate-200 bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Invitations</h2>

        <Toggle
          label="Request RSVPs"
          hint="Ask guests to respond when you invite them."
          checked={prefs.request_rsvp}
          onChange={(v) => set("request_rsvp", v)}
        />
        <Toggle
          label="Send automatically"
          hint="Send invitations as soon as you add guests, without a confirmation."
          checked={prefs.auto_send}
          onChange={(v) => set("auto_send", v)}
        />

        <Field label="RSVP responses offered" className="pt-2">
          <div className="flex flex-wrap gap-1.5">
            {ALL_RSVP_OPTIONS.map((opt) => {
              const on = prefs.rsvp_options.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleOption(opt)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs capitalize transition-colors",
                    on
                      ? "border-indigo-600 bg-indigo-600 text-on-accent"
                      : "border-slate-300 text-slate-600 hover:border-slate-400",
                  )}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Organizer address" className="pt-2">
          <Input
            value={prefs.organizer_from}
            placeholder="you@example.com (defaults to your Proton address)"
            onChange={(e) => set("organizer_from", e.target.value)}
          />
        </Field>
      </section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={setPref.isPending}>
          <Save size={14} /> {setPref.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}
