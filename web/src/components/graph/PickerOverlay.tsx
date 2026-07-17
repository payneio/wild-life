import { useCallback, useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * Responsive shell for the entity picker. On `lg+` it renders an anchored
 * popover positioned under the trigger (portaled to `body`, so it's never
 * clipped by a scrolling modal). On mobile it's a bottom sheet — the search
 * lands near the thumb, matching native quick-pick conventions.
 *
 * Positioning is imperative (a ref callback measures the anchor at commit),
 * which keeps the anchor out of render and avoids setState-in-effect. Both
 * variants close on Escape and on backdrop click.
 */
export function PickerOverlay({
  getAnchor,
  onClose,
  children,
}: {
  getAnchor: () => HTMLElement | null
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

  const place = useCallback(
    (el: HTMLDivElement | null) => {
      const anchor = getAnchor()
      if (!el || !anchor) return
      const r = anchor.getBoundingClientRect()
      const width = Math.max(r.width, 288)
      let left = r.left
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
      el.style.top = `${r.bottom + 6}px`
      el.style.left = `${Math.max(8, left)}px`
      el.style.width = `${width}px`
    },
    [getAnchor],
  )

  return createPortal(
    <>
      {/* Mobile: bottom sheet */}
      <div className="fixed inset-0 z-[60] lg:hidden">
        <div
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm motion-safe:animate-[fadeIn_120ms_ease-out]"
          onClick={onClose}
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-hidden rounded-t-3xl border-t border-slate-200 bg-surface pb-[env(safe-area-inset-bottom)] shadow-floating motion-safe:animate-[slideUp_200ms_ease-out]">
          {children}
        </div>
      </div>

      {/* Desktop: anchored popover */}
      <div className="fixed inset-0 z-[60] hidden lg:block">
        <div className="absolute inset-0" onClick={onClose} aria-hidden />
        <div
          ref={place}
          className="absolute overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-floating motion-safe:animate-[popIn_120ms_ease-out]"
        >
          {children}
        </div>
      </div>
    </>,
    document.body,
  )
}
