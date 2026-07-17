// Minimal dependency-free toast for in-app reminders (open, focused tab).
// One stacked container, auto-dismiss, click to navigate.

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
    "max-width:22rem",
  ].join(";")
  document.body.appendChild(container)
  return container
}

export function showToast(title: string, body?: string, url?: string): void {
  const root = ensureContainer()
  const el = document.createElement("div")
  el.style.cssText = [
    "background:#1e293b",
    "color:#f8fafc",
    "border:1px solid #4f46e5",
    "border-radius:0.6rem",
    "padding:0.75rem 0.9rem",
    "box-shadow:0 10px 30px rgba(0,0,0,0.35)",
    "font:500 14px/1.35 Inter,system-ui,sans-serif",
    "cursor:pointer",
    "opacity:0",
    "transition:opacity 0.15s ease",
  ].join(";")
  el.innerHTML = `<div style="font-weight:600">${escapeHtml(title)}</div>${
    body ? `<div style="opacity:0.8;margin-top:2px">${escapeHtml(body)}</div>` : ""
  }`
  el.onclick = () => {
    if (url) window.location.assign(url)
    el.remove()
  }
  root.appendChild(el)
  requestAnimationFrame(() => (el.style.opacity = "1"))
  setTimeout(() => {
    el.style.opacity = "0"
    setTimeout(() => el.remove(), 200)
  }, 8000)
}

function escapeHtml(s: string): string {
  const d = document.createElement("div")
  d.textContent = s
  return d.innerHTML
}
