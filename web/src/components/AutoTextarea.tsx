import { useImperativeHandle, useLayoutEffect, useRef } from "react"

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: React.Ref<HTMLTextAreaElement>
}

/** A textarea that grows with its content (no inner scrollbar). */
export function AutoTextarea({ ref, value, className, ...props }: Props) {
  const inner = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement, [])
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    // Measuring content height means collapsing to `auto` first, and for the
    // length of this synchronous block the element is one row tall — the
    // document is shorter by everything the textarea was. The browser clamps
    // any scroll position past that shorter maximum on the reflow that reading
    // `scrollHeight` forces, and putting the height back does **not** put the
    // scroll back. Editing a 1,700px log entry near the bottom of a task page
    // therefore threw the page ~1,000px upward on every keystroke (measured:
    // 1800 → 790). So the position is carried across the measurement.
    const doc = document.scrollingElement ?? document.documentElement
    const top = doc.scrollTop
    // Any scrolling ancestor can be clamped the same way — a textarea inside a
    // modal body or an overflow panel scrolls something other than the page.
    const nested: [Element, number][] = []
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (n.scrollTop > 0) nested.push([n, n.scrollTop])
    }

    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`

    if (doc.scrollTop !== top) doc.scrollTop = top
    for (const [n, t] of nested) if (n.scrollTop !== t) n.scrollTop = t
  }, [value])
  return (
    <textarea
      ref={inner}
      value={value}
      rows={1}
      className={`resize-none overflow-hidden ${className ?? ""}`}
      {...props}
    />
  )
}
