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
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
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
