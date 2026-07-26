import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react"
import { Minus, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md"

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-on-accent shadow-sm hover:bg-indigo-700 active:bg-indigo-700",
  secondary:
    "border border-slate-200 bg-surface text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300",
  ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
  danger:
    "border border-red-200 bg-surface text-red-600 shadow-sm hover:bg-red-50",
}

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-1.5 text-sm",
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[background,border,box-shadow,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-surface shadow-soft",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Badge({
  children,
  className,
  color,
}: {
  children: ReactNode
  className?: string
  color?: string | null
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        !color && "bg-slate-100 text-slate-600",
        className,
      )}
      style={
        color
          ? { backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }
          : undefined
      }
    >
      {children}
    </span>
  )
}

export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

const CONTROL =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(CONTROL, className)} {...props} />
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-24", className)} {...props} />
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, className)} {...props} />
}

const STEP_BTN =
  "flex w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-surface text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 active:scale-[0.97] disabled:opacity-40 disabled:hover:bg-surface"

/** Numeric input flanked by −/+ buttons, with an optional trailing unit. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  unit,
  autoFocus,
}: {
  value: number | null
  onChange: (v: number | null) => void
  step?: number
  min?: number
  unit?: string | null
  autoFocus?: boolean
}) {
  const clamp = (v: number) => Math.max(min, Math.round(v * 1000) / 1000)
  const cur = value ?? 0
  return (
    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        className={STEP_BTN}
        onClick={() => onChange(clamp(cur - step))}
        disabled={value != null && value <= min}
        aria-label="Decrease"
      >
        <Minus size={15} />
      </button>
      <div className="relative flex-1">
        <input
          type="number"
          step="any"
          min={min}
          autoFocus={autoFocus}
          className={cn(CONTROL, "text-center", unit && "pr-9")}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder="—"
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {unit}
          </span>
        )}
      </div>
      <button
        type="button"
        className={STEP_BTN}
        onClick={() => onChange(clamp(cur + step))}
        aria-label="Increase"
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-16 backdrop-blur-sm motion-safe:animate-[fadeIn_120ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200/80 bg-surface shadow-floating motion-safe:animate-[popIn_140ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}
