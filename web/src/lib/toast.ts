// Minimal dependency-free toast. One stacked container, auto-dismiss.
// Used for reminders (click to navigate) and for write feedback (optional Undo).

let container: HTMLDivElement | null = null

function ensureContainer(): HTMLDivElement {
  if (container) return container
  container = document.createElement("div")
  container.style.cssText = [
    "position:fixed",
    "top:1rem",
    "right:1rem",
    "z-index:9999",
    "display:flex",
    "flex-direction:column",
    "gap:0.5rem",
    "max-width:24rem",
  ].join(";")
  document.body.appendChild(container)
  return container
}

interface ToastOpts {
  body?: string
  url?: string
  /** An inline action (e.g. Undo). Clicking it runs `onClick` and dismisses. */
  action?: { label: string; onClick: () => void }
  /** ms before auto-dismiss. */
  duration?: number
  tone?: "default" | "error"
}

function build(title: string, opts: ToastOpts): void {
  const root = ensureContainer()
  const el = document.createElement("div")
  el.style.cssText = [
    opts.tone === "error" ? "background:#7f1d1d" : "background:#1e293b",
    "color:#f8fafc",
    `border:1px solid ${opts.tone === "error" ? "#ef4444" : "#4f46e5"}`,
    "border-radius:0.6rem",
    "padding:0.7rem 0.9rem",
    "box-shadow:0 10px 30px rgba(0,0,0,0.35)",
    "font:500 14px/1.35 Inter,system-ui,sans-serif",
    "display:flex",
    "align-items:center",
    "gap:0.75rem",
    "opacity:0",
    "transition:opacity 0.15s ease",
  ].join(";")

  const text = document.createElement("div")
  const titleEl = document.createElement("div")
  titleEl.style.fontWeight = "600"
  titleEl.textContent = title
  text.appendChild(titleEl)
  if (opts.body) {
    const b = document.createElement("div")
    b.style.cssText = "opacity:0.8;margin-top:2px"
    b.textContent = opts.body
    text.appendChild(b)
  }
  el.appendChild(text)

  if (opts.url) {
    el.style.cursor = "pointer"
    el.onclick = () => {
      window.location.assign(opts.url!)
      el.remove()
    }
  }

  if (opts.action) {
    const btn = document.createElement("button")
    btn.textContent = opts.action.label
    btn.style.cssText =
      "flex:none;margin-left:auto;background:#4f46e5;color:#fff;border:none;border-radius:0.4rem;padding:0.3rem 0.7rem;font:600 13px Inter,system-ui;cursor:pointer"
    btn.onclick = (e) => {
      e.stopPropagation()
      opts.action!.onClick()
      el.remove()
    }
    el.appendChild(btn)
  }

  root.appendChild(el)
  requestAnimationFrame(() => (el.style.opacity = "1"))
  const ms = opts.duration ?? (opts.action ? 6000 : opts.tone === "error" ? 6000 : 4000)
  setTimeout(() => {
    el.style.opacity = "0"
    setTimeout(() => el.remove(), 200)
  }, ms)
}

/** Reminder / navigation toast (click to open `url`). */
export function showToast(title: string, body?: string, url?: string): void {
  build(title, { body, url })
}

/** A write-feedback toast with an optional inline action (e.g. Undo). */
export function showActionToast(
  title: string,
  action?: { label: string; onClick: () => void },
  tone: "default" | "error" = "default",
): void {
  build(title, { action, tone })
}
