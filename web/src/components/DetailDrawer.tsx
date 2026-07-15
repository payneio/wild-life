import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"

/**
 * Responsive detail overlay: a right-hand slide-over on ≥md, full-screen on
 * mobile. Open/close is driven by the caller (route-param based); `onClose`
 * should navigate back to the list.
 */
export function DetailDrawer({
  title,
  onClose,
  children,
  actions,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex h-full w-full flex-col bg-white shadow-xl md:max-w-xl">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <button
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
