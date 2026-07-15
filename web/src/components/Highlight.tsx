import type { ReactNode } from "react"

/** Wrap case-insensitive matches of `q` in `<mark>` for search-result highlighting. */
export function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const out: ReactNode[] = []
  const low = text.toLowerCase()
  const ql = q.toLowerCase()
  let i = 0
  let idx = low.indexOf(ql)
  while (idx >= 0) {
    if (idx > i) out.push(text.slice(i, idx))
    out.push(
      <mark key={idx} className="rounded bg-amber-200/70 px-0.5 text-slate-900">
        {text.slice(idx, idx + q.length)}
      </mark>,
    )
    i = idx + q.length
    idx = low.indexOf(ql, i)
  }
  out.push(text.slice(i))
  return <>{out}</>
}
