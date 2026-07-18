import { useEffect, useState } from "react"

/**
 * Temporary diagnostic: append `?overflow` to any URL to highlight every element
 * whose box extends past the viewport width (the cause of horizontal scroll on
 * mobile) with a red outline, and list the offenders in a panel. Inert unless the
 * param is present. Safe to leave in; remove once the layout bug is found.
 */
export function OverflowDebug() {
  const on =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("overflow")
  const [rows, setRows] = useState<string[]>([])
  const [vw, setVw] = useState(0)

  useEffect(() => {
    if (!on) return
    const scan = () => {
      const width = document.documentElement.clientWidth
      setVw(width)
      const found: string[] = []
      document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
        if (el.closest("#overflow-debug-panel")) return
        el.style.outline = ""
        const r = el.getBoundingClientRect()
        if (r.width === 0) return
        if (r.right > width + 1 || r.left < -1) {
          el.style.outline = "2px solid red"
          el.style.outlineOffset = "-1px"
          const cls =
            typeof el.className === "string" ? el.className.trim().replace(/\s+/g, ".") : ""
          found.push(
            `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`.slice(0, 90) +
              `  [${Math.round(r.left)}→${Math.round(r.right)}]`,
          )
        }
      })
      // Narrowest offenders first are usually the innermost real cause.
      setRows(found.slice(0, 20))
    }
    scan()
    const t = setTimeout(scan, 900) // catch async-loaded content
    return () => clearTimeout(t)
  }, [on])

  if (!on) return null
  return (
    <div
      id="overflow-debug-panel"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.9)",
        color: "#4ade80",
        font: "10px/1.4 monospace",
        padding: "8px 10px",
        maxHeight: "45vh",
        overflow: "auto",
      }}
    >
      <div style={{ color: "#fff", marginBottom: 4 }}>
        viewport {vw}px — {rows.length} element(s) past the edge:
      </div>
      {rows.map((r, i) => (
        <div key={i}>{r}</div>
      ))}
      {rows.length === 0 && <div>none found — try rotating / re-open with ?overflow</div>}
    </div>
  )
}
